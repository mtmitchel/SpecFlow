import { access, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { writeFileAtomic } from "../io/atomic-write.js";
import {
  attemptDir,
  configPath,
  decisionsDir,
  initiativeDir,
  initiativeYamlPath,
  initiativesDir,
  operationAttemptDir,
  operationDir,
  operationManifestPath,
  runDir,
  runTmpDir,
  runYamlPath,
  runsDir,
  specflowDir,
  ticketPath,
  ticketsDir,
  verificationPath
} from "../io/paths.js";
import { readYamlFile, writeYamlFile } from "../io/yaml.js";
import { NotFoundError, RetryableConflictError } from "./errors.js";
import type {
  Config,
  Initiative,
  OperationManifest,
  OperationState,
  Run,
  RunAttempt,
  SpecDocument,
  Ticket
} from "../types/entities.js";

export interface StoreStartupOptions {
  watch?: boolean;
  cleanup?: boolean;
}

export interface PreparedOperationArtifacts {
  bundleFlat?: string;
  bundleManifest?: unknown;
  verification?: RunAttempt;
  primaryDiff?: string;
  driftDiff?: string;
  additionalFiles?: Array<{
    relativePath: string;
    content: string;
  }>;
}

export interface PrepareOperationInput {
  runId: string;
  operationId: string;
  attemptId: string;
  leaseMs: number;
  artifacts: PreparedOperationArtifacts;
  validation?: {
    passed: boolean;
    details?: string;
  };
}

export interface CommitOperationInput {
  runId: string;
  operationId: string;
}

export interface ArtifactStoreOptions {
  rootDir: string;
  cleanupTtlMs?: number;
  cleanupIntervalMs?: number;
  now?: () => Date;
}

export class ArtifactStore {
  public config: Config | null = null;
  public readonly initiatives = new Map<string, Initiative>();
  public readonly tickets = new Map<string, Ticket>();
  public readonly runs = new Map<string, Run>();
  public readonly runAttempts = new Map<string, RunAttempt>();
  public readonly specs = new Map<string, SpecDocument>();

  private readonly rootDir: string;
  private readonly cleanupTtlMs: number;
  private readonly cleanupIntervalMs: number;
  private readonly now: () => Date;
  private readonly writeLocks = new Map<string, string>();

  private watcher: FSWatcher | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private reloadTimer: NodeJS.Timeout | null = null;
  private reloadInFlight: Promise<void> | null = null;

  public constructor(options: ArtifactStoreOptions) {
    this.rootDir = options.rootDir;
    this.cleanupTtlMs = options.cleanupTtlMs ?? 24 * 60 * 60 * 1000;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? 5 * 60 * 1000;
    this.now = options.now ?? (() => new Date());
  }

  public async initialize(options: StoreStartupOptions = {}): Promise<void> {
    await this.reloadFromDisk();
    await this.recoverOrphanOperations();
    await this.reloadFromDisk();

    if (options.watch) {
      await this.startWatcher();
    }

    if (options.cleanup) {
      this.startCleanupTask();
    }
  }

  public async close(): Promise<void> {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  public async reloadFromDisk(): Promise<void> {
    this.config = await readYamlFile<Config>(configPath(this.rootDir));

    this.initiatives.clear();
    this.tickets.clear();
    this.runs.clear();
    this.runAttempts.clear();
    this.specs.clear();

    await Promise.all([this.loadInitiatives(), this.loadTickets(), this.loadRuns(), this.loadDecisions()]);
  }

  public async upsertConfig(config: Config): Promise<void> {
    await writeYamlFile(configPath(this.rootDir), config);
    this.config = config;
  }

  public async upsertInitiative(
    initiative: Initiative,
    docs: { brief?: string; prd?: string; techSpec?: string } = {}
  ): Promise<void> {
    const dir = initiativeDir(this.rootDir, initiative.id);
    await mkdir(dir, { recursive: true });
    await writeYamlFile(initiativeYamlPath(this.rootDir, initiative.id), initiative);

    if (docs.brief !== undefined) {
      await writeFileAtomic(path.join(dir, "brief.md"), docs.brief);
    }

    if (docs.prd !== undefined) {
      await writeFileAtomic(path.join(dir, "prd.md"), docs.prd);
    }

    if (docs.techSpec !== undefined) {
      await writeFileAtomic(path.join(dir, "tech-spec.md"), docs.techSpec);
    }

    await this.reloadFromDisk();
  }

  public async upsertTicket(ticket: Ticket): Promise<void> {
    await writeYamlFile(ticketPath(this.rootDir, ticket.id), ticket);
    this.tickets.set(ticket.id, ticket);
  }

  public async upsertRun(run: Run): Promise<void> {
    await writeYamlFile(runYamlPath(this.rootDir, run.id), run);
    this.runs.set(run.id, run);
  }

  public async upsertRunAttempt(runId: string, attempt: RunAttempt): Promise<void> {
    const filePath = verificationPath(this.rootDir, runId, attempt.attemptId);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFileAtomic(filePath, JSON.stringify(attempt, null, 2));
    this.runAttempts.set(this.runAttemptKey(runId, attempt.attemptId), attempt);
  }

  public async upsertSpec(spec: SpecDocument): Promise<void> {
    if (spec.type === "decision") {
      const filePath = path.join(decisionsDir(this.rootDir), `${spec.id}.md`);
      await writeFileAtomic(filePath, spec.content);
    } else {
      if (!spec.initiativeId) {
        throw new Error("initiativeId is required for non-decision specs");
      }

      const fileName = this.specTypeToFileName(spec.type);
      const filePath = path.join(initiativeDir(this.rootDir, spec.initiativeId), fileName);
      await writeFileAtomic(filePath, spec.content);
    }

    await this.reloadFromDisk();
  }

  public async prepareRunOperation(input: PrepareOperationInput): Promise<OperationManifest> {
    await this.ensureRunWritable(input.runId, input.operationId);

    const run = this.runs.get(input.runId);
    if (!run) {
      throw new NotFoundError(`Run ${input.runId} not found`);
    }

    this.writeLocks.set(input.runId, input.operationId);

    try {
      const operationRoot = operationDir(this.rootDir, input.runId, input.operationId);
      const stagedAttemptDir = operationAttemptDir(
        this.rootDir,
        input.runId,
        input.operationId,
        input.attemptId
      );

      await mkdir(stagedAttemptDir, { recursive: true });
      await this.writePreparedArtifacts(stagedAttemptDir, input.artifacts);

      const nowIso = this.now().toISOString();
      const manifest: OperationManifest = {
        operationId: input.operationId,
        runId: input.runId,
        targetAttemptId: input.attemptId,
        state: "prepared",
        leaseExpiresAt: new Date(this.now().getTime() + input.leaseMs).toISOString(),
        validation: {
          passed: input.validation?.passed ?? true,
          details: input.validation?.details
        },
        preparedAt: nowIso,
        updatedAt: nowIso
      };

      await mkdir(operationRoot, { recursive: true });
      await writeYamlFile(operationManifestPath(this.rootDir, input.runId, input.operationId), manifest);

      const updatedRun: Run = {
        ...run,
        activeOperationId: input.operationId,
        operationLeaseExpiresAt: manifest.leaseExpiresAt
      };

      await this.upsertRun(updatedRun);
      await this.reloadFromDisk();

      return manifest;
    } finally {
      this.writeLocks.delete(input.runId);
    }
  }

  public async commitRunOperation(input: CommitOperationInput): Promise<Run> {
    await this.ensureRunWritable(input.runId, input.operationId);

    const run = this.runs.get(input.runId);
    if (!run) {
      throw new NotFoundError(`Run ${input.runId} not found`);
    }

    if (run.activeOperationId !== input.operationId) {
      throw new RetryableConflictError(
        `Run ${input.runId} is locked by operation ${run.activeOperationId ?? "none"}`
      );
    }

    this.writeLocks.set(input.runId, input.operationId);

    try {
      const manifestPath = operationManifestPath(this.rootDir, input.runId, input.operationId);
      const manifest = await readYamlFile<OperationManifest>(manifestPath);

      if (!manifest) {
        throw new NotFoundError(`Operation manifest missing for ${input.operationId}`);
      }

      if (manifest.state === "committed") {
        return run;
      }

      if (this.isLeaseExpired(manifest.leaseExpiresAt)) {
        await this.markOperationState(input.runId, input.operationId, "abandoned");
        await this.clearRunOperationPointer(input.runId);
        throw new RetryableConflictError(`Operation ${input.operationId} lease expired before commit`);
      }

      const stagedAttempt = operationAttemptDir(
        this.rootDir,
        input.runId,
        input.operationId,
        manifest.targetAttemptId
      );
      const committedAttempt = attemptDir(this.rootDir, input.runId, manifest.targetAttemptId);

      await rm(committedAttempt, { recursive: true, force: true });
      await mkdir(path.dirname(committedAttempt), { recursive: true });
      await cp(stagedAttempt, committedAttempt, { recursive: true });

      const nowIso = this.now().toISOString();
      const updatedManifest: OperationManifest = {
        ...manifest,
        state: "committed",
        updatedAt: nowIso,
        committedAt: nowIso
      };
      await writeYamlFile(manifestPath, updatedManifest);

      const updatedRun: Run = {
        ...run,
        attempts: this.uniquePush(run.attempts, manifest.targetAttemptId),
        committedAttemptId: manifest.targetAttemptId,
        activeOperationId: null,
        operationLeaseExpiresAt: null,
        lastCommittedAt: nowIso,
        status: "complete"
      };
      await this.upsertRun(updatedRun);
      await this.reloadFromDisk();

      const committedRun = this.runs.get(input.runId);
      if (!committedRun) {
        throw new NotFoundError(`Run ${input.runId} disappeared after commit`);
      }

      return committedRun;
    } finally {
      this.writeLocks.delete(input.runId);
    }
  }

  public async markOperationState(
    runId: string,
    operationId: string,
    state: OperationState
  ): Promise<OperationManifest> {
    const manifestPath = operationManifestPath(this.rootDir, runId, operationId);
    const existing = await readYamlFile<OperationManifest>(manifestPath);
    const nowIso = this.now().toISOString();

    const manifest: OperationManifest = existing ?? {
      operationId,
      runId,
      targetAttemptId: "unknown",
      state,
      leaseExpiresAt: nowIso,
      validation: { passed: false, details: "recovered without prior manifest" },
      preparedAt: nowIso,
      updatedAt: nowIso
    };

    manifest.state = state;
    manifest.updatedAt = nowIso;

    await writeYamlFile(manifestPath, manifest);
    return manifest;
  }

  public startCleanupTask(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      void this.pruneExpiredTempOperations();
    }, this.cleanupIntervalMs);
  }

  public async pruneExpiredTempOperations(): Promise<void> {
    const allRunDirs = await this.listDirectoryNames(runsDir(this.rootDir));

    for (const runId of allRunDirs) {
      const tmpRoot = runTmpDir(this.rootDir, runId);
      const operationIds = await this.listDirectoryNames(tmpRoot);

      for (const operationId of operationIds) {
        const opPath = operationDir(this.rootDir, runId, operationId);
        const manifest = await readYamlFile<OperationManifest>(
          operationManifestPath(this.rootDir, runId, operationId)
        );

        if (!manifest) {
          continue;
        }

        if (manifest.state !== "abandoned" && manifest.state !== "superseded") {
          continue;
        }

        const updatedAt = Date.parse(manifest.updatedAt);
        if (Number.isNaN(updatedAt)) {
          continue;
        }

        if (this.now().getTime() - updatedAt > this.cleanupTtlMs) {
          await rm(opPath, { recursive: true, force: true });
        }
      }
    }
  }

  public async startWatcher(): Promise<void> {
    if (this.watcher) {
      return;
    }

    const root = specflowDir(this.rootDir);
    await mkdir(root, { recursive: true });

    this.watcher = chokidar.watch(root, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 120,
        pollInterval: 50
      }
    });

    this.watcher.on("all", (_eventName, changedPath) => {
      if (!this.isReloadablePath(changedPath)) {
        return;
      }

      this.scheduleReload();
    });

    await new Promise<void>((resolve) => {
      this.watcher?.once("ready", () => resolve());
    });
  }

  public async recoverOrphanOperations(): Promise<void> {
    for (const run of this.runs.values()) {
      if (!run.activeOperationId) {
        continue;
      }

      const opId = run.activeOperationId;
      const opDir = operationDir(this.rootDir, run.id, opId);
      const hasTmp = await this.pathExists(opDir);

      if (!hasTmp) {
        await this.markOperationState(run.id, opId, "failed");
        await this.clearRunOperationPointer(run.id);
        continue;
      }

      const committedAttemptExists =
        run.committedAttemptId !== null &&
        (await this.pathExists(attemptDir(this.rootDir, run.id, run.committedAttemptId)));

      if (committedAttemptExists) {
        await this.markOperationState(run.id, opId, "superseded");
        await this.clearRunOperationPointer(run.id);
        continue;
      }

      await this.markOperationState(run.id, opId, "abandoned");
      await this.clearRunOperationPointer(run.id);
    }
  }

  public async getOperationStatus(operationId: string): Promise<
    | {
        operationId: string;
        runId: string;
        targetAttemptId: string;
        state: OperationState;
        leaseExpiresAt: string;
        updatedAt: string;
      }
    | null
  > {
    const runIds = await this.listDirectoryNames(runsDir(this.rootDir));

    for (const runId of runIds) {
      const manifest = await readYamlFile<OperationManifest>(
        operationManifestPath(this.rootDir, runId, operationId)
      );

      if (!manifest) {
        continue;
      }

      return {
        operationId: manifest.operationId,
        runId: manifest.runId,
        targetAttemptId: manifest.targetAttemptId,
        state: manifest.state,
        leaseExpiresAt: manifest.leaseExpiresAt,
        updatedAt: manifest.updatedAt
      };
    }

    return null;
  }

  private async clearRunOperationPointer(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) {
      return;
    }

    const updatedRun: Run = {
      ...run,
      activeOperationId: null,
      operationLeaseExpiresAt: null
    };

    await writeYamlFile(runYamlPath(this.rootDir, runId), updatedRun);
    this.runs.set(runId, updatedRun);
  }

  private async ensureRunWritable(runId: string, requestedOperationId: string): Promise<void> {
    const lockOwner = this.writeLocks.get(runId);
    if (lockOwner && lockOwner !== requestedOperationId) {
      throw new RetryableConflictError(`Run ${runId} is currently locked by ${lockOwner}`);
    }

    const run = this.runs.get(runId);
    if (!run) {
      throw new NotFoundError(`Run ${runId} not found`);
    }

    if (!run.activeOperationId) {
      return;
    }

    if (run.activeOperationId !== requestedOperationId && !this.isLeaseExpired(run.operationLeaseExpiresAt)) {
      throw new RetryableConflictError(
        `Run ${runId} has an active operation ${run.activeOperationId}; retry later`
      );
    }

    if (this.isLeaseExpired(run.operationLeaseExpiresAt)) {
      await this.markOperationState(runId, run.activeOperationId, "abandoned");
      await this.clearRunOperationPointer(runId);
      await this.reloadFromDisk();

      if (run.activeOperationId === requestedOperationId) {
        throw new RetryableConflictError(`Operation ${requestedOperationId} lease expired and was abandoned`);
      }
    }
  }

  private isLeaseExpired(leaseExpiresAt: string | null): boolean {
    if (!leaseExpiresAt) {
      return false;
    }

    return Date.parse(leaseExpiresAt) <= this.now().getTime();
  }

  private async writePreparedArtifacts(
    stagedAttemptDir: string,
    artifacts: PreparedOperationArtifacts
  ): Promise<void> {
    if (artifacts.bundleFlat !== undefined) {
      await writeFileAtomic(path.join(stagedAttemptDir, "bundle-flat.md"), artifacts.bundleFlat);
    }

    if (artifacts.bundleManifest !== undefined) {
      await writeYamlFile(path.join(stagedAttemptDir, "bundle-manifest.yaml"), artifacts.bundleManifest);
    }

    if (artifacts.primaryDiff !== undefined) {
      await writeFileAtomic(path.join(stagedAttemptDir, "diff-primary.patch"), artifacts.primaryDiff);
    }

    if (artifacts.driftDiff !== undefined) {
      await writeFileAtomic(path.join(stagedAttemptDir, "diff-drift.patch"), artifacts.driftDiff);
    }

    if (artifacts.verification !== undefined) {
      await writeFileAtomic(
        path.join(stagedAttemptDir, "verification.json"),
        JSON.stringify(artifacts.verification, null, 2)
      );
    }

    for (const file of artifacts.additionalFiles ?? []) {
      const destination = path.resolve(stagedAttemptDir, file.relativePath);
      const normalizedStagedRoot = `${path.resolve(stagedAttemptDir)}${path.sep}`;
      if (!destination.startsWith(normalizedStagedRoot)) {
        throw new Error(`Invalid staged artifact path '${file.relativePath}'`);
      }

      await writeFileAtomic(destination, file.content);
    }
  }

  private scheduleReload(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }

    this.reloadTimer = setTimeout(() => {
      void this.queueReload();
    }, 150);
  }

  private async queueReload(): Promise<void> {
    if (this.reloadInFlight) {
      await this.reloadInFlight;
      return;
    }

    this.reloadInFlight = this.reloadFromDisk().finally(() => {
      this.reloadInFlight = null;
    });

    await this.reloadInFlight;
  }

  private async loadInitiatives(): Promise<void> {
    const ids = await this.listDirectoryNames(initiativesDir(this.rootDir));

    for (const id of ids) {
      const initiative = await readYamlFile<Initiative>(initiativeYamlPath(this.rootDir, id));
      if (!initiative) {
        continue;
      }

      this.initiatives.set(initiative.id, initiative);

      const docTuples: Array<{ fileName: string; type: SpecDocument["type"]; title: string }> = [
        { fileName: "brief.md", type: "brief", title: "Brief" },
        { fileName: "prd.md", type: "prd", title: "PRD" },
        { fileName: "tech-spec.md", type: "tech-spec", title: "Tech Spec" }
      ];

      for (const doc of docTuples) {
        const filePath = path.join(initiativeDir(this.rootDir, id), doc.fileName);
        if (!(await this.pathExists(filePath))) {
          continue;
        }

        const content = await readFile(filePath, "utf8");
        const fileStat = await stat(filePath);
        const specId = `${initiative.id}:${doc.type}`;

        this.specs.set(specId, {
          id: specId,
          initiativeId: initiative.id,
          type: doc.type,
          title: doc.title,
          content,
          sourcePath: filePath,
          createdAt: fileStat.birthtime.toISOString(),
          updatedAt: fileStat.mtime.toISOString()
        });
      }
    }
  }

  private async loadTickets(): Promise<void> {
    const fileNames = await this.listFileNames(ticketsDir(this.rootDir));

    for (const fileName of fileNames) {
      if (!fileName.endsWith(".yaml") && !fileName.endsWith(".yml")) {
        continue;
      }

      const ticket = await readYamlFile<Ticket>(path.join(ticketsDir(this.rootDir), fileName));
      if (ticket) {
        this.tickets.set(ticket.id, ticket);
      }
    }
  }

  private async loadRuns(): Promise<void> {
    const runIds = await this.listDirectoryNames(runsDir(this.rootDir));

    for (const runId of runIds) {
      const run = await readYamlFile<Run>(runYamlPath(this.rootDir, runId));
      if (!run) {
        continue;
      }

      this.runs.set(run.id, run);

      const attemptIds = await this.listDirectoryNames(path.join(runDir(this.rootDir, runId), "attempts"));
      for (const attemptId of attemptIds) {
        const verificationFile = verificationPath(this.rootDir, runId, attemptId);
        if (!(await this.pathExists(verificationFile))) {
          continue;
        }

        const raw = await readFile(verificationFile, "utf8");
        const attempt = JSON.parse(raw) as RunAttempt;
        this.runAttempts.set(this.runAttemptKey(run.id, attemptId), attempt);
      }
    }
  }

  private async loadDecisions(): Promise<void> {
    const fileNames = await this.listFileNames(decisionsDir(this.rootDir));

    for (const fileName of fileNames) {
      if (!fileName.endsWith(".md")) {
        continue;
      }

      const filePath = path.join(decisionsDir(this.rootDir), fileName);
      const content = await readFile(filePath, "utf8");
      const fileStat = await stat(filePath);
      const decisionId = path.basename(fileName, ".md");

      this.specs.set(`decision:${decisionId}`, {
        id: decisionId,
        initiativeId: null,
        type: "decision",
        title: decisionId,
        content,
        sourcePath: filePath,
        createdAt: fileStat.birthtime.toISOString(),
        updatedAt: fileStat.mtime.toISOString()
      });
    }
  }

  private specTypeToFileName(type: SpecDocument["type"]): string {
    switch (type) {
      case "brief":
        return "brief.md";
      case "prd":
        return "prd.md";
      case "tech-spec":
        return "tech-spec.md";
      case "decision":
        return "decision.md";
      default: {
        const exhaustive: never = type;
        throw new Error(`Unhandled spec type: ${String(exhaustive)}`);
      }
    }
  }

  private async listDirectoryNames(targetPath: string): Promise<string[]> {
    try {
      const entries = await readdir(targetPath, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async listFileNames(targetPath: string): Promise<string[]> {
    try {
      const entries = await readdir(targetPath, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  private isReloadablePath(filePath: string): boolean {
    return [".yaml", ".yml", ".md", ".json"].includes(path.extname(filePath));
  }

  private runAttemptKey(runId: string, attemptId: string): string {
    return `${runId}:${attemptId}`;
  }

  private uniquePush(items: string[], value: string): string[] {
    return items.includes(value) ? items : [...items, value];
  }
}
