import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InitiativePlanningQuestion, InitiativeRefinementState, PlanningReviewArtifact } from "../../../types.js";
import { ValidationSection } from "./validation-section.js";

const validationQuestion: InitiativePlanningQuestion = {
  id: "empty-note-behavior",
  label:
    "When a user erases all content from a note, should the app keep the empty note visible, move it to Trash, or remove it from lists?",
  type: "select",
  whyThisBlocks: "The ticket plan needs one empty-note rule before execution starts.",
  affectedArtifact: "tech-spec",
  decisionType: "behavior",
  assumptionIfUnanswered: "Keep the empty note visible until the user explicitly deletes it.",
  options: [
    "Keep the empty note visible",
    "Move it to Trash",
    "Remove it from lists without Trash",
  ],
  recommendedOption: "Keep the empty note visible",
  allowCustomAnswer: false,
};

const blockedReview: PlanningReviewArtifact = {
  id: "initiative-12345678:ticket-coverage-review",
  initiativeId: "initiative-12345678",
  kind: "ticket-coverage-review",
  status: "blocked",
  summary: "Validation needs one remaining product decision.",
  findings: [],
  sourceUpdatedAts: {
    validation: "2026-03-19T10:00:00.000Z",
  },
  overrideReason: null,
  reviewedAt: "2026-03-19T10:00:00.000Z",
  updatedAt: "2026-03-19T10:00:00.000Z",
};

const buildRefinement = (questions: InitiativePlanningQuestion[]): InitiativeRefinementState => ({
  questions,
  history: questions,
  answers: {},
  defaultAnswerQuestionIds: [],
  baseAssumptions: [],
  checkedAt: "2026-03-19T10:00:00.000Z",
});

const renderSection = ({
  activeRefinement = buildRefinement([validationQuestion]),
  validationReview = blockedReview,
}: {
  activeRefinement?: InitiativeRefinementState | null;
  validationReview?: PlanningReviewArtifact | undefined;
} = {}) =>
  render(
    <ValidationSection
      activeRefinement={activeRefinement}
      reopenedQuestionContext={{}}
      refinementAnswers={{}}
      defaultAnswerQuestionIds={[]}
      refinementAssumptions={[]}
      refinementSaveState="idle"
      unresolvedQuestionCount={activeRefinement?.questions.length ?? 0}
      guidanceQuestionId={null}
      guidanceText={null}
      busyAction={null}
      isBusy={false}
      generationError={null}
      validationReview={validationReview}
      reviewOverrideKind={null}
      reviewOverrideReason=""
      onValidatePlan={vi.fn()}
      onAnswerChange={vi.fn()}
      onAnswerLater={vi.fn()}
      onRequestGuidance={vi.fn()}
      onBackToTechSpec={vi.fn()}
      onSetReviewOverride={vi.fn()}
      onClearReviewOverride={vi.fn()}
      onChangeReviewOverrideReason={vi.fn()}
      onConfirmOverride={vi.fn()}
    />,
  );

describe("ValidationSection", () => {
  it("hides the risk override while active validation questions are on screen", () => {
    renderSection();

    expect(screen.getByText(validationQuestion.label)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept risk" })).not.toBeInTheDocument();
  });

  it("keeps the risk override in the blocked fallback when no questions are available", () => {
    renderSection({
      activeRefinement: buildRefinement([]),
    });

    expect(screen.getByText("Validation needs review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept risk" })).toBeInTheDocument();
  });
});
