import type {
  ArtifactTraceOutlineSection,
  InitiativePlanningQuestion,
  InitiativePlanningQuestionType,
  InitiativePlanningStep,
  PlanningReviewKind
} from "../types/entities.js";

export type PlannerQuestionType = InitiativePlanningQuestionType;
export type PlannerQuestion = InitiativePlanningQuestion;
export type RefinementStep = Extract<InitiativePlanningStep, "brief" | "core-flows" | "prd" | "tech-spec">;

export interface PhaseCheckResult {
  decision: "proceed" | "ask";
  questions: PlannerQuestion[];
  assumptions: string[];
}

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
}

export interface PlanPhase {
  name: string;
  order: number;
  tickets: PlanTicketStub[];
}

export interface PlanResult {
  phases: PlanPhase[];
  mermaidDiagram?: string;
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
}

export interface SpecGenInput {
  initiativeDescription: string;
  savedContext: Record<string, string | string[] | boolean>;
  assumptions: string[];
  briefMarkdown?: string;
  coreFlowsMarkdown?: string;
  prdMarkdown?: string;
  techSpecMarkdown?: string;
}

export interface PlanInput {
  initiativeDescription: string;
  briefMarkdown: string;
  coreFlowsMarkdown: string;
  prdMarkdown: string;
  techSpecMarkdown: string;
  repoContext?: {
    fileTree: string;
    totalFiles: number;
    configSummary: string;
  };
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
  traceOutlines?: Partial<Record<RefinementStep, { sections: ArtifactTraceOutlineSection[] }>>;
}
