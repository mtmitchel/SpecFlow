import { logObservabilityEvent } from "../observability.js";
import type { ArtifactsSnapshotMeta, StoreReloadIssue } from "../types/contracts.js";
import { normalizeInitiativeWorkflow } from "../planner/workflow-state.js";
import { pruneExpiredTempOperations as pruneExpiredTempOperationsInternal } from "./internal/cleanup.js";
import { reloadStoreFromDisk } from "./internal/store-reload-lifecycle.js";
import {
  type CommitOperationInput,
  clearRunOperationPointerInStore,
  commitRunOperationInStore,
  ensureRunWritableInStore,
  getOperationStatusInStore,
  markOperationStateInStore,
  type PrepareOperationInput,
  prepareRunOperationInStore,
  recoverOrphanOperationsInStore
} from "./internal/store-run-operation-facade.js";
import { type SpecflowWatcher, createSpecflowWatcher } from "./internal/watcher.js";
import {
  deleteInitiativeInStore,
  deletePendingTicketPlanArtifactInStore,
  deleteRunInStore,
  deleteTicketInStore,
  readRunAttemptInStore,
  readSpecInStore,
  upsertArtifactTraceInStore,
  upsertConfigInStore,
  upsertInitiativeInStore,
  upsertPendingTicketPlanArtifactInStore,
  upsertPlanningReviewInStore,
  upsertRunAttemptInStore,
  upsertRunInStore,
  upsertSpecInStore,
  upsertTicketCoverageArtifactInStore,
  upsertTicketInStore
} from "./internal/store-entity-facade.js";
import { buildArtifactsSnapshotMeta, measureArtifactsSnapshotBytes } from "./internal/store-snapshot-meta.js";
import { runAttemptKey } from "./internal/run-operation-state.js";
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
export type {
  CommitOperationInput,
  PrepareOperationInput
} from "./internal/store-run-operation-facade.js";
export type { PreparedOperationArtifacts } from "./types.js";

export interface StoreStartupOptions {
  watch?: boolean;
  cleanup?: boolean;
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
  private lastSnapshotPayloadBytes = 0;

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
    this.refreshSnapshotPayloadBytes();
  }

  public async upsertConfig(config: Config): Promise<void> {
    await upsertConfigInStore(this.createEntityFacadeContext(), config);
  }

  public async upsertInitiative(
    initiative: Initiative,
    docs: { brief?: string; coreFlows?: string; prd?: string; techSpec?: string } = {}
  ): Promise<void> {
    await upsertInitiativeInStore(this.createEntityFacadeContext(), initiative, docs);
  }

  public async deleteInitiative(id: string): Promise<void> {
    await deleteInitiativeInStore(this.createEntityFacadeContext(), id);
  }

  public async upsertTicket(ticket: Ticket): Promise<void> {
    await upsertTicketInStore(this.createEntityFacadeContext(), ticket);
  }

  public async deleteTicket(id: string): Promise<void> {
    await deleteTicketInStore(this.createEntityFacadeContext(), id);
  }

  public async deleteRun(id: string): Promise<void> {
    await deleteRunInStore(this.createEntityFacadeContext(), id);
  }

  public async upsertRun(run: Run): Promise<void> {
    await upsertRunInStore(this.createEntityFacadeContext(), run);
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
    await upsertRunAttemptInStore(this.createEntityFacadeContext(), runId, attempt);
  }

  public async readRunAttempt(runId: string, attemptId: string): Promise<RunAttempt | null> {
    return readRunAttemptInStore(this.createEntityFacadeContext(), runId, attemptId);
  }

  public async readSpec(specId: string): Promise<SpecDocument | null> {
    return readSpecInStore(this.createEntityFacadeContext(), specId);
  }

  public async readSpecMarkdown(specId: string): Promise<string> {
    return (await this.readSpec(specId))?.content ?? "";
  }

  public async upsertSpec(spec: SpecDocument): Promise<void> {
    await upsertSpecInStore(this.createEntityFacadeContext(), spec);
  }

  public async upsertPlanningReview(review: PlanningReviewArtifact): Promise<void> {
    await upsertPlanningReviewInStore(this.createEntityFacadeContext(), review);
  }

  public async upsertPendingTicketPlanArtifact(plan: PendingTicketPlanArtifact): Promise<void> {
    await upsertPendingTicketPlanArtifactInStore(this.createEntityFacadeContext(), plan);
  }

  public async deletePendingTicketPlanArtifact(initiativeId: string): Promise<void> {
    await deletePendingTicketPlanArtifactInStore(this.createEntityFacadeContext(), initiativeId);
  }

  public async upsertTicketCoverageArtifact(coverage: TicketCoverageArtifact): Promise<void> {
    await upsertTicketCoverageArtifactInStore(this.createEntityFacadeContext(), coverage);
  }

  public async upsertArtifactTrace(trace: ArtifactTraceOutline): Promise<void> {
    await upsertArtifactTraceInStore(this.createEntityFacadeContext(), trace);
  }

  public async prepareRunOperation(input: PrepareOperationInput): Promise<OperationManifest> {
    return prepareRunOperationInStore(this.createRunOperationFacadeContext(), input);
  }

  public async commitRunOperation(input: CommitOperationInput): Promise<Run> {
    return commitRunOperationInStore(this.createRunOperationFacadeContext(), input);
  }

  public async markOperationState(
    runId: string,
    operationId: string,
    state: OperationState
  ): Promise<OperationManifest> {
    return markOperationStateInStore(this.createRunOperationFacadeContext(), runId, operationId, state);
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
    await recoverOrphanOperationsInStore(this.createRunOperationFacadeContext());
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
    return getOperationStatusInStore(this.createRunOperationFacadeContext(), operationId);
  }

  private async clearRunOperationPointer(runId: string): Promise<void> {
    await clearRunOperationPointerInStore(this.createRunOperationFacadeContext(), runId);
  }

  private suppressWatcher(): void {
    this.watcher?.suppress();
  }

  private resumeWatcher(): void {
    this.watcher?.resume();
  }

  private async ensureRunWritable(runId: string, requestedOperationId: string): Promise<void> {
    await ensureRunWritableInStore(this.createRunOperationFacadeContext(), runId, requestedOperationId);
  }

  public getSnapshotMeta(): ArtifactsSnapshotMeta {
    return buildArtifactsSnapshotMeta({
      revision: this.revision,
      now: this.now,
      lastReloadDurationMs: this.lastReloadDurationMs,
      lastReloadIssues: this.lastReloadIssues,
      lastSnapshotPayloadBytes: this.lastSnapshotPayloadBytes
    });
  }

  private refreshSnapshotPayloadBytes(): void {
    this.lastSnapshotPayloadBytes = measureArtifactsSnapshotBytes({
      rootDir: this.rootDir,
      config: this.config,
      revision: this.revision,
      now: this.now,
      lastReloadDurationMs: this.lastReloadDurationMs,
      lastReloadIssues: this.lastReloadIssues,
      lastSnapshotPayloadBytes: this.lastSnapshotPayloadBytes,
      initiatives: this.initiatives,
      tickets: this.tickets,
      runs: this.runs,
      runAttempts: this.runAttempts,
      specs: this.specs,
      planningReviews: this.planningReviews,
      ticketCoverageArtifacts: this.ticketCoverageArtifacts
    });
  }

  private createEntityFacadeContext() {
    return {
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
      normalizeInitiative: (
        initiative: Initiative,
        inferredCompletion: {
          hasBrief: boolean;
          hasCoreFlows: boolean;
          hasPrd: boolean;
          hasTechSpec: boolean;
          hasValidation: boolean;
          hasTickets: boolean;
        }
      ) => this.normalizeInitiative(initiative, inferredCompletion),
      reloadFromDisk: () => this.reloadFromDisk(),
      suppressWatcher: () => this.suppressWatcher(),
      resumeWatcher: () => this.resumeWatcher(),
      deleteRun: (runId: string) => this.deleteRun(runId),
      deleteTicket: (ticketId: string) => this.deleteTicket(ticketId),
      setConfig: (config: Config) => {
        this.config = config;
      },
      bumpRevision: () => this.bumpRevision(),
      refreshSnapshotPayloadBytes: () => this.refreshSnapshotPayloadBytes()
    };
  }

  private createRunOperationFacadeContext() {
    return {
      rootDir: this.rootDir,
      now: this.now,
      runs: this.runs,
      writeLocks: this.writeLocks,
      operationIndex: this.operationIndex,
      upsertRun: (run: Run) => this.upsertRun(run),
      reloadFromDisk: () => this.reloadFromDisk(),
      markOperationState: (runId: string, operationId: string, state: OperationState) =>
        this.markOperationState(runId, operationId, state),
      clearRunOperationPointer: (runId: string) => this.clearRunOperationPointer(runId),
      ensureRunWritable: (runId: string, requestedOperationId: string) =>
        this.ensureRunWritable(runId, requestedOperationId),
      suppressWatcher: () => this.suppressWatcher(),
      resumeWatcher: () => this.resumeWatcher(),
      bumpRevision: () => this.bumpRevision(),
      refreshSnapshotPayloadBytes: () => this.refreshSnapshotPayloadBytes()
    };
  }

  private bumpRevision(): number {
    this.revision += 1;
    return this.revision;
  }
}
