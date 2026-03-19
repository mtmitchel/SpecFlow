import { PlanValidationError, buildPlanValidationFeedback } from "./plan-validation.js";
import type { PlanInput, PlanResult } from "../types.js";

const MAX_PLAN_VALIDATION_ATTEMPTS = 2;

export const resolveValidatedPlanResult = async (input: {
  planInput: PlanInput;
  executePlan: (planInput: PlanInput) => Promise<PlanResult>;
  executePlanRepair: (planInput: PlanInput) => Promise<PlanResult>;
  validateResult: (result: PlanResult) => void;
}): Promise<PlanResult> => {
  let planInput = input.planInput;
  let executeCurrentPlan = input.executePlan;

  for (let attempt = 0; attempt < MAX_PLAN_VALIDATION_ATTEMPTS; attempt += 1) {
    const result = await executeCurrentPlan(planInput);

    try {
      input.validateResult(result);
      return result;
    } catch (error) {
      if (attempt === MAX_PLAN_VALIDATION_ATTEMPTS - 1) {
        throw error;
      }

      planInput = {
        ...input.planInput,
        validationFeedback: buildPlanValidationFeedback(error),
        previousInvalidResult: result,
      };
      executeCurrentPlan =
        error instanceof PlanValidationError
          ? input.executePlanRepair
          : input.executePlan;
    }
  }

  throw new Error("Plan validation retry loop exhausted without returning a result");
};
