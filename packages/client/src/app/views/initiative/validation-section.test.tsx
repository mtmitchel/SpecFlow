import { fireEvent, render, screen } from "@testing-library/react";
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

const renderSection = (options: {
  activeRefinement?: InitiativeRefinementState | null;
  validationReview?: PlanningReviewArtifact | undefined;
  hasGeneratedTickets?: boolean;
  busyAction?: string | null;
  isBusy?: boolean;
  generationError?: string | null;
  validationStatusMessage?: string | null;
} = {}) => {
  const {
    activeRefinement = buildRefinement([validationQuestion]),
    hasGeneratedTickets = false,
    busyAction = null,
    isBusy = false,
    generationError = null,
    validationStatusMessage = null,
  } = options;
  const validationReview =
    "validationReview" in options ? options.validationReview : blockedReview;
  const onOpenTickets = vi.fn();
  const onValidatePlan = vi.fn();
  const onBackToTechSpec = vi.fn();

  const rendered = render(
    <ValidationSection
      activeRefinement={activeRefinement}
      hasGeneratedTickets={hasGeneratedTickets}
      reopenedQuestionContext={{}}
      refinementAnswers={{}}
      defaultAnswerQuestionIds={[]}
      refinementAssumptions={[]}
      refinementSaveState="idle"
      unresolvedQuestionCount={activeRefinement?.questions.length ?? 0}
      guidanceQuestionId={null}
      guidanceText={null}
      busyAction={busyAction}
      isBusy={isBusy}
      generationError={generationError}
      validationStatusMessage={validationStatusMessage}
      validationReview={validationReview}
      reviewOverrideKind={null}
      reviewOverrideReason=""
      onValidatePlan={onValidatePlan}
      onAnswerChange={vi.fn()}
      onAnswerLater={vi.fn()}
      onRequestGuidance={vi.fn()}
      onBackToTechSpec={onBackToTechSpec}
      onOpenTickets={onOpenTickets}
      onSetReviewOverride={vi.fn()}
      onClearReviewOverride={vi.fn()}
      onChangeReviewOverrideReason={vi.fn()}
      onConfirmOverride={vi.fn()}
    />,
  );

  return { ...rendered, onOpenTickets, onValidatePlan, onBackToTechSpec };
};

describe("ValidationSection", () => {
  it("hides the risk override while active validation questions are on screen", () => {
    renderSection();

    expect(screen.getByText(validationQuestion.label)).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept risk" })).not.toBeInTheDocument();
  });

  it("keeps the risk override in the blocked fallback when no questions are available", () => {
    renderSection({
      activeRefinement: buildRefinement([]),
    });

    expect(screen.getByText("Validation needs review")).toBeInTheDocument();
    expect(screen.getByText("Needs review", { selector: ".badge" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept risk" })).toBeInTheDocument();
  });

  it("shows a completed validation summary when tickets already exist", () => {
    const { onOpenTickets, onBackToTechSpec } = renderSection({
      activeRefinement: buildRefinement([]),
      validationReview: undefined,
      hasGeneratedTickets: true,
    });

    expect(screen.getByText("Validation")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Validation is complete. The ticket plan is committed and ready in Tickets.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ticket board\./i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onOpenTickets).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBackToTechSpec).toHaveBeenCalledTimes(1);
  });

  it("reopens the combined validation question history from the completed state", () => {
    renderSection({
      activeRefinement: {
        questions: [],
        history: [validationQuestion],
        answers: {
          [validationQuestion.id]: "Keep the empty note visible",
        },
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: "2026-03-19T10:00:00.000Z",
      },
      validationReview: undefined,
      hasGeneratedTickets: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Revise answers" }));

    expect(screen.getByText("All questions are answered")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review answers" })).toBeInTheDocument();
  });

  it("keeps revise answers available when completed validation only has saved decisions", () => {
    const { onValidatePlan } = renderSection({
      activeRefinement: {
        questions: [],
        history: [],
        answers: {
          [validationQuestion.id]: "Keep the empty note visible",
        },
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: "2026-03-19T10:00:00.000Z",
      },
      validationReview: undefined,
      hasGeneratedTickets: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Revise answers" }));

    expect(onValidatePlan).toHaveBeenCalledTimes(1);
  });

  it("shows the latest planner validation status while generating tickets", () => {
    renderSection({
      activeRefinement: buildRefinement([]),
      busyAction: "generate-tickets",
      isBusy: true,
      validationStatusMessage: "Running ticket coverage review...",
    });

    expect(screen.getByText("Validating plan...")).toBeInTheDocument();
    expect(screen.getByText("Running ticket coverage review...")).toBeInTheDocument();
    expect(
      screen.queryByText("Checking the ticket draft before tickets are created."),
    ).not.toBeInTheDocument();
  });
});
