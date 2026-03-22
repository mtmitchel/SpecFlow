import { checkInitiativePhase } from "../../../api.js";
import type {
  Initiative,
  InitiativeValidationDraftByStep,
  ValidationFeedbackByStep,
} from "../../../types.js";
import {
  partitionValidationAnswersByStep,
  VALIDATION_REFINEMENT_STEPS,
} from "./validation-refinement.js";
import {
  getValidationFeedbackForStep,
  getValidationFeedbackSteps,
} from "./validation-feedback.js";

interface BuildValidationDraftByStepInput {
  initiative: Initiative;
  answers: Record<string, string | string[] | boolean>;
  defaultAnswerQuestionIds: string[];
}

interface RerunValidationQuestionsInput {
  initiativeId: string;
  signal: AbortSignal;
  feedbackByStep: ValidationFeedbackByStep;
  fallbackFeedback?: string | null;
}

export const buildValidationDraftByStep = ({
  initiative,
  answers,
  defaultAnswerQuestionIds,
}: BuildValidationDraftByStepInput): InitiativeValidationDraftByStep => {
  const grouped = partitionValidationAnswersByStep({
    initiative,
    answers,
    defaultAnswerQuestionIds,
  });

  return Object.fromEntries(
    VALIDATION_REFINEMENT_STEPS.map((step) => [
      step,
      {
        ...grouped[step],
        preferredSurface: initiative.workflow.refinements[step].preferredSurface ?? null,
      },
    ]),
  ) as InitiativeValidationDraftByStep;
};

export const rerunValidationQuestions = async ({
  initiativeId,
  signal,
  feedbackByStep,
  fallbackFeedback,
}: RerunValidationQuestionsInput): Promise<boolean> => {
  const scopedSteps = getValidationFeedbackSteps(feedbackByStep);
  const stepsToCheck =
    scopedSteps.length > 0 ? scopedSteps : VALIDATION_REFINEMENT_STEPS;
  let validationBlocked = false;

  for (const step of stepsToCheck) {
    const result = await checkInitiativePhase(initiativeId, step, {
      signal,
      validationFeedback: getValidationFeedbackForStep(
        step,
        feedbackByStep,
        fallbackFeedback
      ),
    });

    if (result.decision === "ask") {
      validationBlocked = true;
    }
  }

  return validationBlocked;
};
