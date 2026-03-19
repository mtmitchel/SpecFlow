import type { InitiativePlanningQuestion } from "../../types/entities.js";
import { canonicalizePlanningQuestion } from "../decision-types.js";
import type { PhaseCheckInput, PhaseCheckResult } from "../types.js";
import { validatePhaseCheckResult } from "./validators.js";

const MAX_PHASE_CHECK_VALIDATION_ATTEMPTS = 2;

const getValidationFeedback = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const canonicalizePhaseCheckResult = (result: PhaseCheckResult): PhaseCheckResult => ({
  ...result,
  questions: result.questions.map((question) => canonicalizePlanningQuestion(question))
});

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
