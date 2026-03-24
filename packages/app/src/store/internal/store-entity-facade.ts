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
} from "./store-entity-operations.js";
import type {
  ArtifactTraceOutline,
  Config,
  Initiative,
  PendingTicketPlanArtifact,
  PlanningReviewArtifact,
  Run,
  RunAttempt,
  RunAttemptSummary,
  SpecDocument,
  SpecDocumentSummary,
  Ticket,
  TicketCoverageArtifact
} from "../../types/entities.js";

interface StoreEntityFacadeContext {
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
  reloadFromDisk: () => Promise<void>;
  suppressWatcher: () => void;
  resumeWatcher: () => void;
  deleteRun: (runId: string) => Promise<void>;
  deleteTicket: (ticketId: string) => Promise<void>;
  setConfig: (config: Config) => void;
  bumpRevision: () => number;
  refreshSnapshotPayloadBytes: () => void;
}

export async function upsertConfigInStore(
  context: StoreEntityFacadeContext,
  config: Config
): Promise<void> {
  await upsertConfigRecord(
    {
      rootDir: context.rootDir,
      bumpRevision: () => context.bumpRevision()
    },
    config
  );
  context.setConfig(config);
  context.refreshSnapshotPayloadBytes();
}

export async function upsertInitiativeInStore(
  context: StoreEntityFacadeContext,
  initiative: Initiative,
  docs: { brief?: string; coreFlows?: string; prd?: string; techSpec?: string } = {}
): Promise<void> {
  await upsertInitiativeRecord(
    {
      rootDir: context.rootDir,
      initiatives: context.initiatives,
      specs: context.specs,
      planningReviews: context.planningReviews,
      pendingTicketPlans: context.pendingTicketPlans,
      tickets: context.tickets,
      normalizeInitiative: context.normalizeInitiative,
      reloadFromDisk: context.reloadFromDisk,
      suppressWatcher: context.suppressWatcher,
      resumeWatcher: context.resumeWatcher,
      bumpRevision: () => context.bumpRevision()
    },
    initiative,
    docs
  );
  context.refreshSnapshotPayloadBytes();
}

export async function deleteInitiativeInStore(
  context: StoreEntityFacadeContext,
  id: string
): Promise<void> {
  await deleteInitiativeRecord(
    {
      rootDir: context.rootDir,
      initiatives: context.initiatives,
      tickets: context.tickets,
      runs: context.runs,
      specs: context.specs,
      planningReviews: context.planningReviews,
      pendingTicketPlans: context.pendingTicketPlans,
      ticketCoverageArtifacts: context.ticketCoverageArtifacts,
      artifactTraces: context.artifactTraces,
      deleteRun: context.deleteRun,
      deleteTicket: context.deleteTicket,
      bumpRevision: () => context.bumpRevision()
    },
    id
  );
  context.refreshSnapshotPayloadBytes();
}

export async function upsertTicketInStore(
  context: StoreEntityFacadeContext,
  ticket: Ticket
): Promise<void> {
  await upsertTicketRecord(
    {
      rootDir: context.rootDir,
      tickets: context.tickets,
      bumpRevision: () => context.bumpRevision()
    },
    ticket
  );
  context.refreshSnapshotPayloadBytes();
}

export async function deleteTicketInStore(
  context: StoreEntityFacadeContext,
  id: string
): Promise<void> {
  await deleteTicketRecord(
    {
      rootDir: context.rootDir,
      tickets: context.tickets,
      bumpRevision: () => context.bumpRevision()
    },
    id
  );
  context.refreshSnapshotPayloadBytes();
}

export async function deleteRunInStore(
  context: StoreEntityFacadeContext,
  id: string
): Promise<void> {
  await deleteRunRecord(
    {
      rootDir: context.rootDir,
      runs: context.runs,
      runAttempts: context.runAttempts,
      bumpRevision: () => context.bumpRevision()
    },
    id
  );
  context.refreshSnapshotPayloadBytes();
}

export async function upsertRunInStore(
  context: StoreEntityFacadeContext,
  run: Run
): Promise<void> {
  await upsertRunRecord(
    {
      rootDir: context.rootDir,
      runs: context.runs,
      bumpRevision: () => context.bumpRevision()
    },
    run
  );
  context.refreshSnapshotPayloadBytes();
}

export async function upsertRunAttemptInStore(
  context: StoreEntityFacadeContext,
  runId: string,
  attempt: RunAttempt
): Promise<void> {
  await upsertRunAttemptRecord(
    {
      rootDir: context.rootDir,
      runAttempts: context.runAttempts,
      bumpRevision: () => context.bumpRevision()
    },
    runId,
    attempt
  );
  context.refreshSnapshotPayloadBytes();
}

export function readRunAttemptInStore(
  context: StoreEntityFacadeContext,
  runId: string,
  attemptId: string
): Promise<RunAttempt | null> {
  return readRunAttemptRecord(context.rootDir, runId, attemptId);
}

export function readSpecInStore(
  context: StoreEntityFacadeContext,
  specId: string
): Promise<SpecDocument | null> {
  return readSpecRecord(context.specs, specId);
}

export async function upsertSpecInStore(
  context: StoreEntityFacadeContext,
  spec: SpecDocument
): Promise<void> {
  await upsertSpecRecord(
    {
      rootDir: context.rootDir,
      reloadFromDisk: context.reloadFromDisk,
      bumpRevision: () => context.bumpRevision()
    },
    spec
  );
  context.refreshSnapshotPayloadBytes();
}

export async function upsertPlanningReviewInStore(
  context: StoreEntityFacadeContext,
  review: PlanningReviewArtifact
): Promise<void> {
  await upsertPlanningReviewRecord(
    {
      rootDir: context.rootDir,
      planningReviews: context.planningReviews,
      bumpRevision: () => context.bumpRevision()
    },
    review
  );
  context.refreshSnapshotPayloadBytes();
}

export async function upsertPendingTicketPlanArtifactInStore(
  context: StoreEntityFacadeContext,
  plan: PendingTicketPlanArtifact
): Promise<void> {
  await upsertPendingTicketPlanRecord(
    {
      rootDir: context.rootDir,
      pendingTicketPlans: context.pendingTicketPlans,
      bumpRevision: () => context.bumpRevision()
    },
    plan
  );
  context.refreshSnapshotPayloadBytes();
}

export async function deletePendingTicketPlanArtifactInStore(
  context: StoreEntityFacadeContext,
  initiativeId: string
): Promise<void> {
  await deletePendingTicketPlanRecord(
    {
      rootDir: context.rootDir,
      pendingTicketPlans: context.pendingTicketPlans,
      bumpRevision: () => context.bumpRevision()
    },
    initiativeId
  );
  context.refreshSnapshotPayloadBytes();
}

export async function upsertTicketCoverageArtifactInStore(
  context: StoreEntityFacadeContext,
  coverage: TicketCoverageArtifact
): Promise<void> {
  await upsertTicketCoverageRecord(
    {
      rootDir: context.rootDir,
      ticketCoverageArtifacts: context.ticketCoverageArtifacts,
      bumpRevision: () => context.bumpRevision()
    },
    coverage
  );
  context.refreshSnapshotPayloadBytes();
}

export async function upsertArtifactTraceInStore(
  context: StoreEntityFacadeContext,
  trace: ArtifactTraceOutline
): Promise<void> {
  await upsertArtifactTraceRecord(
    {
      rootDir: context.rootDir,
      artifactTraces: context.artifactTraces,
      bumpRevision: () => context.bumpRevision()
    },
    trace
  );
  context.refreshSnapshotPayloadBytes();
}
