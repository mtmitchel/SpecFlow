import { describe, expect, it } from "vitest";
import type { InitiativePlanningQuestion } from "../src/types/entities.js";
import type { PhaseCheckInput, PhaseCheckResult, RefinementHistoryEntry } from "../src/planner/types.js";
import { validatePhaseCheckResult } from "../src/planner/internal/validators.js";

const makeSelectQuestion = (
  input: Partial<InitiativePlanningQuestion> & Pick<InitiativePlanningQuestion, "id" | "label" | "decisionType">,
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
      "Option B": "Expands the first draft in a material way.",
    },
  recommendedOption: input.recommendedOption ?? (input.options ?? ["Option A"])[0] ?? null,
  allowCustomAnswer: input.allowCustomAnswer ?? false,
  reopensQuestionIds: input.reopensQuestionIds,
});

const makeInput = (overrides: Partial<PhaseCheckInput> = {}): PhaseCheckInput => ({
  initiativeDescription: "Build an internal planning tool",
  phase: "prd",
  briefMarkdown: "# Brief",
  coreFlowsMarkdown: "# Core flows",
  savedContext: {},
  refinementHistory: [],
  ...overrides,
});

const makeResult = (questions: InitiativePlanningQuestion[]): PhaseCheckResult => ({
  decision: "ask",
  questions,
  assumptions: [],
});

describe("planner explicit reopen references", () => {
  it("accepts same-step reopen references against active prior questions", () => {
    const priorQuestions: InitiativePlanningQuestion[] = [
      makeSelectQuestion({
        id: "core-load-capture-availability",
        affectedArtifact: "core-flows",
        label: "Should capture stay available while the workspace is still loading?",
        decisionType: "state",
        whyThisBlocks: "Core flows need the loading-state path before the draft can stay coherent.",
        options: ["Yes, keep capture available", "No, wait until loading finishes"],
        optionHelp: {
          "Yes, keep capture available": "Keeps capture available during the loading state.",
          "No, wait until loading finishes": "Blocks capture until loading is complete.",
        },
      }),
    ];

    const result = makeResult([
      makeSelectQuestion({
        id: "core-load-capture-availability-final",
        affectedArtifact: "core-flows",
        label: "When the workspace is still loading, should capture remain available or stay blocked until launch finishes?",
        decisionType: "failure-mode",
        whyThisBlocks:
          "Core flows need the loading-state fallback before the draft can define the first-launch path.",
        options: ["Keep capture available", "Keep capture blocked"],
        optionHelp: {
          "Keep capture available":
            "Lets the actor start capture even if launch is still assembling the workspace.",
          "Keep capture blocked":
            "Waits until launch completes before capture can begin.",
        },
        reopensQuestionIds: ["core-load-capture-availability"],
      }),
    ]);

    expect(() =>
      validatePhaseCheckResult(result, makeInput({ phase: "core-flows", prdMarkdown: undefined }), priorQuestions),
    ).not.toThrow();
  });

  it("accepts cross-family reopen references when the concern id stays semantically aligned", () => {
    const refinementHistory: RefinementHistoryEntry[] = [
      {
        step: "core-flows",
        questionId: "core-load-capture-availability",
        label: "Should capture stay available while the workspace is still loading?",
        decisionType: "state",
        whyThisBlocks: "Core flows need the loading-state path before the draft can stay coherent.",
        resolution: "answered",
        answer: "Yes, keep capture available during loading.",
        assumption: null,
      },
    ];

    const result = makeResult([
      makeSelectQuestion({
        id: "launch-capture-availability",
        label: "Should users still be able to start capture immediately when launch opens in a loading workspace?",
        decisionType: "behavior",
        whyThisBlocks:
          "The PRD needs the launch-time capture promise before it can define the first-run product contract.",
        options: ["Yes, start capture immediately", "No, wait until loading finishes"],
        optionHelp: {
          "Yes, start capture immediately":
            "Keeps quick capture available even when launch opens into a partially loaded workspace.",
          "No, wait until loading finishes":
            "Delays capture until the workspace is fully ready.",
        },
        reopensQuestionIds: ["core-load-capture-availability"],
      }),
    ]);

    expect(() => validatePhaseCheckResult(result, makeInput({ refinementHistory }))).not.toThrow();
  });

  it("still rejects cross-family reopen references for unrelated concerns", () => {
    const refinementHistory: RefinementHistoryEntry[] = [
      {
        step: "core-flows",
        questionId: "core-load-capture-availability",
        label: "Should capture stay available while the workspace is still loading?",
        decisionType: "state",
        whyThisBlocks: "Core flows need the loading-state path before the draft can stay coherent.",
        resolution: "answered",
        answer: "Yes, keep capture available during loading.",
        assumption: null,
      },
    ];

    const result = makeResult([
      makeSelectQuestion({
        id: "offline-retention-window",
        label: "How long should offline drafts stay queued before the app asks the user to resolve conflicts?",
        decisionType: "behavior",
        whyThisBlocks:
          "The PRD needs the offline retention promise before it can define the user-visible sync contract.",
        options: ["Queue indefinitely", "Prompt after 24 hours"],
        optionHelp: {
          "Queue indefinitely": "Keeps conflict escalation entirely user-driven.",
          "Prompt after 24 hours": "Adds a visible escalation threshold for queued drafts.",
        },
        reopensQuestionIds: ["core-load-capture-availability"],
      }),
    ]);

    expect(() => validatePhaseCheckResult(result, makeInput({ refinementHistory }))).toThrow(
      "reopens unrelated prior concern core-load-capture-availability",
    );
  });
});
