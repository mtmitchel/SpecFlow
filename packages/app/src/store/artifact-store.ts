import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FSWatcher } from "chokidar";
import { writeFileAtomic } from "../io/atomic-write.js";
import {
  configPath,
  decisionsDir,
  initiativeDir,
  initiativeYamlPath,
  operationManifestPath,
  runYamlPath,
  ticketPath,
  verificationPath
} from "../io/paths.js";
import { readYamlFile, writeYamlFile } from "../io/yaml.js";
import { pruneExpiredTempOperations as pruneExpiredTempOperationsInternal } from "./internal/cleanup.js";
import { loadDecisions, loadInitiatives, loadRuns, loadTickets } from "./internal/loaders.js";
import {
  commitRunOperation as commitRunOperationInternal,
  getOperationStatus as getOperationStatusInternal,
  markOperationState as markOperationStateInternal,
  prepareRunOperation as prepareRunOperationInternal
} from "./internal/operations.js";
import {
  clearRunOperationPointer as clearRunOperationPointerInternal,
  recoverOrphanOperations as recoverOrphanOperationsInternal
} from "./internal/recovery.js";
import { createSpecflowWatcher } from "./internal/watcher.js";
import { NotFoundError, RetryableConflictError } from "./errors.js";
import type { PreparedOperationArtifacts } from "./types.js";
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

export type { PreparedOperationArtifacts } from "./types.js";

export interface StoreStartupOptions {
  watch?: boolean;
  cleanup?: boolean;
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
  private readonly operationIndex = new Map<string, string>();

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

    await Promise.all([
      loadInitiatives({
        rootDir: this.rootDir,
        initiatives: this.initiatives,
        specs: this.specs
      }),
      loadTickets({
        rootDir: this.rootDir,
        tickets: this.tickets
      }),
      loadRuns({
        rootDir: this.rootDir,
        runs: this.runs,
        runAttempts: this.runAttempts,
        runAttemptKey: (runId, attemptId) => this.runAttemptKey(runId, attemptId)
      }),
      loadDecisions({
        rootDir: this.rootDir,
        specs: this.specs
      })
    ]);

    this.rebuildOperationIndex();
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

    const hasDocChanges = docs.brief !== undefined || docs.prd !== undefined || docs.techSpec !== undefined;

    if (docs.brief !== undefined) {
      await writeFileAtomic(path.join(dir, "brief.md"), docs.brief);
    }

    if (docs.prd !== undefined) {
      await writeFileAtomic(path.join(dir, "prd.md"), docs.prd);
    }

    if (docs.techSpec !== undefined) {
      await writeFileAtomic(path.join(dir, "tech-spec.md"), docs.techSpec);
    }

    if (hasDocChanges) {
      await this.reloadFromDisk();
    } else {
      this.initiatives.set(initiative.id, initiative);
    }
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
    const manifest = await prepareRunOperationInternal(
      {
        rootDir: this.rootDir,
        now: this.now,
        runs: this.runs,
        writeLocks: this.writeLocks,
        ensureRunWritable: (runId, requestedOperationId) => this.ensureRunWritable(runId, requestedOperationId),
        writePreparedArtifacts: (stagedAttemptDir, artifacts) => this.writePreparedArtifacts(stagedAttemptDir, artifacts),
        upsertRun: (run) => this.upsertRun(run),
        reloadFromDisk: () => this.reloadFromDisk(),
        markOperationState: (runId, operationId, state) => this.markOperationState(runId, operationId, state),
        clearRunOperationPointer: (runId) => this.clearRunOperationPointer(runId),
        isLeaseExpired: (leaseExpiresAt) => this.isLeaseExpired(leaseExpiresAt),
        uniquePush: (items, value) => this.uniquePush(items, value)
      },
      input
    );
    this.operationIndex.set(input.operationId, input.runId);
    return manifest;
  }

  public async commitRunOperation(input: CommitOperationInput): Promise<Run> {
    const run = await commitRunOperationInternal(
      {
        rootDir: this.rootDir,
        now: this.now,
        runs: this.runs,
        writeLocks: this.writeLocks,
        ensureRunWritable: (runId, requestedOperationId) => this.ensureRunWritable(runId, requestedOperationId),
        writePreparedArtifacts: (stagedAttemptDir, artifacts) => this.writePreparedArtifacts(stagedAttemptDir, artifacts),
        upsertRun: (run) => this.upsertRun(run),
        reloadFromDisk: () => this.reloadFromDisk(),
        markOperationState: (runId, operationId, state) => this.markOperationState(runId, operationId, state),
        clearRunOperationPointer: (runId) => this.clearRunOperationPointer(runId),
        isLeaseExpired: (leaseExpiresAt) => this.isLeaseExpired(leaseExpiresAt),
        uniquePush: (items, value) => this.uniquePush(items, value)
      },
      input
    );
    this.operationIndex.delete(input.operationId);
    return run;
  }

  public async markOperationState(
    runId: string,
    operationId: string,
    state: OperationState
  ): Promise<OperationManifest> {
    return markOperationStateInternal(this.rootDir, this.now, runId, operationId, state);
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
    await pruneExpiredTempOperationsInternal({
      rootDir: this.rootDir,
      now: this.now,
      cleanupTtlMs: this.cleanupTtlMs
    });
  }

  public async startWatcher(): Promise<void> {
    if (this.watcher) {
      return;
    }

    this.watcher = await createSpecflowWatcher(this.rootDir, () => {
      this.scheduleReload();
    });
  }

  public async recoverOrphanOperations(): Promise<void> {
    await recoverOrphanOperationsInternal({
      rootDir: this.rootDir,
      runs: this.runs,
      markOperationState: (runId, operationId, state) => this.markOperationState(runId, operationId, state),
      clearRunOperationPointer: (runId) => this.clearRunOperationPointer(runId)
    });
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
    const indexedRunId = this.operationIndex.get(operationId);
    if (indexedRunId) {
      const manifest = await readYamlFile<OperationManifest>(
        operationManifestPath(this.rootDir, indexedRunId, operationId)
      );
      if (manifest) {
        return {
          operationId: manifest.operationId,
          runId: manifest.runId,
          targetAttemptId: manifest.targetAttemptId,
          state: manifest.state,
          leaseExpiresAt: manifest.leaseExpiresAt,
          updatedAt: manifest.updatedAt
        };
      }
    }

    return getOperationStatusInternal(this.rootDir, operationId);
  }

  private async clearRunOperationPointer(runId: string): Promise<void> {
    await clearRunOperationPointerInternal(this.rootDir, this.runs, runId);
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

  private runAttemptKey(runId: string, attemptId: string): string {
    return `${runId}:${attemptId}`;
  }

  private uniquePush(items: string[], value: string): string[] {
    return items.includes(value) ? items : [...items, value];
  }

  private rebuildOperationIndex(): void {
    this.operationIndex.clear();
    for (const [runId, run] of this.runs) {
      if (run.activeOperationId) {
        this.operationIndex.set(run.activeOperationId, runId);
      }
    }
  }
}
