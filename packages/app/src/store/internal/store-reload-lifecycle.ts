import { logObservabilityEvent } from "../../observability.js";
import { loadStoreSnapshot, replaceMapContents } from "./reload.js";
import { recoverInterruptedInitiativeWrites } from "./store-writer.js";
import { rebuildOperationIndex } from "./run-operation-state.js";
import type { StoreReloadIssue } from "../../types/contracts.js";
import type {
  ArtifactTraceOutline,
  Config,
  Initiative,
  PendingTicketPlanArtifact,
  PlanningReviewArtifact,
  Run,
  RunAttemptSummary,
  SpecDocumentSummary,
  Ticket,
  TicketCoverageArtifact
} from "../../types/entities.js";

interface ReloadLifecycleContext {
  rootDir: string;
  initiatives: Map<string, Initiative>;
  tickets: Map<string, Ticket>;
  runs: Map<string, Run>;
  runAttempts: Map<string, RunAttemptSummary>;
  specs: Map<string, SpecDocumentSummary>;
  planningReviews: Map<string, PlanningReviewArtifact>;
  pendingTicketPlans: Map<string, PendingTicketPlanArtifact>;
  ticketCoverageArtifacts: Map<string, TicketCoverageArtifact>;
  artifactTraces: Map<string, ArtifactTraceOutline>;
  operationIndex: Map<string, string>;
  runAttemptKey: (runId: string, attemptId: string) => string;
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
  ) => Initiative;
  setConfig: (config: Config | null) => void;
  setReloadState: (durationMs: number, issues: StoreReloadIssue[]) => void;
  bumpRevision: () => number;
}

export async function reloadStoreFromDisk(context: ReloadLifecycleContext): Promise<void> {
  const startedAt = Date.now();
  await recoverInterruptedInitiativeWrites(context.rootDir);
  const snapshot = await loadStoreSnapshot({
    rootDir: context.rootDir,
    runAttemptKey: context.runAttemptKey,
    normalizeInitiative: context.normalizeInitiative
  });

  context.setConfig(snapshot.config);
  replaceMapContents(context.initiatives, snapshot.initiatives);
  replaceMapContents(context.tickets, snapshot.tickets);
  replaceMapContents(context.runs, snapshot.runs);
  replaceMapContents(context.runAttempts, snapshot.runAttempts);
  replaceMapContents(context.specs, snapshot.specs);
  replaceMapContents(context.planningReviews, snapshot.planningReviews);
  replaceMapContents(context.pendingTicketPlans, snapshot.pendingTicketPlans);
  replaceMapContents(context.ticketCoverageArtifacts, snapshot.ticketCoverageArtifacts);
  replaceMapContents(context.artifactTraces, snapshot.artifactTraces);
  context.setReloadState(Date.now() - startedAt, snapshot.issues);
  const revision = context.bumpRevision();

  rebuildOperationIndex(context.operationIndex, context.runs);

  logObservabilityEvent({
    layer: "store",
    event: "store.reload",
    status: snapshot.issues.length > 0 ? "error" : "ok",
    durationMs: Date.now() - startedAt,
    details: {
      revision,
      initiativeCount: context.initiatives.size,
      ticketCount: context.tickets.size,
      runCount: context.runs.size,
      runAttemptCount: context.runAttempts.size,
      reloadIssueCount: snapshot.issues.length
    }
  });
}
