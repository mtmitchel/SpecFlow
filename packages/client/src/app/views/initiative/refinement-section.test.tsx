import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InitiativeRefinementState } from "../../../types.js";
import { RefinementSection } from "./refinement-section.js";

const activeRefinement: InitiativeRefinementState = {
  questions: [
    {
      id: "brief-problem",
      label: "Which problem matters most in v1?",
      type: "select",
      whyThisBlocks: "The brief cannot define the right scope until the primary problem is explicit.",
      affectedArtifact: "brief",
      decisionType: "scope",
      assumptionIfUnanswered: "Focus on the user's primary note-taking problem.",
      options: ["Capture something quickly", "Find or organize things better"],
      optionHelp: {
        "Capture something quickly": "Use this when speed matters most."
      },
      recommendedOption: null
    }
  ],
  answers: {
    "brief-problem": "Capture something quickly"
  },
  defaultAnswerQuestionIds: [],
  baseAssumptions: [],
  checkedAt: "2026-03-16T20:00:00.000Z"
};

describe("RefinementSection", () => {
  it("shows an inline loading state when follow-up questions are being checked", () => {
    render(
      <RefinementSection
        activeSpecStep="brief"
        activeRefinement={activeRefinement}
        refinementAnswers={activeRefinement.answers}
        defaultAnswerQuestionIds={[]}
        refinementAssumptions={[]}
        refinementSaveState="saved"
        unresolvedQuestionCount={0}
        guidanceQuestionId={null}
        guidanceText={null}
        busyAction="check-brief"
        isBusy
        saveStateIndicator={null}
        loadingStateLabel="Checking if the brief needs anything else"
        variant="compact"
        onRequestGuidance={vi.fn()}
        onAnswerChange={vi.fn()}
        onAnswerLater={vi.fn()}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Checking if the brief needs anything else");
    expect(screen.getByText("Stay here. More questions may appear, or the next step will unlock.")).toBeInTheDocument();
  });

  it("uses a multiline field for custom other answers", () => {
    const refinementWithBooleanQuestion: InitiativeRefinementState = {
      ...activeRefinement,
      questions: [
        {
          id: "brief-sync",
          label: "Should the product include optional cloud sync in the initial design?",
          type: "boolean",
          whyThisBlocks: "This changes the architecture and scope of the first release.",
          affectedArtifact: "brief",
          decisionType: "scope",
          assumptionIfUnanswered: "Keep the first release local-first."
        }
      ],
      answers: {},
      checkedAt: "2026-03-16T20:05:00.000Z"
    };

    render(
      <RefinementSection
        activeSpecStep="brief"
        activeRefinement={refinementWithBooleanQuestion}
        refinementAnswers={{ "brief-sync": "Other" }}
        defaultAnswerQuestionIds={[]}
        refinementAssumptions={[]}
        refinementSaveState="idle"
        unresolvedQuestionCount={1}
        guidanceQuestionId={null}
        guidanceText={null}
        busyAction={null}
        isBusy={false}
        saveStateIndicator={null}
        variant="survey"
        onRequestGuidance={vi.fn()}
        onAnswerChange={vi.fn()}
        onAnswerLater={vi.fn()}
      />
    );

    const customAnswerField = screen.getByPlaceholderText("Add a custom answer");
    expect(customAnswerField.tagName).toBe("TEXTAREA");
  });

  it("uses the single-question survey layout for compact phase refinements", () => {
    const multiQuestionRefinement: InitiativeRefinementState = {
      ...activeRefinement,
      questions: [
        activeRefinement.questions[0],
        {
          id: "brief-user",
          label: "Who is this for first?",
          type: "select",
          whyThisBlocks: "The brief needs a clear primary user before it can define scope.",
          affectedArtifact: "brief",
          decisionType: "user",
          assumptionIfUnanswered: "Start with one primary user group.",
          options: ["Just me", "A small team I know"],
        },
      ],
      answers: {},
      checkedAt: null,
    };

    render(
      <RefinementSection
        activeSpecStep="core-flows"
        activeRefinement={multiQuestionRefinement}
        refinementAnswers={{}}
        defaultAnswerQuestionIds={[]}
        refinementAssumptions={[]}
        refinementSaveState="idle"
        unresolvedQuestionCount={2}
        guidanceQuestionId={null}
        guidanceText={null}
        busyAction={null}
        isBusy={false}
        saveStateIndicator={null}
        variant="compact"
        onRequestGuidance={vi.fn()}
        onAnswerChange={vi.fn()}
        onAnswerLater={vi.fn()}
      />
    );

    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Which problem matters most in v1?")).toBeInTheDocument();
    expect(screen.queryByText("Who is this for first?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });
});
