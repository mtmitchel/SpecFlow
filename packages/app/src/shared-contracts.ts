import type {
  AgentType,
  OperationState,
  RedactedConfig,
  RunAttemptSummary,
} from "./types/entities.js";

export type {
  ConfigSavePayload,
  Initiative,
  InitiativeArtifactStep,
  InitiativePhase,
  InitiativePlanningDecisionType,
  InitiativePlanningQuestion,
  InitiativePlanningQuestionType,
  InitiativePlanningStep,
  InitiativePlanningStepStatus,
  InitiativePlanningSurface,
  InitiativeRefinementState,
  InitiativeWorkflow,
  InitiativeWorkflowStep,
  PlanningReviewArtifact,
  PlanningReviewFinding,
  PlanningReviewFindingType,
  PlanningReviewKind,
  PlanningReviewStatus,
  ProviderId,
  ProviderKeyStatus,
  OperationState,
  Run,
  RunAttemptSummary,
  SaveProviderKeyPayload,
  SpecDocument,
  SpecDocumentSummary,
  Ticket,
  TicketCoverageArtifact,
  TicketCoverageItem,
  TicketStatus,
  VerificationSeverity,
} from "./types/entities.js";
export type { AuditCategory, AuditFinding, AuditReport } from "./audit/types.js";
export {
  ARTIFACT_STEPS,
  PLANNING_STEPS,
  PLANNING_STEP_LABELS,
  PLANNING_STEP_STATUS_LABELS,
  REVIEW_KIND_LABELS,
  REVIEW_KINDS,
  REVIEWS_BY_ARTIFACT_STEP,
  VALIDATION_REVIEW_KINDS,
  getNextPlanningStep,
  getPrerequisitePlanningStep,
  isReviewResolved,
} from "./planner/workflow-contract.js";

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
  config: RedactedConfig | null;
  meta?: ArtifactsSnapshotMeta;
  workspaceRoot?: string;
  initiatives: import("./types/entities.js").Initiative[];
  tickets: import("./types/entities.js").Ticket[];
  runs: import("./types/entities.js").Run[];
  runAttempts: RunAttemptRecord[];
  specs: import("./types/entities.js").SpecDocumentSummary[];
  planningReviews: import("./types/entities.js").PlanningReviewArtifact[];
  ticketCoverageArtifacts: import("./types/entities.js").TicketCoverageArtifact[];
}
