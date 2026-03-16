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
});
