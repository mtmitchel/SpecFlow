import type { InitiativePlanningDecisionType } from "../types/entities.js";
import type { RefinementStep } from "./types.js";

interface RefinementPromptPolicy {
  checkRules: string[];
  generationRules: string[];
}

export interface RefinementQuestionPolicy extends RefinementPromptPolicy {
  maxQuestions: number;
  requiredStarterQuestionCount: number;
  requiredStarterDecisionGroups: InitiativePlanningDecisionType[][];
  allowedDecisionTypes: InitiativePlanningDecisionType[];
  hardForbiddenTerms: string[];
  conditionalForbiddenTerms: string[];
}

const QUESTION_POLICY_BY_STEP: Record<RefinementStep, RefinementQuestionPolicy> = {
  brief: {
    maxQuestions: 4,
    requiredStarterQuestionCount: 0,
    requiredStarterDecisionGroups: [],
    allowedDecisionTypes: ["problem", "user", "success", "constraint"],
    hardForbiddenTerms: [
      "journey",
      "screen",
      "state machine",
      "acceptance criteria",
      "architecture",
      "library",
      "framework",
      "schema",
      "component"
    ],
    conditionalForbiddenTerms: [
      "database",
      "endpoint",
      "api",
      "runtime",
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
      "- Keep hard boundaries focused on non-negotiable limits such as supported environments, offline or unreliable-network behavior, portability or interoperability, performance or scale bars, and existing-system obligations.",
      "- Make success outcomes and hard boundaries concrete enough to guide later information-architecture and product-design decisions, but do not solve those later-stage concerns in the Brief.",
      "- Do not ask for detailed journeys, screen states, acceptance criteria, architecture, libraries, runtime choices, package targets, or implementation tactics in the Brief."
    ],
    generationRules: [
      "Make the problem, quality bars, and hard boundaries concrete enough to guide later information-architecture and product-design decisions.",
      "Do not include detailed journey maps, acceptance criteria lists, architecture choices, runtime/package decisions, or implementation mechanics."
    ]
  },
  "core-flows": {
    maxQuestions: 4,
    requiredStarterQuestionCount: 3,
    requiredStarterDecisionGroups: [["journey"], ["branch", "failure-mode"], ["state"]],
    allowedDecisionTypes: ["journey", "branch", "state", "failure-mode"],
    hardForbiddenTerms: [
      "architecture",
      "library",
      "framework",
      "which platform",
      "supported platform",
      "web first pwa",
      "desktop native",
      "mobile native",
      "electron style",
      "database",
      "schema",
      "ipc",
      "component",
      "persist to disk",
      "save to disk",
      "stored on disk",
      "storage format",
      "filesystem",
      "index",
      "fts"
    ],
    conditionalForbiddenTerms: [
      "runtime",
      "package",
      "endpoint",
      "api",
      "markdown file",
      "debounce",
      "latency",
      "2-5s",
      "tauri",
      "flatpak",
      "rpm"
    ],
    checkRules: [
      "- Ask only about the shape of the primary flow: primary path, meaningful branch or destructive path, flow conditions that change the map, and failure or degraded paths when they materially affect the experience.",
      "- The flow may be user-facing, operator-facing, or system/process-facing. Do not assume a screen-based UI.",
      '- Treat decisionType "state" as a flow condition, mode, or lifecycle rule that changes what path the user can take.',
      '- Use decisionType "branch" for alternate or destructive paths and "failure-mode" for degraded-path or recovery questions. Either one can satisfy the edge-path starter requirement.',
      "- It is valid to ask whether a remembered view, mode, or return state changes the next path. Do not ask how that state is stored or implemented.",
      "- Treat flow clarity as product design work. Ask about what the actor needs to know, decide, and see at each step when those details are still unclear.",
      "- Capture empty, loading, error, recovery, or destructive states when they materially change the flow. Distinguish primary versus secondary actions or progressive disclosure only when that difference changes the path.",
      "- Platform targets, supported device classes, packaging, and distribution strategy belong to Brief or PRD scope boundaries, not Core flows.",
      "- Do not ask about architecture, storage format, libraries, runtime/package targets, indexing strategy, or low-level timing/tuning unless the answer changes a user-visible state or branch."
    ],
    generationRules: [
      "Treat information architecture and product design as first-class flow requirements, not polish.",
      "Focus on the primary flow, flow conditions, branches, failure or degraded paths, and state transitions.",
      "The flow may be user-facing, operator-facing, or system/process-facing; do not assume a screen-based UI.",
      "Show what the actor is trying to do, what they need to know, the decisions they make, and the feedback or state changes they see across the major path and branches.",
      "Include empty, loading, error, recovery, or destructive states when they materially affect the flow. Distinguish primary versus secondary actions when it changes the experience.",
      "A remembered view, mode, or return state may belong here when it changes the next path seen by the user.",
      "Do not specify architecture, storage internals, runtime/package choices, or low-level timing/tuning unless they change a visible branch, flow condition, or outcome."
    ]
  },
  prd: {
    maxQuestions: 4,
    requiredStarterQuestionCount: 1,
    requiredStarterDecisionGroups: [["scope"]],
    allowedDecisionTypes: [
      "behavior",
      "rule",
      "scope",
      "non-goal",
      "priority",
      "failure-mode",
      "performance",
      "compatibility"
    ],
    hardForbiddenTerms: [
      "architecture",
      "library",
      "framework",
      "database",
      "schema",
      "component",
      "persist to disk",
      "save to disk",
      "stored on disk"
    ],
    conditionalForbiddenTerms: [
      "runtime",
      "package",
      "endpoint",
      "api",
      "ipc",
      "index",
      "watcher",
      "debounce",
      "latency",
      "tauri",
      "flatpak",
      "rpm"
    ],
    checkRules: [
      "- Ask only about user-visible product behavior, governing rules, scope boundaries, v1 priorities, performance or compatibility promises, failure behavior, acceptance-relevant promises, and non-goals.",
      '- Treat decisionType "rule" as the governing constraint on behavior, not a paraphrase of the same behavior question.',
      "- The first PRD consultation must lock at least one explicit scope boundary before the first draft.",
      "- Do not reopen a Brief constraint unless the missing detail materially changes the user-visible contract or v1 scope.",
      "- User-visible remembered behavior is valid here when it changes the product contract. Do not ask how that behavior is stored or implemented.",
      "- User-visible structure belongs here when it changes the product contract: navigation, information hierarchy, primary versus secondary actions, permissions or roles, and empty, loading, error, or recovery behavior.",
      "- Treat information architecture and product design as first-class product requirements, not later polish.",
      "- Do not ask about architecture, data model internals, libraries, runtime/package choices, deployment, or implementation mechanics.",
      "- Prefer proceed when the missing detail would not change the product contract seen by the user."
    ],
    generationRules: [
      "Treat information architecture and product design as part of the product contract, not polish.",
      "Treat the PRD as the user-visible product contract for behavior, rules, scope boundaries, v1 priorities, and non-goals.",
      "Define the navigation model, information hierarchy, key objects, statuses or feedback, primary versus secondary actions, and important empty, loading, error, or recovery behavior when they shape the user-visible contract.",
      "User-visible remembered behavior can belong in the PRD when it changes the product contract.",
      "Do not specify architecture, libraries, runtime/package choices, storage internals, or low-level implementation mechanics."
    ]
  },
  "tech-spec": {
    maxQuestions: 5,
    requiredStarterQuestionCount: 1,
    requiredStarterDecisionGroups: [["architecture"]],
    allowedDecisionTypes: [
      "architecture",
      "data-flow",
      "persistence",
      "integration",
      "risk",
      "quality-strategy",
      "verification",
      "failure-mode",
      "performance",
      "operations",
      "compatibility",
      "existing-system"
    ],
    hardForbiddenTerms: [
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
    conditionalForbiddenTerms: [],
    checkRules: [
      "- Ask only about implementation tradeoffs, architecture, components, data flow, persistence, integration boundaries, performance constraints, operations and release concerns, compatibility or migration constraints, existing-system constraints, failure handling, and quality strategy.",
      "- The first Tech spec consultation must lock at least one architecture decision before the first draft.",
      "- Do not re-ask primary user journeys, high-level product goals, or user-visible behavior already settled in the Brief, Core flows, or PRD unless those artifacts are contradictory or missing a critical implementation constraint.",
      "- Preserve approved information-architecture and product-design decisions from earlier artifacts as implementation inputs. Reopen them only when implementation constraints make the product contract impossible or unsafe.",
      "- Prefer proceed when earlier artifacts already define the product contract and the implementation path is clear enough to draft."
    ],
    generationRules: [
      "Treat the Tech spec as the implementation contract.",
      "Reference earlier artifacts as inputs, then focus on architecture, components, data flow, persistence, integration boundaries, existing-system constraints, compatibility or migration, failure handling, performance, operations, risks, and quality strategy.",
      "Carry forward earlier information-architecture and product-design requirements as implementation constraints. Explain how the architecture supports them without renegotiating the product contract.",
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
