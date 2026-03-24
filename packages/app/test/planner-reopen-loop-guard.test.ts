import { describe, expect, it } from "vitest";
import type { InitiativePlanningQuestion } from "../src/types/entities.js";
import type { PhaseCheckInput, PhaseCheckResult } from "../src/planner/types.js";
import { validatePhaseCheckResult } from "../src/planner/internal/validators.js";

const makeSelectQuestion = (
  input: Partial<InitiativePlanningQuestion> & Pick<InitiativePlanningQuestion, "id" | "label" | "decisionType">,
): InitiativePlanningQuestion => ({
  id: input.id,
  label: input.label,
  type: input.type ?? "select",
  whyThisBlocks: input.whyThisBlocks ?? "The PRD needs this decision before the product contract is stable.",
  affectedArtifact: input.affectedArtifact ?? "prd",
  decisionType: input.decisionType,
  assumptionIfUnanswered: input.assumptionIfUnanswered ?? "Assume the narrowest safe default.",
  options: input.options ?? ["Option A", "Option B"],
  optionHelp:
    input.optionHelp ?? {
      "Option A": "Keeps the first release conservative.",
      "Option B": "Expands the first release in a material way.",
    },
  recommendedOption: input.recommendedOption ?? (input.options ?? ["Option A"])[0] ?? null,
  allowCustomAnswer: input.allowCustomAnswer ?? false,
  reopensQuestionIds: input.reopensQuestionIds,
});

const makeInput = (): PhaseCheckInput => ({
  initiativeDescription: "Build a desktop notes app",
  phase: "prd",
  briefMarkdown: "# Brief",
  coreFlowsMarkdown: "# Core flows",
  savedContext: {},
  refinementHistory: [],
});

const makeResult = (questions: InitiativePlanningQuestion[]): PhaseCheckResult => ({
  decision: "ask",
  questions,
  assumptions: [],
});

describe("planner reopen loop guard", () => {
  it("rejects explicit reopen paraphrases that do not materially narrow the decision", () => {
    const priorQuestion = makeSelectQuestion({
      id: "prd-safe-logging-policy",
      label: "Which safe-logging policy should the PRD mandate for v1?",
      decisionType: "rule",
      whyThisBlocks: "The PRD needs one logging rule before the diagnostics contract is safe.",
      options: ["No note content in logs", "Allow note titles in logs"],
      optionHelp: {
        "No note content in logs": "Keeps diagnostics metadata-only.",
        "Allow note titles in logs": "Expands diagnostics to include user-visible metadata.",
      },
    });

    const result = makeResult([
      makeSelectQuestion({
        id: "prd-safe-logging-policy-follow-up",
        label: "Which safe logging policy should the PRD mandate for v1?",
        decisionType: "rule",
        whyThisBlocks: "The PRD needs one logging rule before the diagnostics contract is safe.",
        options: ["No note content in logs", "Allow note titles in logs"],
        optionHelp: {
          "No note content in logs": "Keeps diagnostics metadata-only.",
          "Allow note titles in logs": "Expands diagnostics to include user-visible metadata.",
        },
        reopensQuestionIds: ["prd-safe-logging-policy"],
      }),
    ]);

    expect(() => validatePhaseCheckResult(result, makeInput(), [priorQuestion])).toThrow(
      "paraphrases already-asked prd concern from prd-safe-logging-policy instead of materially narrowing it",
    );
  });

  it("accepts explicit reopens that materially narrow the earlier decision", () => {
    const priorQuestion = makeSelectQuestion({
      id: "prd-safe-logging-policy",
      label: "Which safe-logging policy should the PRD mandate for v1?",
      decisionType: "rule",
      whyThisBlocks: "The PRD needs one logging rule before the diagnostics contract is safe.",
      options: ["Never log note content", "Allow note titles in logs"],
      optionHelp: {
        "Never log note content": "Keeps diagnostics metadata-only.",
        "Allow note titles in logs": "Expands diagnostics to include user-visible metadata.",
      },
    });

    const result = makeResult([
      makeSelectQuestion({
        id: "prd-safe-logging-debug-builds",
        label: "In developer-only debug builds, may logs include note titles while production still logs no note content?",
        decisionType: "rule",
        whyThisBlocks:
          "The PRD needs the debug-build logging exception before it can lock the diagnostics contract for support workflows.",
        options: [
          "No, metadata-only in every build",
          "Yes, note titles in debug builds only",
        ],
        optionHelp: {
          "No, metadata-only in every build": "Keeps every build under the same privacy rule.",
          "Yes, note titles in debug builds only": "Creates a narrower developer-only exception.",
        },
        reopensQuestionIds: ["prd-safe-logging-policy"],
      }),
    ]);

    expect(() => validatePhaseCheckResult(result, makeInput(), [priorQuestion])).not.toThrow();
  });
});
