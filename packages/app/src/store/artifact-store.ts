import { logObservabilityEvent } from "../observability.js";
import type { ArtifactsSnapshotMeta, StoreReloadIssue } from "../types/contracts.js";
import {
  operationManifestPath,
} from "../io/paths.js";
import { normalizeInitiativeWorkflow } from "../planner/workflow-state.js";
import { readYamlFile } from "../io/yaml.js";
import { pruneExpiredTempOperations as pruneExpiredTempOperationsInternal } from "./internal/cleanup.js";
import { reloadStoreFromDisk } from "./internal/store-reload-lifecycle.js";
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
import {
  adoptCommittedOperation as adoptCommittedOperationInternal,
  ensureRunWritable as ensureRunWritableInternal,
  isLeaseExpired,
  runAttemptKey,
  uniquePush
} from "./internal/run-operation-state.js";
import { type SpecflowWatcher, createSpecflowWatcher } from "./internal/watcher.js";
import {
  deleteInitiativeRecord,
  deletePendingTicketPlanRecord,
  deleteRunRecord,
  deleteTicketRecord,
  readRunAttemptRecord,
  readSpecRecord,
  upsertArtifactTraceRecord,
  upsertConfigRecord,
  upsertInitiativeRecord,
  upsertPendingTicketPlanRecord,
  upsertPlanningReviewRecord,
  upsertRunAttemptRecord,
  upsertRunRecord,
  upsertSpecRecord,
  upsertTicketCoverageRecord,
  upsertTicketRecord
} from "./internal/store-entity-operations.js";
import type { PreparedOperationArtifacts } from "./types.js";
import type {
  ArtifactTraceOutline,
  Config,
  Initiative,
  OperationManifest,
  OperationState,
  PendingTicketPlanArtifact,
  PlanningReviewArtifact,
  Run,
  RunAttempt,
  RunAttemptSummary,
  SpecDocument,
  SpecDocumentSummary,
  TicketCoverageArtifact,
  Ticket,
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
  public readonly runAttempts = new Map<string, RunAttemptSummary>();
  public readonly specs = new Map<string, SpecDocumentSummary>();
  public readonly planningReviews = new Map<string, PlanningReviewArtifact>();
  public readonly pendingTicketPlans = new Map<string, PendingTicketPlanArtifact>();
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
  private revision = 0;
  private lastReloadDurationMs = 0;
  private lastReloadIssues: StoreReloadIssue[] = [];

  public constructor(options: ArtifactStoreOptions) {
    this.rootDir = options.rootDir;
    this.cleanupTtlMs = options.cleanupTtlMs ?? 24 * 60 * 60 * 1000;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? 5 * 60 * 1000;
    this.now = options.now ?? (() => new Date());
  }

  public async initialize(options: StoreStartupOptions = {}): Promise<void> {
    const startedAt = Date.now();
    await this.reloadFromDisk();
    await this.recoverOrphanOperations();
    await this.reloadFromDisk();

    if (options.watch) {
      await this.startWatcher();
    }

    if (options.cleanup) {
      this.startCleanupTask();
    }

    logObservabilityEvent({
      layer: "store",
      event: "store.initialize",
      status: "ok",
      durationMs: Date.now() - startedAt,
      details: {
        watchEnabled: Boolean(options.watch),
        cleanupEnabled: Boolean(options.cleanup),
        revision: this.revision,
        reloadIssueCount: this.lastReloadIssues.length
      }
    });
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
    this.reloadInFlight = this.applyReloadFromDisk().finally(() => {
      this.reloadInFlight = null;
    });
    await this.reloadInFlight;
  }

  private async applyReloadFromDisk(): Promise<void> {
    await reloadStoreFromDisk({
      rootDir: this.rootDir,
      initiatives: this.initiatives,
      tickets: this.tickets,
      runs: this.runs,
      runAttempts: this.runAttempts,
      specs: this.specs,
      planningReviews: this.planningReviews,
      pendingTicketPlans: this.pendingTicketPlans,
      ticketCoverageArtifacts: this.ticketCoverageArtifacts,
      artifactTraces: this.artifactTraces,
      operationIndex: this.operationIndex,
      runAttemptKey,
      normalizeInitiative: (initiative, inferredCompletion) =>
        this.normalizeInitiative(initiative, inferredCompletion),
      setConfig: (config) => {
        this.config = config;
      },
      setReloadState: (durationMs, issues) => {
        this.lastReloadDurationMs = durationMs;
        this.lastReloadIssues = issues;
      },
      bumpRevision: () => this.bumpRevision()
    });
  }

  public async upsertConfig(config: Config): Promise<void> {
    await upsertConfigRecord(
      {
        rootDir: this.rootDir,
        bumpRevision: () => this.bumpRevision()
      },
      config
    );
    this.config = config;
  }

  public async upsertInitiative(
    initiative: Initiative,
    docs: { brief?: string; coreFlows?: string; prd?: string; techSpec?: string } = {}
  ): Promise<void> {
    await upsertInitiativeRecord(
      {
        rootDir: this.rootDir,
        initiatives: this.initiatives,
        specs: this.specs,
        planningReviews: this.planningReviews,
        pendingTicketPlans: this.pendingTicketPlans,
        tickets: this.tickets,
        normalizeInitiative: (nextInitiative, inferredCompletion) =>
          this.normalizeInitiative(nextInitiative, inferredCompletion),
        reloadFromDisk: () => this.reloadFromDisk(),
        suppressWatcher: () => this.suppressWatcher(),
        resumeWatcher: () => this.resumeWatcher(),
        bumpRevision: () => this.bumpRevision()
      },
      initiative,
      docs
    );
  }

  public async deleteInitiative(id: string): Promise<void> {
    await deleteInitiativeRecord(
      {
        rootDir: this.rootDir,
        initiatives: this.initiatives,
        tickets: this.tickets,
        runs: this.runs,
        specs: this.specs,
        planningReviews: this.planningReviews,
        pendingTicketPlans: this.pendingTicketPlans,
        ticketCoverageArtifacts: this.ticketCoverageArtifacts,
        artifactTraces: this.artifactTraces,
        deleteRun: (runId) => this.deleteRun(runId),
        deleteTicket: (ticketId) => this.deleteTicket(ticketId),
        bumpRevision: () => this.bumpRevision()
      },
      id
    );
  }

  public async upsertTicket(ticket: Ticket): Promise<void> {
    await upsertTicketRecord(
      {
        rootDir: this.rootDir,
        tickets: this.tickets,
        bumpRevision: () => this.bumpRevision()
      },
      ticket
    );
  }

  public async deleteTicket(id: string): Promise<void> {
    await deleteTicketRecord(
      {
        rootDir: this.rootDir,
        tickets: this.tickets,
        bumpRevision: () => this.bumpRevision()
      },
      id
    );
  }

  public async deleteRun(id: string): Promise<void> {
    await deleteRunRecord(
      {
        rootDir: this.rootDir,
        runs: this.runs,
        runAttempts: this.runAttempts,
        bumpRevision: () => this.bumpRevision()
      },
      id
    );
  }

  public async upsertRun(run: Run): Promise<void> {
    await upsertRunRecord(
      {
        rootDir: this.rootDir,
        runs: this.runs,
        bumpRevision: () => this.bumpRevision()
      },
      run
    );
  }

  private normalizeInitiative(
    initiative: Initiative,
    inferredCompletion: {
      hasBrief: boolean;
      hasCoreFlows: boolean;
      hasPrd: boolean;
      hasTechSpec: boolean;
      hasValidation: boolean;
      hasTickets: boolean;
    }
  ): Initiative {
    return {
      ...initiative,
      workflow: normalizeInitiativeWorkflow(initiative.workflow, inferredCompletion)
    };
  }

  public async upsertRunAttempt(runId: string, attempt: RunAttempt): Promise<void> {
    await upsertRunAttemptRecord(
      {
        rootDir: this.rootDir,
        runAttempts: this.runAttempts,
        bumpRevision: () => this.bumpRevision()
      },
      runId,
      attempt
    );
  }

  public async readRunAttempt(runId: string, attemptId: string): Promise<RunAttempt | null> {
    return readRunAttemptRecord(this.rootDir, runId, attemptId);
  }

  public async readSpec(specId: string): Promise<SpecDocument | null> {
    return readSpecRecord(this.specs, specId);
  }

  public async readSpecMarkdown(specId: string): Promise<string> {
    return (await this.readSpec(specId))?.content ?? "";
  }

  public async upsertSpec(spec: SpecDocument): Promise<void> {
    await upsertSpecRecord(
      {
        rootDir: this.rootDir,
        reloadFromDisk: () => this.reloadFromDisk(),
        bumpRevision: () => this.bumpRevision()
      },
      spec
    );
  }

  public async upsertPlanningReview(review: PlanningReviewArtifact): Promise<void> {
    await upsertPlanningReviewRecord(
      {
        rootDir: this.rootDir,
        planningReviews: this.planningReviews,
        bumpRevision: () => this.bumpRevision()
      },
      review
    );
  }

  public async upsertPendingTicketPlanArtifact(plan: PendingTicketPlanArtifact): Promise<void> {
    await upsertPendingTicketPlanRecord(
      {
        rootDir: this.rootDir,
        pendingTicketPlans: this.pendingTicketPlans,
        bumpRevision: () => this.bumpRevision()
      },
      plan
    );
  }

  public async deletePendingTicketPlanArtifact(initiativeId: string): Promise<void> {
    await deletePendingTicketPlanRecord(
      {
        rootDir: this.rootDir,
        pendingTicketPlans: this.pendingTicketPlans,
        bumpRevision: () => this.bumpRevision()
      },
      initiativeId
    );
  }

  public async upsertTicketCoverageArtifact(coverage: TicketCoverageArtifact): Promise<void> {
    await upsertTicketCoverageRecord(
      {
        rootDir: this.rootDir,
        ticketCoverageArtifacts: this.ticketCoverageArtifacts,
        bumpRevision: () => this.bumpRevision()
      },
      coverage
    );
  }

  public async upsertArtifactTrace(trace: ArtifactTraceOutline): Promise<void> {
    await upsertArtifactTraceRecord(
      {
        rootDir: this.rootDir,
        artifactTraces: this.artifactTraces,
        bumpRevision: () => this.bumpRevision()
      },
      trace
    );
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
        isLeaseExpired: (leaseExpiresAt) => isLeaseExpired(leaseExpiresAt, this.now),
        uniquePush,
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
        isLeaseExpired: (leaseExpiresAt) => isLeaseExpired(leaseExpiresAt, this.now),
        uniquePush,
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
    await adoptCommittedOperationInternal({
      rootDir: this.rootDir,
      runs: this.runs,
      runId,
      manifest
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
    this.bumpRevision();
  }

  private suppressWatcher(): void {
    this.watcher?.suppress();
  }

  private resumeWatcher(): void {
    this.watcher?.resume();
  }

  private async ensureRunWritable(runId: string, requestedOperationId: string): Promise<void> {
    await ensureRunWritableInternal({
      runId,
      requestedOperationId,
      writeLocks: this.writeLocks,
      runs: this.runs,
      now: this.now,
      markOperationState: (lockedRunId, operationId, state) => this.markOperationState(lockedRunId, operationId, state),
      clearRunOperationPointer: (lockedRunId) => this.clearRunOperationPointer(lockedRunId),
      reloadFromDisk: () => this.reloadFromDisk()
    });
  }

  public getSnapshotMeta(): ArtifactsSnapshotMeta {
    return {
      revision: this.revision,
      generatedAt: this.now().toISOString(),
      generationTimeMs: this.lastReloadDurationMs,
      payloadBytes: 0,
      reloadIssues: this.lastReloadIssues.slice()
    };
  }

  private bumpRevision(): number {
    this.revision += 1;
    return this.revision;
  }
}
