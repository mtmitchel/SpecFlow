import type {
  InitiativeRefinementState,
  PlanningReviewArtifact,
  PlanningReviewKind
} from "../../../types.js";
import { RefinementSection } from "./refinement-section.js";
import type { ReopenedQuestionContext } from "./refinement-history.js";
import { TICKET_COVERAGE_REVIEW_KIND, type SaveState } from "./shared.js";

interface ValidationSectionProps {
  activeRefinement: InitiativeRefinementState | null;
  reopenedQuestionContext: Record<string, ReopenedQuestionContext>;
  refinementAnswers: Record<string, string | string[] | boolean>;
  defaultAnswerQuestionIds: string[];
  refinementAssumptions: string[];
  refinementSaveState: SaveState;
  unresolvedQuestionCount: number;
  guidanceQuestionId: string | null;
  guidanceText: string | null;
  busyAction: string | null;
  isBusy: boolean;
  generationError: string | null;
  validationReview: PlanningReviewArtifact | undefined;
  reviewOverrideKind: PlanningReviewKind | null;
  reviewOverrideReason: string;
  onValidatePlan: () => void | Promise<void>;
  onAnswerChange: (questionId: string, nextValue: string | string[] | boolean) => void;
  onAnswerLater: (questionId: string) => void;
  onRequestGuidance: (questionId: string) => void | Promise<void>;
  onBackToTechSpec: () => void;
  onSetReviewOverride: (kind: PlanningReviewKind, reason: string) => void;
  onClearReviewOverride: () => void;
  onChangeReviewOverrideReason: (reason: string) => void;
  onConfirmOverride: (kind: PlanningReviewKind) => void | Promise<void>;
}

interface ValidationOverrideActionsProps {
  isBusy: boolean;
  showOverrideForm: boolean;
  reviewOverrideReason: string;
  validationReview: PlanningReviewArtifact | undefined;
  onSetReviewOverride: (kind: PlanningReviewKind, reason: string) => void;
  onClearReviewOverride: () => void;
  onChangeReviewOverrideReason: (reason: string) => void;
  onConfirmOverride: (kind: PlanningReviewKind) => void | Promise<void>;
}

const buildFallbackPrompt = (
  review: PlanningReviewArtifact | undefined
): { title: string; body: string } => ({
  title: review?.status === "blocked" ? "Validation needs review" : "Validation",
  body:
    review?.summary ??
    "Run validation before tickets are created."
});

const ValidationOverrideActions = ({
  isBusy,
  showOverrideForm,
  reviewOverrideReason,
  validationReview,
  onSetReviewOverride,
  onClearReviewOverride,
  onChangeReviewOverrideReason,
  onConfirmOverride
}: ValidationOverrideActionsProps) =>
  !showOverrideForm ? (
    <button
      type="button"
      onClick={() =>
        onSetReviewOverride(
          TICKET_COVERAGE_REVIEW_KIND,
          validationReview?.overrideReason ?? ""
        )
      }
      disabled={isBusy}
    >
      Accept risk
    </button>
  ) : (
    <>
      <textarea
        className="multiline textarea-sm"
        value={reviewOverrideReason}
        rows={3}
        placeholder="Add a short reason for accepting the remaining risk."
        onChange={(event) => onChangeReviewOverrideReason(event.target.value)}
      />
      <button
        type="button"
        onClick={() => onClearReviewOverride()}
        disabled={isBusy}
      >
        Cancel
      </button>
      <button
        type="button"
        className="btn-primary"
        onClick={() => void onConfirmOverride(TICKET_COVERAGE_REVIEW_KIND)}
        disabled={isBusy}
      >
        Confirm risk
      </button>
    </>
  );

const renderTransientLoadingCard = (title: string, body: string) => (
  <div className="planning-step-column planning-step-column-narrow">
    <div className="planning-survey-card planning-survey-card-active planning-survey-card-compact planning-survey-card-transient">
      <div
        className="status-loading-card planning-intake-loading planning-intake-loading-hero"
        role="status"
        aria-live="polite"
      >
        <span className="status-loading-spinner" aria-hidden="true" />
        <div className="status-loading-copy">
          <strong>{title}</strong>
          <span>{body}</span>
        </div>
      </div>
    </div>
  </div>
);

export const ValidationSection = ({
  activeRefinement,
  reopenedQuestionContext,
  refinementAnswers,
  defaultAnswerQuestionIds,
  refinementAssumptions,
  refinementSaveState,
  unresolvedQuestionCount,
  guidanceQuestionId,
  guidanceText,
  busyAction,
  isBusy,
  generationError,
  validationReview,
  reviewOverrideKind,
  reviewOverrideReason,
  onValidatePlan,
  onAnswerChange,
  onAnswerLater,
  onRequestGuidance,
  onBackToTechSpec,
  onSetReviewOverride,
  onClearReviewOverride,
  onChangeReviewOverrideReason,
  onConfirmOverride
}: ValidationSectionProps) => {
  const generateBusy = busyAction === "generate-tickets";
  const loadingQuestions = busyAction === "check-validation";
  const showOverrideForm = reviewOverrideKind === TICKET_COVERAGE_REVIEW_KIND;
  const hasQuestions = Boolean(activeRefinement && activeRefinement.questions.length > 0);
  const reviewBlocked = validationReview?.status === "blocked";
  const fallbackPrompt = buildFallbackPrompt(validationReview);

  if (generateBusy) {
    return renderTransientLoadingCard(
      "Validating plan...",
      "Checking the ticket draft before tickets are created."
    );
  }

  if (generationError) {
    return (
      <div className="planning-step-column planning-step-column-narrow">
        <div className="planning-survey-card planning-survey-card-active planning-survey-card-compact planning-survey-card-retry">
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <strong>Can&apos;t validate the plan</strong>
            <p className="text-muted-sm" style={{ margin: 0 }}>
              {generationError}
            </p>
          </div>
          <div className="planning-step-actions planning-step-actions-centered">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void onValidatePlan()}
              disabled={isBusy}
            >
              Validate plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loadingQuestions) {
    return renderTransientLoadingCard(
      "Loading validation questions...",
      "Turning the validation blockers into answerable follow-up questions."
    );
  }

  if (reviewBlocked && hasQuestions && activeRefinement) {
    return (
      <div className="planning-step-column planning-step-column-narrow">
        <RefinementSection
          activeSpecStep="validation"
          activeRefinement={activeRefinement}
          reopenedQuestionContext={reopenedQuestionContext}
          refinementAnswers={refinementAnswers}
          defaultAnswerQuestionIds={defaultAnswerQuestionIds}
          refinementAssumptions={refinementAssumptions}
          refinementSaveState={refinementSaveState}
          unresolvedQuestionCount={unresolvedQuestionCount}
          guidanceQuestionId={guidanceQuestionId}
          guidanceText={guidanceText}
          busyAction={busyAction}
          isBusy={isBusy}
          saveStateIndicator={null}
          variant="survey"
          surveyCompleteLabel="Generate tickets"
          onBackToPreviousStep={onBackToTechSpec}
          onCompleteSurvey={onValidatePlan}
          onRequestGuidance={onRequestGuidance}
          onAnswerChange={onAnswerChange}
          onAnswerLater={onAnswerLater}
        />
      </div>
    );
  }

  return (
    <div className="planning-step-column planning-step-column-narrow">
      <div className="planning-section-card">
        <div className="planning-document-card-header">
          <h3 className="planning-document-card-title">{fallbackPrompt.title}</h3>
        </div>
        <p className="text-muted-sm" style={{ margin: 0 }}>
          {reviewBlocked
            ? fallbackPrompt.body
            : "Run validation before tickets are created."}
        </p>
      </div>
      <div className="planning-step-actions planning-step-actions-centered">
        {reviewBlocked ? (
          <>
            <button type="button" onClick={onBackToTechSpec} disabled={isBusy}>
              Back to tech spec
            </button>
            <ValidationOverrideActions
              isBusy={isBusy}
              showOverrideForm={showOverrideForm}
              reviewOverrideReason={reviewOverrideReason}
              validationReview={validationReview}
              onSetReviewOverride={onSetReviewOverride}
              onClearReviewOverride={onClearReviewOverride}
              onChangeReviewOverrideReason={onChangeReviewOverrideReason}
              onConfirmOverride={onConfirmOverride}
            />
          </>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={() => void onValidatePlan()}
            disabled={isBusy}
          >
            Validate plan
          </button>
        )}
      </div>
    </div>
  );
};
