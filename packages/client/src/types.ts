export type TicketStatus = "backlog" | "ready" | "in-progress" | "verify" | "done";

export type AgentTarget = "claude-code" | "codex-cli" | "opencode" | "generic";
export type InitiativePlanningQuestionType = "select" | "multi-select" | "boolean";
export type InitiativePlanningStep = "brief" | "core-flows" | "prd" | "tech-spec" | "validation" | "tickets";
export type InitiativeArtifactStep = Exclude<InitiativePlanningStep, "validation" | "tickets">;
export type InitiativePlanningStepStatus = "locked" | "ready" | "complete" | "stale";
export type InitiativePlanningSurface = "questions" | "review";
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
  history?: InitiativePlanningQuestion[];
  answers: Record<string, string | string[] | boolean>;
  defaultAnswerQuestionIds: string[];
  baseAssumptions: string[];
  preferredSurface?: InitiativePlanningSurface | null;
  checkedAt: string | null;
}

export interface InitiativeWorkflow {
  activeStep: InitiativePlanningStep;
  resumeTicketId?: string | null;
  steps: Record<InitiativePlanningStep, InitiativeWorkflowStep>;
  refinements: Record<InitiativeArtifactStep, InitiativeRefinementState>;
}

export interface InitiativePhase {
  id: string;
  name: string;
  order: number;
  status: "active" | "complete";
}

export interface Initiative {
  id: string;
  title: string;
  description: string;
  status: "draft" | "active" | "done";
  phases: InitiativePhase[];
  specIds: string[];
  ticketIds: string[];
  workflow: InitiativeWorkflow;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: string;
  initiativeId: string | null;
  phaseId: string | null;
  title: string;
  description: string;
  status: TicketStatus;
  acceptanceCriteria: Array<{ id: string; text: string }>;
  implementationPlan: string;
  fileTargets: string[];
  coverageItemIds: string[];
  blockedBy: string[];
  blocks: string[];
  runId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  ticketId: string | null;
  type: "execution" | "audit";
  agentType: "claude-code" | "codex-cli" | "opencode" | "generic";
  status: "pending" | "complete";
  attempts: string[];
  committedAttemptId: string | null;
  activeOperationId: string | null;
  operationLeaseExpiresAt: string | null;
  lastCommittedAt: string | null;
  createdAt: string;
}

export interface RunAttempt {
  id: string;
  attemptId: string;
  overallPass: boolean;
  overrideReason: string | null;
  overrideAccepted: boolean;
  createdAt: string;
}

export interface RunListAttempt {
  attemptId: string;
  overallPass: boolean;
  createdAt: string;
}

export interface RunListItem {
  run: Run;
  ticket: Ticket | null;
  attempts: RunListAttempt[];
  operationState: "prepared" | "committed" | "abandoned" | "superseded" | "failed" | null;
}

export type VerificationSeverity = "critical" | "major" | "minor" | "outdated";

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
  operationState: "prepared" | "committed" | "abandoned" | "superseded" | "failed" | null;
  committed: {
    attemptId: string;
    attempt: RunDetailAttemptSummary | null;
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

export type AuditCategory = "drift" | "acceptance" | "convention" | "bug" | "performance" | "security" | "clarity";

export interface AuditFinding {
  id: string;
  severity: "error" | "warning" | "info";
  category: AuditCategory;
  file: string;
  line: number | null;
  description: string;
  confidence?: number;
  dismissed: boolean;
  dismissNote: string | null;
}

export interface AuditReport {
  runId: string;
  generatedAt: string;
  diffSourceMode: "branch" | "commit-range" | "snapshot";
  defaultScope: string[];
  primaryDiff: string;
  driftDiff: string | null;
  findings: AuditFinding[];
}

export interface SpecDocument {
  id: string;
  initiativeId: string | null;
  type: InitiativeArtifactStep | "decision";
  title: string;
  content: string;
  sourcePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpecDocumentSummary {
  id: string;
  initiativeId: string | null;
  type: InitiativeArtifactStep | "decision";
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
  hasApiKey: boolean;
  providerKeyStatus: ProviderKeyStatus;
  port: number;
  host: string;
  repoInstructionFile: string;
}

export interface ConfigSavePayload {
  provider: ProviderId;
  model: string;
  port: number;
  host: string;
  repoInstructionFile: string;
}

export interface SaveProviderKeyPayload {
  provider: ProviderId;
  apiKey: string;
}

export interface ProviderModel {
  id: string;
  name: string;
  contextLength: number | null;
}

export interface ArtifactsSnapshot {
  config: Config | null;
  initiatives: Initiative[];
  tickets: Ticket[];
  runs: Run[];
  runAttempts: RunAttempt[];
  specs: SpecDocumentSummary[];
  planningReviews: PlanningReviewArtifact[];
  ticketCoverageArtifacts: TicketCoverageArtifact[];
}
