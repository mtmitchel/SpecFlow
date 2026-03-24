import type { ArtifactsSnapshotMeta, StoreReloadIssue } from "../../types/contracts.js";
import type {
  Config,
  Initiative,
  PlanningReviewArtifact,
  Run,
  RunAttemptSummary,
  SpecDocumentSummary,
  Ticket,
  TicketCoverageArtifact
} from "../../types/entities.js";

interface SnapshotMetaContext {
  revision: number;
  now: () => Date;
  lastReloadDurationMs: number;
  lastReloadIssues: StoreReloadIssue[];
  lastSnapshotPayloadBytes: number;
}

interface SnapshotPayloadMeasurementContext extends SnapshotMetaContext {
  rootDir: string;
  config: Config | null;
  initiatives: Map<string, Initiative>;
  tickets: Map<string, Ticket>;
  runs: Map<string, Run>;
  runAttempts: Map<string, RunAttemptSummary>;
  specs: Map<string, SpecDocumentSummary>;
  planningReviews: Map<string, PlanningReviewArtifact>;
  ticketCoverageArtifacts: Map<string, TicketCoverageArtifact>;
}

export function buildArtifactsSnapshotMeta(context: SnapshotMetaContext): ArtifactsSnapshotMeta {
  return {
    revision: context.revision,
    generatedAt: context.now().toISOString(),
    generationTimeMs: context.lastReloadDurationMs,
    payloadBytes: context.lastSnapshotPayloadBytes,
    reloadIssues: context.lastReloadIssues.slice()
  };
}

export function measureArtifactsSnapshotBytes(
  context: SnapshotPayloadMeasurementContext
): number {
  const snapshotForMeasurement = {
    config: context.config,
    meta: buildArtifactsSnapshotMeta(context),
    workspaceRoot: context.rootDir,
    initiatives: Array.from(context.initiatives.values()),
    tickets: Array.from(context.tickets.values()),
    runs: Array.from(context.runs.values()),
    runAttempts: Array.from(context.runAttempts.entries()).map(([id, value]) => ({ id, ...value })),
    specs: Array.from(context.specs.values()),
    planningReviews: Array.from(context.planningReviews.values()),
    ticketCoverageArtifacts: Array.from(context.ticketCoverageArtifacts.values())
  };

  return Buffer.byteLength(JSON.stringify(snapshotForMeasurement), "utf8");
}
