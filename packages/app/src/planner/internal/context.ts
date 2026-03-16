import type {
  Initiative,
  InitiativeArtifactStep,
  SpecDocument,
  Ticket
} from "../../types/entities.js";
import { getRefinementAssumptions } from "../workflow-state.js";
import type {
  PhaseCheckInput,
  RefinementStep,
  SpecGenInput
} from "../types.js";

export const getSavedContext = (
  initiative: Initiative,
  step: RefinementStep
): Record<string, string | string[] | boolean> => {
  const context: Record<string, string | string[] | boolean> = {};
  for (const phase of ["brief", "core-flows", "prd", "tech-spec"] as const) {
    const refinement = initiative.workflow.refinements[phase];
    for (const [questionId, answer] of Object.entries(refinement.answers)) {
      context[`${phase}:${questionId}`] = answer;
    }
    for (const assumption of getRefinementAssumptions(initiative.workflow, phase)) {
      context[`${phase}:assumption:${Object.keys(context).length}`] = assumption;
    }
    if (phase === step) {
      break;
    }
  }
  return context;
};

export const getArtifactMarkdownMap = (
  initiativeId: string,
  specs: ReadonlyMap<string, SpecDocument>
): Record<InitiativeArtifactStep, string> => ({
  brief: specs.get(`${initiativeId}:brief`)?.content ?? "",
  "core-flows": specs.get(`${initiativeId}:core-flows`)?.content ?? "",
  prd: specs.get(`${initiativeId}:prd`)?.content ?? "",
  "tech-spec": specs.get(`${initiativeId}:tech-spec`)?.content ?? ""
});

export const buildPhaseCheckInput = (
  initiative: Initiative,
  step: RefinementStep,
  markdownByStep: Record<InitiativeArtifactStep, string>
): PhaseCheckInput => ({
  initiativeDescription: initiative.description,
  phase: step,
  briefMarkdown: markdownByStep.brief,
  coreFlowsMarkdown: markdownByStep["core-flows"],
  prdMarkdown: markdownByStep.prd,
  savedContext: getSavedContext(initiative, step)
});

export const buildSpecGenerationInput = (
  initiative: Initiative,
  step: RefinementStep,
  markdownByStep: Record<InitiativeArtifactStep, string>
): SpecGenInput => ({
  initiativeDescription: initiative.description,
  savedContext: getSavedContext(initiative, step),
  assumptions: getRefinementAssumptions(initiative.workflow, step),
  briefMarkdown: step === "brief" ? undefined : markdownByStep.brief,
  coreFlowsMarkdown: step === "brief" || step === "core-flows" ? undefined : markdownByStep["core-flows"],
  prdMarkdown: step === "tech-spec" ? markdownByStep.prd : undefined,
  techSpecMarkdown: step === "tech-spec" ? markdownByStep["tech-spec"] : undefined
});

export const requireSpecMarkdown = (
  initiativeId: string,
  step: InitiativeArtifactStep,
  specs: ReadonlyMap<string, SpecDocument>
): string => {
  const markdown = specs.get(`${initiativeId}:${step}`)?.content ?? "";
  if (!markdown.trim()) {
    throw new Error(`Artifact ${step} is missing for initiative ${initiativeId}`);
  }
  return markdown;
};

export const requireSpecUpdatedAt = (
  initiativeId: string,
  step: InitiativeArtifactStep,
  specs: ReadonlyMap<string, SpecDocument>
): string => {
  const updatedAt = specs.get(`${initiativeId}:${step}`)?.updatedAt;
  if (!updatedAt) {
    throw new Error(`Artifact ${step} metadata is missing for initiative ${initiativeId}`);
  }
  return updatedAt;
};

export const getInitiativeTickets = (
  initiative: Initiative,
  tickets: ReadonlyMap<string, Ticket>
): Ticket[] => {
  const phaseOrder = new Map(initiative.phases.map((phase) => [phase.id, phase.order]));

  return Array.from(tickets.values())
    .filter((ticket) => ticket.initiativeId === initiative.id)
    .sort((left, right) => {
      const leftPhase = left.phaseId
        ? (phaseOrder.get(left.phaseId) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;
      const rightPhase = right.phaseId
        ? (phaseOrder.get(right.phaseId) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;

      if (leftPhase !== rightPhase) {
        return leftPhase - rightPhase;
      }

      return left.createdAt.localeCompare(right.createdAt);
    });
};
