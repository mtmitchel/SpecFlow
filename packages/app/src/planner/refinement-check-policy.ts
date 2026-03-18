import type { InitiativePlanningDecisionType } from "../types/entities.js";
import type { RefinementStep } from "./types.js";

interface RefinementPromptPolicy {
  checkRules: string[];
  generationRules: string[];
}

export interface RefinementQuestionPolicy extends RefinementPromptPolicy {
  maxQuestions: number;
  requiredStarterQuestionCount: number;
  requiredStarterDecisionTypes: InitiativePlanningDecisionType[];
  allowedDecisionTypes: InitiativePlanningDecisionType[];
  forbiddenTerms: string[];
}

const QUESTION_POLICY_BY_STEP: Record<RefinementStep, RefinementQuestionPolicy> = {
  brief: {
    maxQuestions: 4,
    requiredStarterQuestionCount: 0,
    requiredStarterDecisionTypes: [],
    allowedDecisionTypes: ["problem", "user", "success", "constraint"],
    forbiddenTerms: [
      "journey",
      "screen",
      "state machine",
      "acceptance criteria",
      "architecture",
      "library",
      "framework",
      "database",
      "schema",
      "endpoint",
      "api",
      "component",
      "deployment",
      "package target",
      "rpm",
      "flatpak",
      "tauri",
      "electron",
      "sqlite",
      "debounce",
      "2-5s"
    ],
    checkRules: [
      "- Keep Brief questions at the framing level: primary problem, primary user, success outcomes, and hard boundaries.",
      "- Keep success outcomes distinct from hard boundaries. Do not ask the user to encode the same fact twice.",
      "- Keep hard boundaries focused on non-negotiable limits such as platforms, offline behavior, portability, performance, or existing-system obligations.",
      "- Do not ask for detailed journeys, screen states, acceptance criteria, architecture, libraries, runtime choices, package targets, or implementation tactics in the Brief."
    ],
    generationRules: [
      "Do not include detailed journey maps, acceptance criteria lists, architecture choices, runtime/package decisions, or implementation mechanics."
    ]
  },
  "core-flows": {
    maxQuestions: 4,
    requiredStarterQuestionCount: 3,
    requiredStarterDecisionTypes: ["journey", "branch", "state"],
    allowedDecisionTypes: ["journey", "branch", "state", "failure-mode"],
    forbiddenTerms: [
      "architecture",
      "library",
      "framework",
      "runtime",
      "package",
      "database",
      "schema",
      "endpoint",
      "api",
      "ipc",
      "component",
      "persistence",
      "storage format",
      "markdown file",
      "filesystem",
      "index",
      "fts",
      "debounce",
      "latency",
      "2-5s",
      "tauri",
      "flatpak",
      "rpm"
    ],
    checkRules: [
      "- Ask only about the shape of the user journey: primary path, meaningful branch or destructive path, flow conditions that change the map, and failure or degraded paths when they materially affect the experience.",
      '- Treat decisionType "state" as a flow condition, mode, or lifecycle rule that changes what path the user can take.',
      "- Do not ask about architecture, storage format, libraries, runtime/package targets, indexing strategy, or low-level timing/tuning unless the answer changes a user-visible state or branch."
    ],
    generationRules: [
      "Focus on user journeys, flow conditions, branches, failure paths, and state transitions.",
      "Do not specify architecture, storage internals, runtime/package choices, or low-level timing/tuning unless they change a user-visible state or branch."
    ]
  },
  prd: {
    maxQuestions: 3,
    requiredStarterQuestionCount: 1,
    requiredStarterDecisionTypes: ["scope"],
    allowedDecisionTypes: ["behavior", "rule", "scope", "non-goal", "priority"],
    forbiddenTerms: [
      "architecture",
      "library",
      "framework",
      "runtime",
      "package",
      "database",
      "schema",
      "endpoint",
      "api",
      "ipc",
      "component",
      "persistence",
      "index",
      "watcher",
      "debounce",
      "latency",
      "tauri",
      "flatpak",
      "rpm"
    ],
    checkRules: [
      "- Ask only about user-visible product behavior, governing rules, scope boundaries, v1 priorities, acceptance-relevant promises, and non-goals.",
      '- Treat decisionType "rule" as the governing constraint on behavior, not a paraphrase of the same behavior question.',
      "- The first PRD consultation must lock at least one explicit scope boundary before the first draft.",
      "- Do not reopen a Brief constraint unless the missing detail materially changes the user-visible contract or v1 scope.",
      "- Do not ask about architecture, data model internals, libraries, runtime/package choices, deployment, or implementation mechanics.",
      "- Prefer proceed when the missing detail would not change the product contract seen by the user."
    ],
    generationRules: [
      "Treat the PRD as the user-visible product contract for behavior, rules, scope boundaries, v1 priorities, and non-goals.",
      "Do not specify architecture, libraries, runtime/package choices, storage internals, or low-level implementation mechanics."
    ]
  },
  "tech-spec": {
    maxQuestions: 3,
    requiredStarterQuestionCount: 1,
    requiredStarterDecisionTypes: ["architecture"],
    allowedDecisionTypes: [
      "architecture",
      "data-flow",
      "persistence",
      "integration",
      "risk",
      "verification",
      "performance",
      "operations",
      "compatibility",
      "existing-system"
    ],
    forbiddenTerms: [
      "primary user",
      "persona",
      "who is this for",
      "problem statement",
      "goal",
      "success metric",
      "success criteria",
      "user journey",
      "screen flow",
      "onboarding"
    ],
    checkRules: [
      "- Ask only about implementation tradeoffs, architecture, components, data flow, persistence, integration boundaries, performance constraints, operations and release concerns, compatibility or migration constraints, existing-system constraints, and quality strategy.",
      "- The first Tech spec consultation must lock at least one architecture decision before the first draft.",
      '- Treat decisionType "verification" as quality and verification strategy, not a request to restate product success criteria.',
      "- Do not re-ask primary user journeys, high-level product goals, or user-visible behavior already settled in the Brief, Core flows, or PRD unless those artifacts are contradictory or missing a critical implementation constraint.",
      "- Prefer proceed when earlier artifacts already define the product contract and the implementation path is clear enough to draft."
    ],
    generationRules: [
      "Treat the Tech spec as the implementation contract.",
      "Reference earlier artifacts as inputs, then focus on architecture, components, data flow, persistence, integration boundaries, existing-system constraints, compatibility or migration, performance, operations, risks, and quality strategy.",
      "Do not restate the full Brief, Core flows, or PRD except where a user-visible requirement constrains the implementation."
    ]
  }
};

export const getRequiredStarterQuestionCount = (step: RefinementStep): number =>
  QUESTION_POLICY_BY_STEP[step].requiredStarterQuestionCount;

export const getQuestionPolicy = (step: RefinementStep): RefinementQuestionPolicy => QUESTION_POLICY_BY_STEP[step];

export const CHECK_BUDGET_BY_STEP: Record<RefinementStep, number> = {
  brief: QUESTION_POLICY_BY_STEP.brief.maxQuestions,
  "core-flows": QUESTION_POLICY_BY_STEP["core-flows"].maxQuestions,
  prd: QUESTION_POLICY_BY_STEP.prd.maxQuestions,
  "tech-spec": QUESTION_POLICY_BY_STEP["tech-spec"].maxQuestions
};

export const getPromptPolicy = (step: RefinementStep): RefinementPromptPolicy => ({
  checkRules: QUESTION_POLICY_BY_STEP[step].checkRules,
  generationRules: QUESTION_POLICY_BY_STEP[step].generationRules
});
