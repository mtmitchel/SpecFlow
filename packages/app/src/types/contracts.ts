import type {
  AgentType,
  DriftFlag,
  Initiative,
  InitiativePlanningQuestion,
  OperationState,
  PlanningReviewArtifact,
  RedactedConfig,
  Run,
  RunAttempt,
  RunAttemptSummary,
  RunCriterionResult,
  SpecDocumentSummary,
  Ticket,
  TicketCoverageArtifact,
} from "./entities.js";

export type AgentTarget = AgentType;
export type Config = RedactedConfig;

export interface StoreReloadIssue {
  scope: "config" | "initiative" | "ticket" | "run" | "decision" | "reload";
  path: string;
  message: string;
}

export interface ArtifactsSnapshotMeta {
  revision: number;
  generatedAt: string;
  generationTimeMs: number;
  payloadBytes: number;
  reloadIssues: StoreReloadIssue[];
}

export interface OperationStatusRecord {
  operationId: string;
  runId: string;
  targetAttemptId: string;
  state: OperationState;
  leaseExpiresAt: string;
  updatedAt: string;
}

export interface RunAttemptRecord extends RunAttemptSummary {
  id: string;
}

export interface ArtifactsSnapshot {
  config: Config | null;
  meta?: ArtifactsSnapshotMeta;
  workspaceRoot?: string;
  initiatives: Initiative[];
  tickets: Ticket[];
  runs: Run[];
  runAttempts: RunAttemptRecord[];
  specs: SpecDocumentSummary[];
  planningReviews: PlanningReviewArtifact[];
  ticketCoverageArtifacts: TicketCoverageArtifact[];
}

export interface InitiativePhaseCheckResult {
  decision: "proceed" | "ask";
  questions: InitiativePlanningQuestion[];
  assumptions: string[];
}

export interface VerificationResult {
  overallPass: boolean;
  criteriaResults: RunCriterionResult[];
  driftFlags: DriftFlag[];
}

export interface RunAttemptDetail extends RunAttempt {
  id: string;
}

export interface RunListItem {
  run: Run;
  ticket: Ticket | null;
  attempts: RunAttemptSummary[];
  operationState: OperationState | null;
}

export type RunDetailAttemptSummary = RunAttemptRecord;

export interface RunBundleManifestPreview {
  contextFiles: string[];
  requiredFiles: string[];
}

export interface RunDetail {
  run: Run;
  ticket: Ticket | null;
  attempts: RunDetailAttemptSummary[];
  operationState: OperationState | null;
  committed: {
    attemptId: string;
    attempt: RunDetailAttemptSummary | null;
    attemptDetail?: RunAttemptDetail | null;
    bundleManifest: RunBundleManifestPreview | null;
  } | null;
}

export interface RunAttemptDetailPayload {
  attempt: RunAttemptDetail;
}

export interface RunStatePayload {
  run: Run;
  attempts: RunAttempt[];
}

export interface RunProgressPayload {
  run: Run;
  operationState: OperationState | null;
  attempts: RunAttemptSummary[];
}

export interface RunDiffPayload {
  kind: "primary" | "drift";
  diff: string;
}
