import type {
  Initiative,
  InitiativeArtifactStep,
  InitiativePlanningQuestion,
  SpecDocumentSummary,
  Ticket
} from "../../types/entities.js";
import { requiresInitialBriefConsultation } from "../brief-consultation.js";
import { normalizeDecisionType } from "../decision-types.js";
import { getRequiredStarterQuestionCount } from "../refinement-check-policy.js";
import { getRefinementAssumptions } from "../workflow-state.js";
import type {
  PhaseCheckInput,
  PlannerRepoContext,
  RefinementHistoryEntry,
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

const toRefinementHistoryEntry = (
  step: RefinementStep,
  question: InitiativePlanningQuestion,
  refinement: Initiative["workflow"]["refinements"][RefinementStep]
): RefinementHistoryEntry => {
  const answer = refinement.answers[question.id];
  const usedDefault = refinement.defaultAnswerQuestionIds.includes(question.id) && answer === undefined;

  return {
    step,
    questionId: question.id,
    label: question.label,
    decisionType: normalizeDecisionType(question.decisionType),
    whyThisBlocks: question.whyThisBlocks,
    resolution:
      typeof answer === "boolean" ||
      (typeof answer === "string" && answer.trim().length > 0) ||
      (Array.isArray(answer) && answer.some((value) => value.trim().length > 0))
        ? "answered"
        : usedDefault
          ? "defaulted"
          : "unanswered",
    answer:
      typeof answer === "boolean" ||
      typeof answer === "string" ||
      Array.isArray(answer)
        ? answer
        : null,
    assumption: usedDefault ? question.assumptionIfUnanswered : null
  };
};

export const getRefinementHistory = (
  initiative: Initiative,
  step: RefinementStep
): RefinementHistoryEntry[] => {
  const history: RefinementHistoryEntry[] = [];

  for (const phase of ["brief", "core-flows", "prd", "tech-spec"] as const) {
    const refinement = initiative.workflow.refinements[phase];
    for (const question of refinement.history ?? refinement.questions) {
      history.push(toRefinementHistoryEntry(phase, question, refinement));
    }
    if (phase === step) {
      break;
    }
  }

  return history;
};

const hasExistingRefinementState = (
  initiative: Initiative,
  step: RefinementStep
): boolean => {
  const refinement = initiative.workflow.refinements[step];

  return (
    refinement.questions.length > 0 ||
    Object.keys(refinement.answers).length > 0 ||
    refinement.defaultAnswerQuestionIds.length > 0
  );
};

export const getArtifactMarkdownMap = (
  initiativeId: string,
  readSpecMarkdown: (specId: string) => Promise<string>
): Promise<Record<InitiativeArtifactStep, string>> =>
  Promise.all([
    readSpecMarkdown(`${initiativeId}:brief`),
    readSpecMarkdown(`${initiativeId}:core-flows`),
    readSpecMarkdown(`${initiativeId}:prd`),
    readSpecMarkdown(`${initiativeId}:tech-spec`)
  ]).then(([brief, coreFlows, prd, techSpec]) => ({
    brief,
    "core-flows": coreFlows,
    prd,
    "tech-spec": techSpec
  }));

export const buildPhaseCheckInput = (
  initiative: Initiative,
  step: RefinementStep,
  markdownByStep: Record<InitiativeArtifactStep, string>,
  repoContext?: PlannerRepoContext
): PhaseCheckInput => ({
  initiativeDescription: initiative.description,
  phase: step,
  briefMarkdown: markdownByStep.brief,
  coreFlowsMarkdown: markdownByStep["core-flows"],
  prdMarkdown: markdownByStep.prd,
  savedContext: getSavedContext(initiative, step),
  refinementHistory: getRefinementHistory(initiative, step),
  repoContext,
  requiresInitialConsultation:
    step === "brief"
      ? requiresInitialBriefConsultation({
          initiative,
          briefMarkdown: markdownByStep.brief
        })
      : false,
  requiredStarterQuestionCount:
    step !== "brief" &&
    !markdownByStep[step].trim() &&
    !hasExistingRefinementState(initiative, step)
      ? getRequiredStarterQuestionCount(step)
      : 0
});

export const buildSpecGenerationInput = (
  initiative: Initiative,
  step: RefinementStep,
  markdownByStep: Record<InitiativeArtifactStep, string>,
  repoContext?: PlannerRepoContext
): SpecGenInput => ({
  initiativeDescription: initiative.description,
  savedContext: getSavedContext(initiative, step),
  refinementHistory: getRefinementHistory(initiative, step),
  assumptions: getRefinementAssumptions(initiative.workflow, step),
  briefMarkdown: step === "brief" ? undefined : markdownByStep.brief,
  coreFlowsMarkdown: step === "brief" || step === "core-flows" ? undefined : markdownByStep["core-flows"],
  prdMarkdown: step === "tech-spec" ? markdownByStep.prd : undefined,
  techSpecMarkdown: step === "tech-spec" ? markdownByStep["tech-spec"] : undefined,
  repoContext
});

export const requireSpecMarkdown = (
  initiativeId: string,
  step: InitiativeArtifactStep,
  readSpecMarkdown: (specId: string) => Promise<string>
): Promise<string> =>
  readSpecMarkdown(`${initiativeId}:${step}`).then((markdown) => {
  if (!markdown.trim()) {
    throw new Error(`Artifact ${step} is missing for initiative ${initiativeId}`);
  }
  return markdown;
});

export const requireSpecUpdatedAt = (
  initiativeId: string,
  step: InitiativeArtifactStep,
  specs: ReadonlyMap<string, SpecDocumentSummary>
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
