import type {
  AgentTarget,
  ArtifactsSnapshot,
  AuditCategory,
  AuditFinding,
  AuditReport,
  Config,
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
  OperationState,
  OperationStatusRecord,
  PlanningReviewArtifact,
  PlanningReviewFinding,
  PlanningReviewFindingType,
  PlanningReviewKind,
  PlanningReviewStatus,
  ProviderId,
  ProviderKeyStatus,
  Run,
  RunAttemptRecord,
  SaveProviderKeyPayload,
  SpecDocument,
  SpecDocumentSummary,
  Ticket,
  TicketCoverageArtifact,
  TicketCoverageItem,
  TicketStatus,
  VerificationSeverity,
} from "./shared-contracts.js";

export type {
  AgentTarget,
  ArtifactsSnapshot,
  AuditCategory,
  AuditFinding,
  AuditReport,
  Config,
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
  OperationState,
  OperationStatusRecord,
  PlanningReviewArtifact,
  PlanningReviewFinding,
  PlanningReviewFindingType,
  PlanningReviewKind,
  PlanningReviewStatus,
  ProviderId,
  ProviderKeyStatus,
  Run,
  SaveProviderKeyPayload,
  SpecDocument,
  SpecDocumentSummary,
  Ticket,
  TicketCoverageArtifact,
  TicketCoverageItem,
  TicketStatus,
  VerificationSeverity,
};

export type RunAttempt = RunAttemptRecord;

export interface RunListAttempt {
  attemptId: string;
  overallPass: boolean;
  createdAt: string;
}

export interface RunListItem {
  run: Run;
  ticket: Ticket | null;
  attempts: RunListAttempt[];
  operationState: OperationState | null;
}

export interface VerificationResult {
  overallPass: boolean;
  criteriaResults: Array<{
    criterionId: string;
    pass: boolean;
    evidence: string;
    severity?: VerificationSeverity;
    remediationHint?: string;
  }>;
  driftFlags: Array<{
    type: string;
    file: string;
    description: string;
    severity?: VerificationSeverity;
  }>;
}

export interface RunAttemptDetail {
  id: string;
  attemptId: string;
  agentSummary: string;
  diffSource: "git" | "snapshot";
  initialScopePaths: string[];
  widenedScopePaths: string[];
  primaryDiffPath: string;
  driftDiffPath: string | null;
  overrideReason: string | null;
  overrideAccepted: boolean;
  criteriaResults: Array<{
    criterionId: string;
    pass: boolean;
    evidence: string;
    severity?: VerificationSeverity;
    remediationHint?: string;
  }>;
  driftFlags: Array<{
    type: string;
    file: string;
    description: string;
    severity?: VerificationSeverity;
  }>;
  overallPass: boolean;
  createdAt: string;
}

export interface RunDetailAttemptSummary {
  id: string;
  attemptId: string;
  overallPass: boolean;
  overrideReason: string | null;
  overrideAccepted: boolean;
  createdAt: string;
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
    bundleManifest: {
      contextFiles: string[];
      requiredFiles: string[];
      [key: string]: unknown;
    } | null;
  } | null;
}

export interface RunDiffPayload {
  kind: "primary" | "drift";
  diff: string;
}

export interface ProviderModel {
  id: string;
  name: string;
  contextLength: number | null;
}
