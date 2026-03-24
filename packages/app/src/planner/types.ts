import type {
  ArtifactTraceOutlineSection,
  InitiativePlanningDecisionType,
  InitiativePlanningQuestion,
  InitiativePlanningQuestionType,
  InitiativePlanningStep,
  PlanningReviewKind,
  TicketCoverageItem
} from "../types/entities.js";
import type { InitiativePhaseCheckResult } from "../types/contracts.js";

export type PlannerQuestionType = InitiativePlanningQuestionType;
export type PlannerQuestion = InitiativePlanningQuestion;
export type RefinementStep = Extract<InitiativePlanningStep, "brief" | "core-flows" | "prd" | "tech-spec">;
export type RefinementHistoryResolution = "answered" | "defaulted" | "unanswered";

export interface RefinementHistoryEntry {
  step: RefinementStep;
  questionId: string;
  label: string;
  decisionType: InitiativePlanningDecisionType;
  whyThisBlocks: string;
  resolution: RefinementHistoryResolution;
  answer: string | string[] | boolean | null;
  assumption: string | null;
}

export interface PlannerRepoContext {
  fileTree: string;
  totalFiles: number;
  configSummary: string;
}

export type PhaseCheckResult = InitiativePhaseCheckResult;

export interface ClarifyHelpInput {
  initiativeDescription: string;
  savedContext: Record<string, string | string[] | boolean>;
  question: PlannerQuestion;
  note?: string;
}

export interface ClarifyHelpResult {
  guidance: string;
}

export interface PhaseMarkdownResult {
  initiativeTitle?: string;
  markdown: string;
  traceOutline: {
    sections: ArtifactTraceOutlineSection[];
  };
}

export interface ReviewRunResult {
  summary: string;
  blockers: string[];
  warnings: string[];
  traceabilityGaps: string[];
  assumptions: string[];
  recommendedFixes: string[];
}

export interface PlanTicketStub {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  fileTargets: string[];
  coverageItemIds: string[];
}

export interface PlanPhase {
  name: string;
  order: number;
  tickets: PlanTicketStub[];
}

export interface PlanResult {
  phases: PlanPhase[];
  uncoveredCoverageItemIds: string[];
}

export type PlanValidationIssueKind =
  | "ticket-missing-coverage"
  | "unknown-ticket-coverage-item"
  | "unknown-uncovered-coverage-item"
  | "assigned-and-uncovered-coverage-item"
  | "missing-coverage-item"
  | "review-finding";

export interface PlanValidationIssue {
  kind: PlanValidationIssueKind;
  message: string;
  coverageItemId?: string;
  coverageItem?: TicketCoverageItem;
  ticketTitle?: string;
}

export interface PlanValidationFeedback {
  summary: string;
  issues: PlanValidationIssue[];
}

export interface TriageTicketDraft {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  implementationPlan: string;
  fileTargets: string[];
}

export interface TriageResult {
  decision: "ok" | "too-large";
  reason: string;
  ticketDraft?: TriageTicketDraft;
  initiativeTitle?: string;
}

export interface PhaseCheckInput {
  initiativeDescription: string;
  phase: RefinementStep;
  briefMarkdown?: string;
  coreFlowsMarkdown?: string;
  prdMarkdown?: string;
  savedContext?: Record<string, string | string[] | boolean>;
  refinementHistory?: RefinementHistoryEntry[];
  repoContext?: PlannerRepoContext;
  requiresInitialConsultation?: boolean;
  requiredStarterQuestionCount?: number;
  validationFeedback?: string;
}

export interface SpecGenInput {
  initiativeDescription: string;
  savedContext: Record<string, string | string[] | boolean>;
  refinementHistory: RefinementHistoryEntry[];
  assumptions: string[];
  briefMarkdown?: string;
  coreFlowsMarkdown?: string;
  prdMarkdown?: string;
  techSpecMarkdown?: string;
  repoContext?: PlannerRepoContext;
}

export type PlannerTraceOutlineMap = Partial<
  Record<RefinementStep, { sections: ArtifactTraceOutlineSection[] }>
>;

export interface PlanInput {
  initiativeDescription: string;
  traceOutlines: PlannerTraceOutlineMap;
  coverageItems: TicketCoverageItem[];
  repoContext?: PlannerRepoContext;
  validationFeedback?: PlanValidationFeedback;
  previousInvalidResult?: unknown;
}

export interface TriageInput {
  description: string;
}

export interface ReviewRunInput {
  initiativeDescription: string;
  kind: PlanningReviewKind;
  briefMarkdown?: string;
  coreFlowsMarkdown?: string;
  prdMarkdown?: string;
  techSpecMarkdown?: string;
  traceOutlines?: PlannerTraceOutlineMap;
  coverageItems?: TicketCoverageItem[];
  uncoveredCoverageItemIds?: string[];
  tickets?: Array<{
    title: string;
    description: string;
    acceptanceCriteria: string[];
    fileTargets: string[];
    coverageItemIds: string[];
  }>;
}
