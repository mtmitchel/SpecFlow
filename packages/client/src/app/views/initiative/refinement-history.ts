import type {
  Initiative,
  InitiativePlanningQuestion,
  InitiativeRefinementState,
} from "../../../types.js";
import { INITIATIVE_WORKFLOW_LABELS } from "../../utils/initiative-workflow.js";
import { getAnswerPreview } from "./refinement-question-utils.js";

export interface ReopenedQuestionContext {
  questionId: string;
  stepLabel: string;
  questionLabel: string;
  resolutionLabel: string | null;
}

export const getVisibleRefinementQuestions = (
  refinement: InitiativeRefinementState | null,
): InitiativePlanningQuestion[] => {
  if (!refinement) {
    return [];
  }

  return refinement.questions.length > 0 ? refinement.questions : (refinement.history ?? []);
};

export const buildReopenedQuestionContext = (
  initiative: Initiative | null,
): Record<string, ReopenedQuestionContext> => {
  if (!initiative) {
    return {};
  }

  const context: Record<string, ReopenedQuestionContext> = {};

  for (const step of ["brief", "core-flows", "prd", "tech-spec"] as const) {
    const refinement = initiative.workflow.refinements[step];

    for (const question of refinement.history ?? refinement.questions) {
      const answer = refinement.answers[question.id];
      const usedDefault =
        refinement.defaultAnswerQuestionIds.includes(question.id) && answer === undefined;
      const preview = getAnswerPreview(question, answer, usedDefault);

      context[question.id] = {
        questionId: question.id,
        stepLabel: INITIATIVE_WORKFLOW_LABELS[step],
        questionLabel: question.label,
        resolutionLabel: preview
          ? `${usedDefault ? "Earlier default" : "Earlier answer"}: ${preview}`
          : null,
      };
    }
  }

  return context;
};
