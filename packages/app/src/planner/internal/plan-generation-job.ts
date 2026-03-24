import {
  PlanContractError,
  PlanValidationError,
  buildPlanValidationFeedback,
} from "./plan-validation.js";
import type { PlanInput, PlanResult } from "../types.js";

const MAX_PLAN_VALIDATION_ATTEMPTS = 3;

const isRepairablePlanValidationError = (error: unknown): boolean =>
  error instanceof PlanValidationError || error instanceof PlanContractError;

export const resolveValidatedPlanResult = async (input: {
  planInput: PlanInput;
  executePlan: (planInput: PlanInput) => Promise<PlanResult>;
  executePlanRepair: (planInput: PlanInput) => Promise<PlanResult>;
  validateResult: (result: PlanResult) => void;
  onAttempt?: (details: {
    attemptNumber: number;
    mode: "plan" | "plan-repair";
    planInput: PlanInput;
  }) => Promise<void> | void;
}): Promise<PlanResult> => {
  let planInput = input.planInput;
  let executeCurrentPlan = input.executePlan;
  let currentMode: "plan" | "plan-repair" = "plan";

  for (let attempt = 0; attempt < MAX_PLAN_VALIDATION_ATTEMPTS; attempt += 1) {
    await input.onAttempt?.({
      attemptNumber: attempt + 1,
      mode: currentMode,
      planInput
    });
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
      if (isRepairablePlanValidationError(error)) {
        executeCurrentPlan = input.executePlanRepair;
        currentMode = "plan-repair";
      } else {
        executeCurrentPlan = input.executePlan;
        currentMode = "plan";
      }
    }
  }

  throw new Error("Plan validation retry loop exhausted without returning a result");
};
