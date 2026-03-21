import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomic } from "../io/atomic-write.js";
import { logObservabilityEvent } from "../observability.js";
import type { ArtifactsSnapshotMeta, StoreReloadIssue } from "../types/contracts.js";
import {
  configPath,
  decisionsDir,
  initiativeDir,
  initiativePendingTicketPlanPath,
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
import {
  adoptCommittedOperation as adoptCommittedOperationInternal,
  ensureRunWritable as ensureRunWritableInternal,
  isLeaseExpired,
  rebuildOperationIndex,
  runAttemptKey,
  uniquePush
} from "./internal/run-operation-state.js";
import { specTypeToFileName } from "./internal/spec-utils.js";
import { type SpecflowWatcher, createSpecflowWatcher } from "./internal/watcher.js";
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
    this.reloadInFlight = this.doReloadFromDisk().finally(() => {
      this.reloadInFlight = null;
    });
    await this.reloadInFlight;
  }

  private async doReloadFromDisk(): Promise<void> {
    const startedAt = Date.now();
    const snapshot = await loadStoreSnapshot({
      rootDir: this.rootDir,
      runAttemptKey,
      normalizeInitiative: (initiative, inferredCompletion) => this.normalizeInitiative(initiative, inferredCompletion)
    });

    this.config = snapshot.config;

    replaceMapContents(this.initiatives, snapshot.initiatives);
    replaceMapContents(this.tickets, snapshot.tickets);
    replaceMapContents(this.runs, snapshot.runs);
    replaceMapContents(this.runAttempts, snapshot.runAttempts);
    replaceMapContents(this.specs, snapshot.specs);
    replaceMapContents(this.planningReviews, snapshot.planningReviews);
    replaceMapContents(this.pendingTicketPlans, snapshot.pendingTicketPlans);
    replaceMapContents(this.ticketCoverageArtifacts, snapshot.ticketCoverageArtifacts);
    replaceMapContents(this.artifactTraces, snapshot.artifactTraces);
    this.lastReloadIssues = snapshot.issues;
    this.lastReloadDurationMs = Date.now() - startedAt;
    this.bumpRevision();

    rebuildOperationIndex(this.operationIndex, this.runs);

    logObservabilityEvent({
      layer: "store",
      event: "store.reload",
      status: snapshot.issues.length > 0 ? "error" : "ok",
      durationMs: this.lastReloadDurationMs,
      details: {
        revision: this.revision,
        initiativeCount: this.initiatives.size,
        ticketCount: this.tickets.size,
        runCount: this.runs.size,
        runAttemptCount: this.runAttempts.size,
        reloadIssueCount: snapshot.issues.length
      }
    });
  }

  public async upsertConfig(config: Config): Promise<void> {
    await writeYamlFile(configPath(this.rootDir), config);
    this.config = config;
    this.bumpRevision();
  }

  public async upsertInitiative(
    initiative: Initiative,
    docs: { brief?: string; coreFlows?: string; prd?: string; techSpec?: string } = {}
  ): Promise<void> {
    const normalized = this.normalizeInitiative(initiative, {
      hasBrief:
        docs.brief !== undefined
          ? docs.brief.trim().length > 0
          : this.specs.has(`${initiative.id}:brief`),
      hasCoreFlows:
        docs.coreFlows !== undefined
          ? docs.coreFlows.trim().length > 0
          : this.specs.has(`${initiative.id}:core-flows`),
      hasPrd:
        docs.prd !== undefined
          ? docs.prd.trim().length > 0
          : this.specs.has(`${initiative.id}:prd`),
      hasTechSpec:
        docs.techSpec !== undefined
          ? docs.techSpec.trim().length > 0
          : this.specs.has(`${initiative.id}:tech-spec`),
      hasValidation:
        this.pendingTicketPlans.has(`${initiative.id}:pending-ticket-plan`) ||
        this.planningReviews.has(`${initiative.id}:ticket-coverage-review`) ||
        initiative.workflow.steps.validation?.status === "complete" ||
        initiative.ticketIds.length > 0 ||
        initiative.phases.length > 0,
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
      this.bumpRevision();
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
    for (const [key, pendingPlan] of this.pendingTicketPlans) {
      if (pendingPlan.initiativeId === id) this.pendingTicketPlans.delete(key);
    }
    for (const [key, coverage] of this.ticketCoverageArtifacts) {
      if (coverage.initiativeId === id) this.ticketCoverageArtifacts.delete(key);
    }
    for (const [key, trace] of this.artifactTraces) {
      if (trace.initiativeId === id) this.artifactTraces.delete(key);
    }
    this.bumpRevision();
  }

  public async upsertTicket(ticket: Ticket): Promise<void> {
    await writeYamlFile(ticketPath(this.rootDir, ticket.id), ticket);
    this.tickets.set(ticket.id, ticket);
    this.bumpRevision();
  }

  public async deleteTicket(id: string): Promise<void> {
    const { rm } = await import("node:fs/promises");
    await rm(ticketPath(this.rootDir, id), { force: true });
    this.tickets.delete(id);
    this.bumpRevision();
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
    this.bumpRevision();
  }

  public async upsertRun(run: Run): Promise<void> {
    await writeYamlFile(runYamlPath(this.rootDir, run.id), run);
    this.runs.set(run.id, run);
    this.bumpRevision();
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
    const filePath = verificationPath(this.rootDir, runId, attempt.attemptId);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFileAtomic(filePath, JSON.stringify(attempt, null, 2));
    this.runAttempts.set(runAttemptKey(runId, attempt.attemptId), {
      attemptId: attempt.attemptId,
      overallPass: attempt.overallPass,
      overrideReason: attempt.overrideReason,
      overrideAccepted: attempt.overrideAccepted,
      createdAt: attempt.createdAt
    });
    this.bumpRevision();
  }

  public async readRunAttempt(runId: string, attemptId: string): Promise<RunAttempt | null> {
    try {
      const raw = await readFile(verificationPath(this.rootDir, runId, attemptId), "utf8");
      return JSON.parse(raw) as RunAttempt;
    } catch {
      return null;
    }
  }

  public async readSpec(specId: string): Promise<SpecDocument | null> {
    const summary = this.specs.get(specId);
    if (!summary) {
      return null;
    }

    try {
      const content = await readFile(summary.sourcePath, "utf8");
      const fileStat = await stat(summary.sourcePath);
      return {
        ...summary,
        content,
        createdAt: fileStat.birthtime.toISOString(),
        updatedAt: fileStat.mtime.toISOString()
      };
    } catch {
      return null;
    }
  }

  public async readSpecMarkdown(specId: string): Promise<string> {
    return (await this.readSpec(specId))?.content ?? "";
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
    this.bumpRevision();
  }

  public async upsertPendingTicketPlanArtifact(plan: PendingTicketPlanArtifact): Promise<void> {
    const filePath = initiativePendingTicketPlanPath(this.rootDir, plan.initiativeId);
    await writeYamlFile(filePath, plan);
    this.pendingTicketPlans.set(plan.id, plan);
    this.bumpRevision();
  }

  public async deletePendingTicketPlanArtifact(initiativeId: string): Promise<void> {
    const { rm } = await import("node:fs/promises");
    await rm(initiativePendingTicketPlanPath(this.rootDir, initiativeId), { force: true });
    this.pendingTicketPlans.delete(`${initiativeId}:pending-ticket-plan`);
    this.bumpRevision();
  }

  public async upsertTicketCoverageArtifact(coverage: TicketCoverageArtifact): Promise<void> {
    const filePath = initiativeTicketCoveragePath(this.rootDir, coverage.initiativeId);
    await writeYamlFile(filePath, coverage);
    this.ticketCoverageArtifacts.set(coverage.id, coverage);
    this.bumpRevision();
  }

  public async upsertArtifactTrace(trace: ArtifactTraceOutline): Promise<void> {
    const filePath = initiativeTracePath(this.rootDir, trace.initiativeId, trace.step);
    await writeYamlFile(filePath, trace);
    this.artifactTraces.set(trace.id, trace);
    this.bumpRevision();
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

  private bumpRevision(): void {
    this.revision += 1;
  }
}
