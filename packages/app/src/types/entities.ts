export type InitiativeStatus = "draft" | "active" | "done";
export type PhaseStatus = "active" | "complete";
export type InitiativePlanningQuestionType = "select" | "multi-select" | "boolean";
export type InitiativePlanningStep = "brief" | "core-flows" | "prd" | "tech-spec" | "tickets";
export type InitiativeArtifactStep = Exclude<InitiativePlanningStep, "tickets">;
export type InitiativePlanningStepStatus = "locked" | "ready" | "complete" | "stale";
export type InitiativePlanningDecisionType =
  | "problem"
  | "user"
  | "success"
  | "constraint"
  | "journey"
  | "branch"
  | "state"
  | "failure-mode"
  | "behavior"
  | "rule"
  | "scope"
  | "non-goal"
  | "priority"
  | "architecture"
  | "data-flow"
  | "persistence"
  | "integration"
  | "risk"
  | "quality-strategy"
  | "verification"
  | "performance"
  | "operations"
  | "compatibility"
  | "existing-system";

export interface InitiativePlanningQuestion {
  id: string;
  label: string;
  type: InitiativePlanningQuestionType;
  whyThisBlocks: string;
  affectedArtifact: InitiativeArtifactStep;
  decisionType: InitiativePlanningDecisionType;
  assumptionIfUnanswered: string;
  options?: string[];
  optionHelp?: Record<string, string>;
  recommendedOption?: string | null;
  allowCustomAnswer?: boolean;
  reopensQuestionIds?: string[];
}

export interface InitiativeWorkflowStep {
  status: InitiativePlanningStepStatus;
  updatedAt: string | null;
}

export interface InitiativeRefinementState {
  questions: InitiativePlanningQuestion[];
  answers: Record<string, string | string[] | boolean>;
  defaultAnswerQuestionIds: string[];
  baseAssumptions: string[];
  checkedAt: string | null;
}

export interface InitiativeWorkflow {
  activeStep: InitiativePlanningStep;
  steps: Record<InitiativePlanningStep, InitiativeWorkflowStep>;
  refinements: Record<InitiativeArtifactStep, InitiativeRefinementState>;
}

export interface InitiativePhase {
  id: string;
  name: string;
  order: number;
  status: PhaseStatus;
}

export interface Initiative {
  id: string;
  title: string;
  description: string;
  status: InitiativeStatus;
  phases: InitiativePhase[];
  specIds: string[];
  ticketIds: string[];
  workflow: InitiativeWorkflow;
  createdAt: string;
  updatedAt: string;
}

export type TicketStatus = "backlog" | "ready" | "in-progress" | "verify" | "done";

export interface TicketCriterion {
  id: string;
  text: string;
}

export interface Ticket {
  id: string;
  initiativeId: string | null;
  phaseId: string | null;
  title: string;
  description: string;
  status: TicketStatus;
  acceptanceCriteria: TicketCriterion[];
  implementationPlan: string;
  fileTargets: string[];
  coverageItemIds: string[];
  blockedBy: string[];
  blocks: string[];
  runId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RunType = "execution" | "audit";
export type AgentType = "claude-code" | "codex-cli" | "opencode" | "generic";
export type RunStatus = "pending" | "complete";

export interface Run {
  id: string;
  ticketId: string | null;
  type: RunType;
  agentType: AgentType;
  status: RunStatus;
  attempts: string[];
  committedAttemptId: string | null;
  activeOperationId: string | null;
  operationLeaseExpiresAt: string | null;
  lastCommittedAt: string | null;
  createdAt: string;
}

export type VerificationSeverity = "critical" | "major" | "minor" | "outdated";

export interface DriftFlag {
  type: "unexpected-file" | "missing-requirement" | "pre-capture-drift" | "widened-scope-drift";
  file: string;
  description: string;
  severity?: VerificationSeverity;
}

export interface RunCriterionResult {
  criterionId: string;
  pass: boolean;
  evidence: string;
  severity?: VerificationSeverity;
  remediationHint?: string;
}

export interface RunAttempt {
  attemptId: string;
  agentSummary: string;
  diffSource: "git" | "snapshot";
  initialScopePaths: string[];
  widenedScopePaths: string[];
  primaryDiffPath: string;
  driftDiffPath: string | null;
  overrideReason: string | null;
  overrideAccepted: boolean;
  criteriaResults: RunCriterionResult[];
  driftFlags: DriftFlag[];
  overallPass: boolean;
  createdAt: string;
}

export interface RunAttemptSummary {
  attemptId: string;
  overallPass: boolean;
  overrideReason: string | null;
  overrideAccepted: boolean;
  createdAt: string;
}

export type SpecType = InitiativeArtifactStep | "decision";

export interface SpecDocument {
  id: string;
  initiativeId: string | null;
  type: SpecType;
  title: string;
  content: string;
  sourcePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpecDocumentSummary {
  id: string;
  initiativeId: string | null;
  type: SpecType;
  title: string;
  sourcePath: string;
  createdAt: string;
  updatedAt: string;
}

export type PlanningReviewKind =
  | "brief-review"
  | "brief-core-flows-crosscheck"
  | "core-flows-review"
  | "core-flows-prd-crosscheck"
  | "prd-review"
  | "prd-tech-spec-crosscheck"
  | "tech-spec-review"
  | "spec-set-review"
  | "ticket-coverage-review";

export type PlanningReviewStatus = "passed" | "blocked" | "overridden" | "stale";

export type PlanningReviewFindingType =
  | "blocker"
  | "warning"
  | "traceability-gap"
  | "assumption"
  | "recommended-fix";

export interface PlanningReviewFinding {
  id: string;
  type: PlanningReviewFindingType;
  message: string;
  relatedArtifacts: InitiativePlanningStep[];
}

export interface PlanningReviewArtifact {
  id: string;
  initiativeId: string;
  kind: PlanningReviewKind;
  status: PlanningReviewStatus;
  summary: string;
  findings: PlanningReviewFinding[];
  sourceUpdatedAts: Partial<Record<InitiativePlanningStep, string>>;
  overrideReason: string | null;
  reviewedAt: string;
  updatedAt: string;
}

export interface ArtifactTraceOutlineSection {
  key: string;
  label: string;
  items: string[];
}

export interface ArtifactTraceOutline {
  id: string;
  initiativeId: string;
  step: InitiativeArtifactStep;
  sections: ArtifactTraceOutlineSection[];
  sourceUpdatedAt: string;
  generatedAt: string;
  updatedAt: string;
}

export interface TicketCoverageItem {
  id: string;
  sourceStep: InitiativeArtifactStep;
  sectionKey: string;
  sectionLabel: string;
  kind: string;
  text: string;
}

export interface TicketCoverageArtifact {
  id: string;
  initiativeId: string;
  items: TicketCoverageItem[];
  uncoveredItemIds: string[];
  sourceUpdatedAts: Partial<Record<InitiativePlanningStep, string>>;
  generatedAt: string;
  updatedAt: string;
}

export type ProviderId = "anthropic" | "openai" | "openrouter";
export type ProviderKeyStatus = Record<ProviderId, boolean>;

export interface Config {
  provider: ProviderId;
  model: string;
  port: number;
  host: string;
  repoInstructionFile: string;
}

export interface RedactedConfig extends Config {
  hasApiKey: boolean;
  providerKeyStatus: ProviderKeyStatus;
}

export type ConfigSavePayload = Config;

export interface SaveProviderKeyPayload {
  provider: ProviderId;
  apiKey: string;
}

export type OperationState = "prepared" | "committed" | "abandoned" | "superseded" | "failed";

export interface OperationManifest {
  operationId: string;
  runId: string;
  targetAttemptId: string;
  state: OperationState;
  leaseExpiresAt: string;
  validation: {
    passed: boolean;
    details?: string;
  };
  preparedAt: string;
  updatedAt: string;
  committedAt?: string;
}
