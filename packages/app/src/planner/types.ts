export type PlannerQuestionType = "text" | "select" | "multi-select" | "boolean";

export interface PlannerQuestion {
  id: string;
  label: string;
  type: PlannerQuestionType;
  options?: string[];
}

export interface ClarifyResult {
  title?: string;
  questions: PlannerQuestion[];
}

export interface SpecGenResult {
  briefMarkdown: string;
  prdMarkdown: string;
  techSpecMarkdown: string;
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

export interface ClarifyInput {
  description: string;
}

export interface SpecGenInput {
  initiativeDescription: string;
  answers: Record<string, string | string[] | boolean>;
}

export interface PlanInput {
  initiativeDescription: string;
  briefMarkdown: string;
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
