import { LlmProviderError } from "../../llm/errors.js";
import { PlannerConflictError } from "../planner-errors.js";

export const toStructuredPlannerError = (error: unknown): {
  code: string;
  message: string;
  statusCode: number;
} => {
  if (error instanceof PlannerConflictError) {
    return {
      code: "planner_conflict",
      message: error.message,
      statusCode: 409
    };
  }

  if (error instanceof LlmProviderError) {
    const statusCode =
      error.code === "invalid_api_key"
        ? 401
        : error.code === "rate_limit"
          ? 429
          : error.code === "timeout"
            ? 504
            : error.statusCode ?? 502;

    return {
      code: error.code,
      message: error.message,
      statusCode
    };
  }

  return {
    code: "planner_error",
    message: (error as Error).message ?? "Planner execution failed",
    statusCode: 500
  };
};
