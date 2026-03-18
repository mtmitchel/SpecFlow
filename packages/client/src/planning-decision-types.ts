import type { InitiativePlanningDecisionType } from "./types.js";

export type CanonicalInitiativePlanningDecisionType = Exclude<
  InitiativePlanningDecisionType,
  "verification"
>;

const DECISION_TYPE_LABELS: Record<CanonicalInitiativePlanningDecisionType, string> = {
  problem: "Problem",
  user: "User",
  success: "Success",
  constraint: "Constraint",
  journey: "Primary flow",
  branch: "Alternate path",
  state: "Flow condition",
  "failure-mode": "Failure or degraded path",
  behavior: "Behavior",
  rule: "Rule",
  scope: "Scope",
  "non-goal": "Non-goal",
  priority: "Priority",
  architecture: "Architecture",
  "data-flow": "Data flow",
  persistence: "Persistence",
  integration: "Integration",
  risk: "Risk",
  "quality-strategy": "Quality strategy",
  performance: "Performance",
  operations: "Operations",
  compatibility: "Compatibility",
  "existing-system": "Existing system"
};

export const normalizeDecisionType = (
  decisionType: InitiativePlanningDecisionType
): CanonicalInitiativePlanningDecisionType =>
  decisionType === "verification" ? "quality-strategy" : decisionType;

export const getDecisionTypeLabel = (decisionType: InitiativePlanningDecisionType): string =>
  DECISION_TYPE_LABELS[normalizeDecisionType(decisionType)];
