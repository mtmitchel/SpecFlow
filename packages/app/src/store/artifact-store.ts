import { mkdir } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomic } from "../io/atomic-write.js";
import {
  configPath,
  decisionsDir,
  initiativeDir,
  initiativeTicketCoveragePath,
  initiativeReviewPath,
  initiativeTracePath,
  initiativeYamlPath,
  operationManifestPath,
  runDir,
  runYamlPath,
  ticketPath,
  verificationPath
} from "../io/paths.js";
import { normalizeInitiativeWorkflow } from "../planner/workflow-state.js";
import { readYamlFile } from "../io/yaml.js";
import { writeYamlFile } from "../io/yaml.js";
import { pruneExpiredTempOperations as pruneExpiredTempOperationsInternal } from "./internal/cleanup.js";
import { loadStoreSnapshot, replaceMapContents } from "./internal/reload.js";
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
import { writePreparedArtifacts } from "./internal/artifact-writer.js";
import { specTypeToFileName } from "./internal/spec-utils.js";
import { type SpecflowWatcher, createSpecflowWatcher } from "./internal/watcher.js";
import { NotFoundError, RetryableConflictError } from "./errors.js";
import type { PreparedOperationArtifacts } from "./types.js";
import type {
  ArtifactTraceOutline,
  Config,
  Initiative,
  OperationManifest,
  OperationState,
  PlanningReviewArtifact,
  Run,
  RunAttempt,
  SpecDocument,
  TicketCoverageArtifact,
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
  public readonly planningReviews = new Map<string, PlanningReviewArtifact>();
  public readonly ticketCoverageArtifacts = new Map<string, TicketCoverageArtifact>();
  public readonly artifactTraces = new Map<string, ArtifactTraceOutline>();

  private readonly rootDir: string;
  private readonly cleanupTtlMs: number;
  private readonly cleanupIntervalMs: number;
  private readonly now: () => Date;
  private readonly writeLocks = new Map<string, string>();
  private readonly operationIndex = new Map<string, string>();

  private watcher: SpecflowWatcher | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
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
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.watcher) {
      this.watcher.destroy();
      await this.watcher.close();
      this.watcher = null;
    }
  }

  public async reloadFromDisk(): Promise<void> {
    if (this.reloadInFlight) {
      await this.reloadInFlight;
      return;
    }
    this.reloadInFlight = this.doReloadFromDisk().finally(() => {
      this.reloadInFlight = null;
    });
    await this.reloadInFlight;
  }

  private async doReloadFromDisk(): Promise<void> {
    const snapshot = await loadStoreSnapshot({
      rootDir: this.rootDir,
      runAttemptKey: (runId, attemptId) => this.runAttemptKey(runId, attemptId),
      normalizeInitiative: (initiative, inferredCompletion) => this.normalizeInitiative(initiative, inferredCompletion)
    });

    this.config = snapshot.config;

    replaceMapContents(this.initiatives, snapshot.initiatives);
    replaceMapContents(this.tickets, snapshot.tickets);
    replaceMapContents(this.runs, snapshot.runs);
    replaceMapContents(this.runAttempts, snapshot.runAttempts);
    replaceMapContents(this.specs, snapshot.specs);
    replaceMapContents(this.planningReviews, snapshot.planningReviews);
    replaceMapContents(this.ticketCoverageArtifacts, snapshot.ticketCoverageArtifacts);
    replaceMapContents(this.artifactTraces, snapshot.artifactTraces);

    this.rebuildOperationIndex();
  }

  public async upsertConfig(config: Config): Promise<void> {
    await writeYamlFile(configPath(this.rootDir), config);
    this.config = config;
  }

  public async upsertInitiative(
    initiative: Initiative,
    docs: { brief?: string; coreFlows?: string; prd?: string; techSpec?: string } = {}
  ): Promise<void> {
    const normalized = this.normalizeInitiative(initiative, {
      hasBrief:
        docs.brief !== undefined
          ? docs.brief.trim().length > 0
          : (this.specs.get(`${initiative.id}:brief`)?.content ?? "").trim().length > 0,
      hasCoreFlows:
        docs.coreFlows !== undefined
          ? docs.coreFlows.trim().length > 0
          : (this.specs.get(`${initiative.id}:core-flows`)?.content ?? "").trim().length > 0,
      hasPrd:
        docs.prd !== undefined
          ? docs.prd.trim().length > 0
          : (this.specs.get(`${initiative.id}:prd`)?.content ?? "").trim().length > 0,
      hasTechSpec:
        docs.techSpec !== undefined
          ? docs.techSpec.trim().length > 0
          : (this.specs.get(`${initiative.id}:tech-spec`)?.content ?? "").trim().length > 0,
      hasTickets:
        initiative.ticketIds.length > 0 ||
        initiative.phases.length > 0 ||
        Array.from(this.tickets.values()).some((ticket) => ticket.initiativeId === initiative.id)
    });

    const dir = initiativeDir(this.rootDir, normalized.id);
    await mkdir(dir, { recursive: true });
    await writeYamlFile(initiativeYamlPath(this.rootDir, normalized.id), normalized);

    const hasDocChanges =
      docs.brief !== undefined ||
      docs.coreFlows !== undefined ||
      docs.prd !== undefined ||
      docs.techSpec !== undefined;

    if (docs.brief !== undefined) {
      await writeFileAtomic(path.join(dir, "brief.md"), docs.brief);
    }

    if (docs.coreFlows !== undefined) {
      await writeFileAtomic(path.join(dir, "core-flows.md"), docs.coreFlows);
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
      this.initiatives.set(normalized.id, normalized);
    }
  }

  public async deleteInitiative(id: string): Promise<void> {
    const dir = initiativeDir(this.rootDir, id);
    const { rm } = await import("node:fs/promises");
    const relatedTickets = Array.from(this.tickets.values()).filter((ticket) => ticket.initiativeId === id);
    const relatedTicketIds = new Set(relatedTickets.map((ticket) => ticket.id));
    const relatedRuns = Array.from(this.runs.values()).filter((run) => run.ticketId && relatedTicketIds.has(run.ticketId));

    for (const run of relatedRuns) {
      await this.deleteRun(run.id);
    }

    for (const ticket of relatedTickets) {
      await this.deleteTicket(ticket.id);
    }

    await rm(dir, { recursive: true, force: true });
    this.initiatives.delete(id);
    // Remove associated specs from memory
    for (const [key, spec] of this.specs) {
      if (spec.initiativeId === id) this.specs.delete(key);
    }
    for (const [key, review] of this.planningReviews) {
      if (review.initiativeId === id) this.planningReviews.delete(key);
    }
    for (const [key, coverage] of this.ticketCoverageArtifacts) {
      if (coverage.initiativeId === id) this.ticketCoverageArtifacts.delete(key);
    }
    for (const [key, trace] of this.artifactTraces) {
      if (trace.initiativeId === id) this.artifactTraces.delete(key);
    }
  }

  public async upsertTicket(ticket: Ticket): Promise<void> {
    await writeYamlFile(ticketPath(this.rootDir, ticket.id), ticket);
    this.tickets.set(ticket.id, ticket);
  }

  public async deleteTicket(id: string): Promise<void> {
    const { rm } = await import("node:fs/promises");
    await rm(ticketPath(this.rootDir, id), { force: true });
    this.tickets.delete(id);
  }

  public async deleteRun(id: string): Promise<void> {
    const { rm } = await import("node:fs/promises");
    await rm(runDir(this.rootDir, id), { recursive: true, force: true });
    this.runs.delete(id);
    for (const key of Array.from(this.runAttempts.keys())) {
      if (key.startsWith(`${id}:`)) {
        this.runAttempts.delete(key);
      }
    }
  }

  public async upsertRun(run: Run): Promise<void> {
    await writeYamlFile(runYamlPath(this.rootDir, run.id), run);
    this.runs.set(run.id, run);
  }

  private normalizeInitiative(
    initiative: Initiative,
    inferredCompletion: {
      hasBrief: boolean;
      hasCoreFlows: boolean;
      hasPrd: boolean;
      hasTechSpec: boolean;
      hasTickets: boolean;
    }
  ): Initiative {
    return {
      ...initiative,
      workflow: normalizeInitiativeWorkflow(initiative.workflow, inferredCompletion)
    };
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

      const fileName = specTypeToFileName(spec.type);
      const filePath = path.join(initiativeDir(this.rootDir, spec.initiativeId), fileName);
      await writeFileAtomic(filePath, spec.content);
    }

    await this.reloadFromDisk();
  }

  public async upsertPlanningReview(review: PlanningReviewArtifact): Promise<void> {
    const filePath = initiativeReviewPath(this.rootDir, review.initiativeId, review.kind);
    await writeYamlFile(filePath, review);
    this.planningReviews.set(review.id, review);
  }

  public async upsertTicketCoverageArtifact(coverage: TicketCoverageArtifact): Promise<void> {
    const filePath = initiativeTicketCoveragePath(this.rootDir, coverage.initiativeId);
    await writeYamlFile(filePath, coverage);
    this.ticketCoverageArtifacts.set(coverage.id, coverage);
  }

  public async upsertArtifactTrace(trace: ArtifactTraceOutline): Promise<void> {
    const filePath = initiativeTracePath(this.rootDir, trace.initiativeId, trace.step);
    await writeYamlFile(filePath, trace);
    this.artifactTraces.set(trace.id, trace);
  }

  public async prepareRunOperation(input: PrepareOperationInput): Promise<OperationManifest> {
    const manifest = await prepareRunOperationInternal(
      {
        rootDir: this.rootDir,
        now: this.now,
        runs: this.runs,
        writeLocks: this.writeLocks,
        ensureRunWritable: (runId, requestedOperationId) => this.ensureRunWritable(runId, requestedOperationId),
        writePreparedArtifacts,
        upsertRun: (run) => this.upsertRun(run),
        reloadFromDisk: () => this.reloadFromDisk(),
        markOperationState: (runId, operationId, state) => this.markOperationState(runId, operationId, state),
        clearRunOperationPointer: (runId) => this.clearRunOperationPointer(runId),
        isLeaseExpired: (leaseExpiresAt) => this.isLeaseExpired(leaseExpiresAt),
        uniquePush: (items, value) => this.uniquePush(items, value),
        suppressWatcher: () => this.suppressWatcher(),
        resumeWatcher: () => this.resumeWatcher()
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
        writePreparedArtifacts,
        upsertRun: (run) => this.upsertRun(run),
        reloadFromDisk: () => this.reloadFromDisk(),
        markOperationState: (runId, operationId, state) => this.markOperationState(runId, operationId, state),
        clearRunOperationPointer: (runId) => this.clearRunOperationPointer(runId),
        isLeaseExpired: (leaseExpiresAt) => this.isLeaseExpired(leaseExpiresAt),
        uniquePush: (items, value) => this.uniquePush(items, value),
        suppressWatcher: () => this.suppressWatcher(),
        resumeWatcher: () => this.resumeWatcher()
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

    this.watcher = await createSpecflowWatcher(this.rootDir, () => this.reloadFromDisk());
  }

  public async recoverOrphanOperations(): Promise<void> {
    await recoverOrphanOperationsInternal({
      rootDir: this.rootDir,
      runs: this.runs,
      markOperationState: (runId, operationId, state) => this.markOperationState(runId, operationId, state),
      clearRunOperationPointer: (runId) => this.clearRunOperationPointer(runId),
      adoptCommittedOperation: (runId, manifest) => this.adoptCommittedOperation(runId, manifest)
    });
  }

  private async adoptCommittedOperation(runId: string, manifest: OperationManifest): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) {
      return;
    }

    const updatedRun: Run = {
      ...run,
      attempts: this.uniquePush(run.attempts, manifest.targetAttemptId),
      committedAttemptId: manifest.targetAttemptId,
      activeOperationId: null,
      operationLeaseExpiresAt: null,
      lastCommittedAt: manifest.committedAt ?? manifest.updatedAt,
      status: "complete"
    };

    await writeYamlFile(runYamlPath(this.rootDir, runId), updatedRun);
    this.runs.set(runId, updatedRun);
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

  private suppressWatcher(): void {
    this.watcher?.suppress();
  }

  private resumeWatcher(): void {
    this.watcher?.resume();
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
