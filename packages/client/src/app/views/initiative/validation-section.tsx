import { useEffect, useMemo, useState } from "react";
import type {
  InitiativeRefinementState,
  PlanningReviewArtifact,
  PlanningReviewKind
} from "../../../types.js";
import { RefinementSection } from "./refinement-section.js";
import type { ReopenedQuestionContext } from "./refinement-history.js";
import {
  isQuestionResolved,
  TICKET_COVERAGE_REVIEW_KIND,
  type SaveState,
} from "./shared.js";

interface ValidationSectionProps {
  activeRefinement: InitiativeRefinementState | null;
  hasGeneratedTickets: boolean;
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
  validationStatusMessage: string | null;
  validationReview: PlanningReviewArtifact | undefined;
  reviewOverrideKind: PlanningReviewKind | null;
  reviewOverrideReason: string;
  onValidatePlan: () => void | Promise<void>;
  onAnswerChange: (questionId: string, nextValue: string | string[] | boolean) => void;
  onAnswerLater: (questionId: string) => void;
  onRequestGuidance: (questionId: string) => void | Promise<void>;
  onBackToTechSpec: () => void;
  onOpenTickets: () => void;
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
  review: PlanningReviewArtifact | undefined,
  hasGeneratedTickets: boolean,
): { title: string; body: string } => ({
  title: review?.status === "blocked" ? "Validation needs review" : "Validation",
  body:
    review?.summary ??
    (hasGeneratedTickets
      ? "Validation is complete. Return here if the ticket plan needs another pass."
      : "Run validation before tickets are created.")
});

const getValidationBadgeClass = (
  status: PlanningReviewArtifact["status"] | undefined,
): string => {
  if (status === "passed" || status === "overridden") {
    return "badge badge--done";
  }

  if (status === "blocked" || status === "stale") {
    return "badge badge--backlog";
  }

  return "badge badge--verify";
};

const getValidationBadgeLabel = (
  status: PlanningReviewArtifact["status"] | undefined,
): string => {
  if (status === "passed") {
    return "Passed";
  }

  if (status === "overridden") {
    return "Risk accepted";
  }

  if (status === "blocked") {
    return "Needs review";
  }

  if (status === "stale") {
    return "Needs refresh";
  }

  return "Up next";
};

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
  hasGeneratedTickets,
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
  validationStatusMessage,
  validationReview,
  reviewOverrideKind,
  reviewOverrideReason,
  onValidatePlan,
  onAnswerChange,
  onAnswerLater,
  onRequestGuidance,
  onBackToTechSpec,
  onOpenTickets,
  onSetReviewOverride,
  onClearReviewOverride,
  onChangeReviewOverrideReason,
  onConfirmOverride
}: ValidationSectionProps) => {
  const [showRevisionSurvey, setShowRevisionSurvey] = useState(false);
  const generateBusy = busyAction === "generate-tickets";
  const loadingQuestions = busyAction === "check-validation";
  const showOverrideForm = reviewOverrideKind === TICKET_COVERAGE_REVIEW_KIND;
  const hasQuestions = Boolean(activeRefinement && activeRefinement.questions.length > 0);
  const reviewBlocked = validationReview?.status === "blocked";
  const reviewNeedsRefresh = validationReview?.status === "stale";
  const effectiveValidationStatus =
    validationReview?.status ?? (hasGeneratedTickets ? "passed" : undefined);
  const fallbackPrompt = buildFallbackPrompt(validationReview, hasGeneratedTickets);
  const validationBadgeClass = getValidationBadgeClass(effectiveValidationStatus);
  const validationBadgeLabel = getValidationBadgeLabel(effectiveValidationStatus);
  const questionBadgeLabel =
    hasQuestions && activeRefinement
      ? `${activeRefinement.questions.length} question${activeRefinement.questions.length === 1 ? "" : "s"}`
      : null;
  const hasSavedRevisionState = Boolean(
    activeRefinement &&
      (
        activeRefinement.checkedAt !== null ||
        Object.keys(activeRefinement.answers).length > 0 ||
        activeRefinement.defaultAnswerQuestionIds.length > 0
      ),
  );
  const revisionQuestions = useMemo(
    () =>
      activeRefinement?.history && activeRefinement.history.length > 0
        ? activeRefinement.history
        : activeRefinement?.questions ?? [],
    [activeRefinement],
  );
  const canReviseAnswers = revisionQuestions.length > 0 || hasSavedRevisionState;
  const revisionRefinement = useMemo(
    () =>
      activeRefinement
        ? {
            ...activeRefinement,
            questions: revisionQuestions,
            history: revisionQuestions,
          }
        : null,
    [activeRefinement, revisionQuestions],
  );
  const currentQuestionRefinement = useMemo(
    () =>
      activeRefinement
        ? {
            ...activeRefinement,
            history: activeRefinement.questions,
          }
        : null,
    [activeRefinement],
  );
  const surveyRefinement = showRevisionSurvey
    ? revisionRefinement
    : currentQuestionRefinement;
  const revisionUnresolvedQuestionCount = revisionQuestions.filter((question) =>
    !isQuestionResolved(question, refinementAnswers, defaultAnswerQuestionIds),
  ).length;

  useEffect(() => {
    if (reviewBlocked && hasQuestions) {
      setShowRevisionSurvey(false);
    }
  }, [hasQuestions, reviewBlocked]);

  const handleReviseAnswers = () => {
    if (!canReviseAnswers) {
      return;
    }

    if (revisionQuestions.length === 0) {
      void onValidatePlan();
      return;
    }

    setShowRevisionSurvey(true);
  };

  const handleCompleteSurvey = async () => {
    await onValidatePlan();
    setShowRevisionSurvey(false);
  };

  if (generateBusy) {
    return renderTransientLoadingCard(
      "Validating plan...",
      validationStatusMessage ?? "Checking the ticket draft before tickets are created."
    );
  }

  if (generationError) {
    return (
      <div className="planning-step-column planning-step-column-narrow">
        <div className="planning-survey-card planning-survey-card-active planning-survey-card-compact planning-survey-card-retry">
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <strong>Can&apos;t validate the plan</strong>
            <p className="text-muted-sm m-0">
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
              Try again
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

  if ((hasQuestions || showRevisionSurvey) && surveyRefinement) {
    return (
      <div className="planning-step-column planning-step-column-narrow">
        <RefinementSection
          activeSpecStep="validation"
          activeRefinement={surveyRefinement}
          reopenedQuestionContext={reopenedQuestionContext}
          refinementAnswers={refinementAnswers}
          defaultAnswerQuestionIds={defaultAnswerQuestionIds}
          refinementAssumptions={refinementAssumptions}
          refinementSaveState={refinementSaveState}
          unresolvedQuestionCount={
            showRevisionSurvey
              ? revisionUnresolvedQuestionCount
              : unresolvedQuestionCount
          }
          guidanceQuestionId={guidanceQuestionId}
          guidanceText={guidanceText}
          busyAction={busyAction}
          isBusy={isBusy}
          saveStateIndicator={null}
          variant="survey"
          surveyCompleteLabel="Continue"
          onBackToPreviousStep={onBackToTechSpec}
          onCompleteSurvey={() => void handleCompleteSurvey()}
          onRequestGuidance={onRequestGuidance}
          onAnswerChange={onAnswerChange}
          onAnswerLater={onAnswerLater}
        />
      </div>
    );
  }

  if (hasGeneratedTickets && !reviewBlocked) {
    const completedSummary =
      validationReview?.summary ??
      (reviewNeedsRefresh
        ? "Validation needs another pass before the ticket plan is considered current."
        : "Validation is complete. The ticket plan is committed and ready in Tickets.");

    return (
      <div className="planning-step-column planning-step-column-narrow">
        <div className="planning-step-actions planning-step-actions-end">
          <button type="button" onClick={onBackToTechSpec} disabled={isBusy}>
            Back
          </button>
          {canReviseAnswers ? (
            <button type="button" onClick={handleReviseAnswers} disabled={isBusy}>
              Revise answers
            </button>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            onClick={reviewNeedsRefresh ? () => void onValidatePlan() : onOpenTickets}
            disabled={isBusy}
          >
            Continue
          </button>
        </div>
        <div className="planning-section-card planning-validation-summary planning-validation-handoff">
          <div className="planning-document-card-header">
          <div className="planning-validation-heading planning-validation-heading-inline">
              <h3 className="planning-document-card-title">Validation</h3>
              <span className={validationBadgeClass}>{validationBadgeLabel}</span>
            </div>
          </div>
          <p className="planning-validation-copy">{completedSummary}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="planning-step-column planning-step-column-narrow">
      <div className="planning-section-card planning-validation-summary">
        <div className="planning-document-card-header">
          <div className="planning-validation-heading">
            <h3 className="planning-document-card-title">{fallbackPrompt.title}</h3>
            <div className="planning-validation-badges">
              <span className={validationBadgeClass}>{validationBadgeLabel}</span>
              {questionBadgeLabel ? <span className="badge badge--verify">{questionBadgeLabel}</span> : null}
            </div>
          </div>
        </div>
        <p className="planning-validation-copy">
          {reviewBlocked
            ? fallbackPrompt.body
            : hasGeneratedTickets
              ? "Validation is complete. Return here if the ticket plan needs another pass."
              : "Run validation before tickets are created."}
        </p>
      </div>
      <div className="planning-step-actions planning-step-actions-centered">
        {reviewBlocked ? (
          <>
            <button type="button" onClick={onBackToTechSpec} disabled={isBusy}>
              Back
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
          <>
            <button type="button" onClick={onBackToTechSpec} disabled={isBusy}>
              Back
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={
                hasGeneratedTickets && !reviewNeedsRefresh
                  ? onOpenTickets
                  : () => void onValidatePlan()
              }
              disabled={isBusy}
            >
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
};
