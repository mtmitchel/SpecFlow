import type { RefinementStep } from "./types.js";

export const CHECK_BUDGET_BY_STEP: Record<RefinementStep, number> = {
  brief: 4,
  "core-flows": 3,
  prd: 3,
  "tech-spec": 3
};

const REQUIRED_STARTER_QUESTION_COUNT_BY_STEP: Partial<Record<RefinementStep, number>> = {
  "core-flows": 3
};

export const getRequiredStarterQuestionCount = (step: RefinementStep): number =>
  REQUIRED_STARTER_QUESTION_COUNT_BY_STEP[step] ?? 0;
