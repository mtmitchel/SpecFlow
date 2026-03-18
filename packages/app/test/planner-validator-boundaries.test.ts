import { describe, expect, it } from "vitest";
import type { InitiativePlanningQuestion } from "../src/types/entities.js";
import type { PhaseCheckInput, PhaseCheckResult, RefinementHistoryEntry } from "../src/planner/types.js";
import { validatePhaseCheckResult } from "../src/planner/internal/validators.js";

const makeSelectQuestion = (
  input: Partial<InitiativePlanningQuestion> & Pick<InitiativePlanningQuestion, "id" | "label" | "decisionType">
): InitiativePlanningQuestion => ({
  id: input.id,
  label: input.label,
  type: input.type ?? "select",
  whyThisBlocks: input.whyThisBlocks ?? "This blocks the current artifact until the decision is explicit.",
  affectedArtifact: input.affectedArtifact ?? "prd",
  decisionType: input.decisionType,
  assumptionIfUnanswered: input.assumptionIfUnanswered ?? "Assume the narrowest default.",
  options: input.options ?? ["Option A", "Option B"],
  optionHelp:
    input.optionHelp ?? {
      "Option A": "Keeps the first draft narrow.",
      "Option B": "Expands the first draft in a material way."
    },
  recommendedOption: input.recommendedOption ?? (input.options ?? ["Option A"])[0] ?? null,
  allowCustomAnswer: input.allowCustomAnswer ?? false,
  reopensQuestionIds: input.reopensQuestionIds
});

const makeInput = (overrides: Partial<PhaseCheckInput> = {}): PhaseCheckInput => ({
  initiativeDescription: "Build an internal planning tool",
  phase: "prd",
  briefMarkdown: "# Brief",
  coreFlowsMarkdown: "# Core flows",
  savedContext: {},
  refinementHistory: [],
  ...overrides
});

const makeResult = (questions: InitiativePlanningQuestion[]): PhaseCheckResult => ({
  decision: "ask",
  questions,
  assumptions: []
});

describe("planner validator boundaries", () => {
  it("accepts the legacy verification alias for tech-spec questions", () => {
    const input = makeInput({
      phase: "tech-spec",
      prdMarkdown: "# PRD",
      requiredStarterQuestionCount: 1
    });

    const result = makeResult([
      makeSelectQuestion({
        id: "tech-architecture",
        label: "Which architecture direction should v1 use?",
        affectedArtifact: "tech-spec",
        decisionType: "architecture"
      }),
      makeSelectQuestion({
        id: "tech-quality",
        label: "Which verification approach should define quality first?",
        affectedArtifact: "tech-spec",
        decisionType: "verification",
        options: ["Automated tests first", "Observability first"],
        optionHelp: {
          "Automated tests first": "Pushes the spec toward test-heavy verification hooks.",
          "Observability first": "Pushes the spec toward runtime health signals and diagnostics."
        }
      })
    ]);

    expect(() => validatePhaseCheckResult(result, input)).not.toThrow();
  });

  it("allows a same-stage narrower follow-up when the decision boundary changes", () => {
    const priorQuestion = makeSelectQuestion({
      id: "prd-scope-1",
      label: "Which v1 scope boundary matters most?",
      decisionType: "scope",
      options: ["Single-user only", "No external integrations in v1"],
      optionHelp: {
        "Single-user only": "Keeps the product contract focused on one user's workflow first.",
        "No external integrations in v1": "Keeps the first release narrow and avoids integration promises."
      }
    });

    const result = makeResult([
      makeSelectQuestion({
        id: "prd-scope-2",
        label: "Which user-management boundary matters most in v1?",
        decisionType: "scope",
        options: ["Admins only", "Managers and admins"],
        optionHelp: {
          "Admins only": "Keeps the first release limited to administrative workflows.",
          "Managers and admins": "Expands the first release to a second user group."
        }
      })
    ]);

    expect(() => validatePhaseCheckResult(result, makeInput(), [priorQuestion])).not.toThrow();
  });

  it("rejects cross-stage duplicates that do not explicitly reopen the earlier concern", () => {
    const refinementHistory: RefinementHistoryEntry[] = [
      {
        step: "brief",
        questionId: "brief-existing-system",
        label: "Which existing system must v1 stay compatible with?",
        decisionType: "constraint",
        whyThisBlocks: "The brief needs the existing-system boundary.",
        resolution: "answered",
        answer: "CRM",
        assumption: null
      }
    ];

    const result = makeResult([
      makeSelectQuestion({
        id: "prd-compatibility",
        label: "Which existing system does v1 need to stay compatible with?",
        decisionType: "compatibility",
        options: ["CRM", "ERP"],
        optionHelp: {
          "CRM": "Keeps the PRD compatible with the CRM workflows already in use.",
          "ERP": "Keeps the PRD compatible with ERP workflows."
        }
      })
    ]);

    expect(() => validatePhaseCheckResult(result, makeInput({ refinementHistory }))).toThrow(
      "reopens earlier concern brief-existing-system without reopensQuestionIds"
    );
  });

  it("accepts cross-stage reopen questions when they reference the earlier blocker", () => {
    const refinementHistory: RefinementHistoryEntry[] = [
      {
        step: "brief",
        questionId: "brief-existing-system",
        label: "Which existing system must v1 stay compatible with?",
        decisionType: "constraint",
        whyThisBlocks: "The brief needs the existing-system boundary.",
        resolution: "answered",
        answer: "CRM",
        assumption: null
      }
    ];

    const result = makeResult([
      makeSelectQuestion({
        id: "prd-compatibility",
        label: "Which existing system does v1 need to stay compatible with?",
        decisionType: "compatibility",
        whyThisBlocks: "The PRD needs the explicit compatibility promise before it can define user-visible migration behavior.",
        options: ["CRM", "ERP"],
        optionHelp: {
          "CRM": "Keeps the PRD compatible with the CRM workflows already in use.",
          "ERP": "Keeps the PRD compatible with ERP workflows."
        },
        reopensQuestionIds: ["brief-existing-system"]
      })
    ]);

    expect(() => validatePhaseCheckResult(result, makeInput({ refinementHistory }))).not.toThrow();
  });

  it("allows conditional forbidden terms when the initiative already uses that domain language", () => {
    const result = makeResult([
      makeSelectQuestion({
        id: "prd-api-behavior",
        label: "Which API behavior matters most in v1?",
        decisionType: "behavior",
        options: ["Synchronous responses", "Async job handoff"],
        optionHelp: {
          "Synchronous responses": "Keeps the user-visible contract focused on immediate responses.",
          "Async job handoff": "Keeps the user-visible contract focused on background work."
        }
      })
    ]);

    expect(() =>
      validatePhaseCheckResult(
        result,
        makeInput({ initiativeDescription: "Build a REST API for internal user management" })
      )
    ).not.toThrow();
  });
});
