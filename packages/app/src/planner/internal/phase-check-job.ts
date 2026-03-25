import type { InitiativePlanningQuestion } from "../../types/entities.js";
import { canonicalizePlanningQuestion } from "../decision-types.js";
import type { PhaseCheckInput, PhaseCheckResult } from "../types.js";
import { validatePhaseCheckResult } from "./validators.js";

const MAX_PHASE_CHECK_VALIDATION_ATTEMPTS = 3;

const getValidationFeedback = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const canonicalizePhaseCheckResult = (result: PhaseCheckResult): PhaseCheckResult => {
  const rawQuestions = (result as { questions?: unknown }).questions;
  const questions = Array.isArray(rawQuestions)
    ? rawQuestions.map((question) =>
        question && typeof question === "object"
          ? canonicalizePlanningQuestion(question as InitiativePlanningQuestion)
          : question
      )
    : result.questions;

  return {
    ...result,
    questions: questions as PhaseCheckResult["questions"]
  };
};

export const resolveValidatedPhaseCheckResult = async (input: {
  phaseCheckInput: PhaseCheckInput;
  priorQuestions?: InitiativePlanningQuestion[];
  executePhaseCheck: (phaseCheckInput: PhaseCheckInput) => Promise<PhaseCheckResult>;
}): Promise<PhaseCheckResult> => {
  let phaseCheckInput = input.phaseCheckInput;

  for (let attempt = 0; attempt < MAX_PHASE_CHECK_VALIDATION_ATTEMPTS; attempt += 1) {
    const result = canonicalizePhaseCheckResult(await input.executePhaseCheck(phaseCheckInput));

    try {
      validatePhaseCheckResult(result, phaseCheckInput, input.priorQuestions);
      return result;
    } catch (error) {
      if (attempt === MAX_PHASE_CHECK_VALIDATION_ATTEMPTS - 1) {
        throw error;
      }

      phaseCheckInput = {
        ...input.phaseCheckInput,
        validationFeedback: getValidationFeedback(error)
      };
    }
  }

  throw new Error("Phase-check validation retry loop exhausted without returning a result");
};
