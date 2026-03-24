import type {
  InitiativePlanningDecisionType,
  InitiativePlanningQuestion
} from "../types/entities.js";

export type CanonicalInitiativePlanningDecisionType = Exclude<
  InitiativePlanningDecisionType,
  "verification"
>;

export type DecisionTypeFamily =
  | "framing"
  | "boundary"
  | "outcome"
  | "flow"
  | "implementation";

interface DecisionTypeMetadata {
  label: string;
  family: DecisionTypeFamily;
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const DECISION_TYPE_METADATA: Record<CanonicalInitiativePlanningDecisionType, DecisionTypeMetadata> = {
  problem: { label: "Problem", family: "framing" },
  user: { label: "User", family: "framing" },
  success: { label: "Success", family: "outcome" },
  constraint: { label: "Constraint", family: "boundary" },
  journey: { label: "Primary flow", family: "flow" },
  branch: { label: "Alternate path", family: "flow" },
  state: { label: "Flow condition", family: "flow" },
  "failure-mode": { label: "Failure or degraded path", family: "flow" },
  behavior: { label: "Behavior", family: "outcome" },
  rule: { label: "Rule", family: "outcome" },
  scope: { label: "Scope", family: "boundary" },
  "non-goal": { label: "Non-goal", family: "boundary" },
  priority: { label: "Priority", family: "outcome" },
  architecture: { label: "Architecture", family: "implementation" },
  "data-flow": { label: "Data flow", family: "implementation" },
  persistence: { label: "Persistence", family: "implementation" },
  integration: { label: "Integration", family: "implementation" },
  risk: { label: "Risk", family: "implementation" },
  "quality-strategy": { label: "Quality strategy", family: "outcome" },
  performance: { label: "Performance", family: "outcome" },
  operations: { label: "Operations", family: "implementation" },
  compatibility: { label: "Compatibility", family: "boundary" },
  "existing-system": { label: "Existing system", family: "boundary" }
};

export const SUPPORTED_DECISION_TYPES: InitiativePlanningDecisionType[] = [
  "problem",
  "user",
  "success",
  "constraint",
  "journey",
  "branch",
  "state",
  "failure-mode",
  "behavior",
  "rule",
  "scope",
  "non-goal",
  "priority",
  "architecture",
  "data-flow",
  "persistence",
  "integration",
  "risk",
  "quality-strategy",
  "verification",
  "performance",
  "operations",
  "compatibility",
  "existing-system"
];

export const normalizeDecisionType = (
  decisionType: InitiativePlanningDecisionType
): CanonicalInitiativePlanningDecisionType => {
  if (decisionType === "verification") {
    return "quality-strategy";
  }

  return decisionType;
};

export const getDecisionTypeLabel = (decisionType: InitiativePlanningDecisionType): string =>
  DECISION_TYPE_METADATA[normalizeDecisionType(decisionType)].label;

export const getDecisionTypeFamily = (
  decisionType: InitiativePlanningDecisionType
): DecisionTypeFamily => DECISION_TYPE_METADATA[normalizeDecisionType(decisionType)].family;

export const canonicalizePlanningQuestion = (
  question: InitiativePlanningQuestion
): InitiativePlanningQuestion => {
  const rawReopensQuestionIds = (question as { reopensQuestionIds?: unknown }).reopensQuestionIds;

  return {
    ...question,
    decisionType: normalizeDecisionType(question.decisionType),
    reopensQuestionIds: isStringArray(rawReopensQuestionIds)
      ? Array.from(new Set(rawReopensQuestionIds.map((questionId) => questionId.trim()).filter(Boolean)))
      : rawReopensQuestionIds === undefined
        ? undefined
        : (rawReopensQuestionIds as InitiativePlanningQuestion["reopensQuestionIds"]),
  };
};
