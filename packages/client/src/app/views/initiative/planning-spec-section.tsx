import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  InitiativePlanningStep,
  InitiativeRefinementState
} from "../../../types.js";
import { INITIATIVE_WORKFLOW_LABELS } from "../../utils/initiative-workflow.js";
import { getPlanningNextActionLabel } from "../../utils/ui-language.js";
import { DocumentSummaryCard } from "./document-summary-card.js";
import { RefinementSection } from "./refinement-section.js";
import type { SaveState, SpecStep } from "./shared.js";
import { usePhaseAutoAdvance } from "./use-phase-auto-advance.js";

interface PlanningSpecSectionProps {
  initiativeId: string;
  initiativeTitle: string;
  activeSpecStep: SpecStep;
  activeRefinement: InitiativeRefinementState | null;
  busyAction: string | null;
  isBusy: boolean;
  hasActiveContent: boolean;
  hasRefinementQuestions: boolean;
  hasPhaseSpecificRefinementDecisions: boolean;
  unresolvedQuestionCount: number;
  nextStep: InitiativePlanningStep | null;
  refinementAnswers: Record<string, string | string[] | boolean>;
  defaultAnswerQuestionIds: string[];
  refinementAssumptions: string[];
  refinementSaveState: SaveState;
  guidanceQuestionId: string | null;
  guidanceText: string | null;
  savedDrafts: Record<SpecStep, string>;
  autoQuestionLoadStep: SpecStep | null;
  autoQuestionLoadFailedStep: SpecStep | null;
  onRefresh: () => Promise<void>;
  navigateToStep: (step: InitiativePlanningStep) => void;
  handleCheckAndAdvance: (step: SpecStep) => Promise<boolean>;
  handleRequestGuidance: (questionId: string) => void | Promise<void>;
  updateRefinementAnswer: (questionId: string, nextValue: string | string[] | boolean) => void;
  deferRefinementQuestion: (questionId: string) => void;
  openEditDrawer: (step: SpecStep) => void;
  renderSaveState: (state: SaveState) => ReactNode;
}

export const PlanningSpecSection = ({
  initiativeId,
  initiativeTitle,
  activeSpecStep,
  activeRefinement,
  busyAction,
  isBusy,
  hasActiveContent,
  hasRefinementQuestions,
  hasPhaseSpecificRefinementDecisions,
  unresolvedQuestionCount,
  nextStep,
  refinementAnswers,
  defaultAnswerQuestionIds,
  refinementAssumptions,
  refinementSaveState,
  guidanceQuestionId,
  guidanceText,
  savedDrafts,
  autoQuestionLoadStep,
  autoQuestionLoadFailedStep,
  onRefresh,
  navigateToStep,
  handleCheckAndAdvance,
  handleRequestGuidance,
  updateRefinementAnswer,
  deferRefinementQuestion,
  openEditDrawer,
  renderSaveState
}: PlanningSpecSectionProps) => {
  const [showInlineSurvey, setShowInlineSurvey] = useState(false);
  const [surveyResumeKey, setSurveyResumeKey] = useState(0);
  const briefEntryStartedRef = useRef(false);
  const downstreamEntryGenerationRef = useRef<SpecStep | null>(null);
  const {
    autoAdvanceFailedStage,
    autoAdvanceStep,
    autoAdvanceFailedStep,
    beginAutoAdvance,
    isAutoGenerating,
    isAutoPending
  } = usePhaseAutoAdvance({
    initiativeId,
    navigateToStep,
    nextStep,
    onRefresh
  });

  const refinementCheckedAt = activeRefinement?.checkedAt ?? null;
  const label = INITIATIVE_WORKFLOW_LABELS[activeSpecStep];
  const showingInlineSurvey = showInlineSurvey && Boolean(activeRefinement?.questions.length);
  const shouldAutoStartBrief =
    activeSpecStep === "brief" &&
    !hasActiveContent &&
    !hasRefinementQuestions &&
    !hasPhaseSpecificRefinementDecisions &&
    !refinementCheckedAt;
  const shouldAutoGenerateAfterEntryCheck =
    activeSpecStep !== "brief" &&
    !hasActiveContent &&
    !hasRefinementQuestions &&
    !hasPhaseSpecificRefinementDecisions &&
    Boolean(refinementCheckedAt);

  useEffect(() => {
    setShowInlineSurvey(false);
  }, [activeSpecStep]);

  useEffect(() => {
    if (!shouldAutoStartBrief) {
      briefEntryStartedRef.current = false;
      return;
    }

    if (briefEntryStartedRef.current) {
      return;
    }

    briefEntryStartedRef.current = true;
    void beginAutoAdvance("brief", { navigateOnSuccess: false });
  }, [beginAutoAdvance, shouldAutoStartBrief]);

  useEffect(() => {
    if (!shouldAutoGenerateAfterEntryCheck) {
      downstreamEntryGenerationRef.current = null;
      return;
    }

    if (
      downstreamEntryGenerationRef.current === activeSpecStep ||
      autoQuestionLoadStep === activeSpecStep ||
      (autoQuestionLoadFailedStep === activeSpecStep && !refinementCheckedAt) ||
      autoAdvanceStep === activeSpecStep
    ) {
      return;
    }

    downstreamEntryGenerationRef.current = activeSpecStep;
    void beginAutoAdvance(activeSpecStep, { skipCheck: true });
  }, [
    activeSpecStep,
    autoAdvanceStep,
    autoQuestionLoadFailedStep,
    autoQuestionLoadStep,
    beginAutoAdvance,
    shouldAutoGenerateAfterEntryCheck
  ]);

  const loadingQuestions =
    autoQuestionLoadStep === activeSpecStep ||
    (isAutoPending && autoAdvanceStep === activeSpecStep && !isAutoGenerating);
  const generatingStep =
    busyAction === `generate-${activeSpecStep}` ||
    (isAutoGenerating && autoAdvanceStep === activeSpecStep);
  const loadingStateLabel =
    loadingQuestions && activeRefinement?.questions.length && unresolvedQuestionCount === 0
      ? `Checking if the ${label.toLowerCase()} needs anything else`
      : loadingQuestions
        ? "Getting the questions ready"
        : null;
  const questionLoadFailed =
    (activeSpecStep === "brief"
      ? autoAdvanceFailedStep === activeSpecStep
      : autoQuestionLoadFailedStep === activeSpecStep || autoAdvanceFailedStep === activeSpecStep) &&
    (!refinementCheckedAt || autoAdvanceFailedStage === "check");
  const generationFailed =
    autoAdvanceFailedStep === activeSpecStep &&
    autoAdvanceFailedStage === "generate" &&
    !hasActiveContent;

  const renderSurveyCard = (
    content: ReactNode,
    options: { compact?: boolean; retryOnly?: boolean; transient?: boolean } = {}
  ) => (
    <div
      className={[
        "planning-survey-card",
        "planning-survey-card-active",
        options.compact ? "planning-survey-card-compact" : "",
        options.retryOnly ? "planning-survey-card-retry" : "",
        options.transient ? "planning-survey-card-transient" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {content}
    </div>
  );

  if (!hasActiveContent) {
    if (activeRefinement && hasRefinementQuestions) {
      return (
        <div className="planning-step-column planning-step-column-narrow">
          {renderSurveyCard(
            <RefinementSection
              activeSpecStep={activeSpecStep}
              activeRefinement={activeRefinement}
              refinementAnswers={refinementAnswers}
              defaultAnswerQuestionIds={defaultAnswerQuestionIds}
              refinementAssumptions={refinementAssumptions}
              refinementSaveState={refinementSaveState}
              unresolvedQuestionCount={unresolvedQuestionCount}
              guidanceQuestionId={guidanceQuestionId}
              guidanceText={guidanceText}
              busyAction={busyAction}
              isBusy={isBusy}
              saveStateIndicator={renderSaveState(refinementSaveState)}
              loadingStateLabel={loadingStateLabel}
              variant="survey"
              surveyCompleteLabel="Continue"
              onCompleteSurvey={() => {
                void beginAutoAdvance(activeSpecStep, { navigateOnSuccess: activeSpecStep !== "brief" });
              }}
              onRequestGuidance={handleRequestGuidance}
              onAnswerChange={updateRefinementAnswer}
              onAnswerLater={deferRefinementQuestion}
            />,
            { compact: Boolean(loadingStateLabel) }
          )}
        </div>
      );
    }

    if (loadingQuestions) {
      return (
        <div className="planning-step-column planning-step-column-narrow">
          {renderSurveyCard(
            <div className="status-loading-card planning-intake-loading" role="status" aria-live="polite">
              <span className="status-loading-spinner" aria-hidden="true" />
              <div className="status-loading-copy">
                <strong>{loadingStateLabel ?? "Getting the questions ready"}</strong>
                <span>
                  {loadingStateLabel
                    ? "Stay here. More questions may appear, or the next step will unlock."
                    : `SpecFlow is checking what it needs before drafting the ${label.toLowerCase()}.`}
                </span>
              </div>
            </div>,
            { compact: true, transient: true }
          )}
        </div>
      );
    }

    if (generatingStep) {
      return (
        <div className="planning-step-column planning-step-column-narrow">
          {renderSurveyCard(
            <div className="status-loading-card planning-intake-loading planning-intake-loading-hero" role="status" aria-live="polite">
              <span className="status-loading-spinner" aria-hidden="true" />
              <div className="status-loading-copy">
                <strong>{`Drafting the ${label.toLowerCase()}`}</strong>
                <span>{`SpecFlow is turning the confirmed inputs into the ${label.toLowerCase()}.`}</span>
              </div>
            </div>,
            { compact: true, transient: true }
          )}
        </div>
      );
    }

    if (questionLoadFailed || generationFailed) {
      return (
        <div className="planning-step-column planning-step-column-narrow">
          {renderSurveyCard(
            <div className="planning-step-actions planning-step-actions-centered">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  if (activeSpecStep === "brief") {
                    void beginAutoAdvance("brief", {
                      navigateOnSuccess: false,
                      skipCheck: generationFailed
                    });
                    return;
                  }

                  if (generationFailed) {
                    void beginAutoAdvance(activeSpecStep, { skipCheck: true });
                    return;
                  }

                  void handleCheckAndAdvance(activeSpecStep);
                }}
                disabled={isBusy}
              >
                {generationFailed ? `Generate ${label.toLowerCase()}` : "Try again"}
              </button>
            </div>,
            { compact: true, retryOnly: true }
          )}
        </div>
      );
    }
  }

  return (
    <div className={`planning-step-column${hasActiveContent ? " planning-step-column-wide" : " planning-step-column-narrow"}`}>
      {hasActiveContent && !showingInlineSurvey ? (
        <div className="planning-step-actions planning-step-actions-end">
          {activeRefinement?.checkedAt || activeRefinement?.questions.length ? (
            <button
              type="button"
              onClick={() => {
                setShowInlineSurvey(true);
                setSurveyResumeKey((current) => current + 1);
              }}
              disabled={isBusy}
            >
              Back
            </button>
          ) : null}
          {nextStep ? (
            <button type="button" className="btn-primary" onClick={() => navigateToStep(nextStep)} disabled={isBusy}>
              {getPlanningNextActionLabel(nextStep)}
            </button>
          ) : null}
        </div>
      ) : null}

      {hasActiveContent && showingInlineSurvey && activeRefinement ? (
        renderSurveyCard(
          <RefinementSection
            activeSpecStep={activeSpecStep}
            activeRefinement={activeRefinement}
            refinementAnswers={refinementAnswers}
            defaultAnswerQuestionIds={defaultAnswerQuestionIds}
            refinementAssumptions={refinementAssumptions}
            refinementSaveState={refinementSaveState}
            unresolvedQuestionCount={unresolvedQuestionCount}
            guidanceQuestionId={guidanceQuestionId}
            guidanceText={guidanceText}
            busyAction={busyAction}
            isBusy={isBusy}
            saveStateIndicator={renderSaveState(refinementSaveState)}
            variant="survey"
            surveyResumeKey={surveyResumeKey}
            surveyCompleteLabel={activeSpecStep === "brief" ? "Regenerate brief" : `Update ${label.toLowerCase()}`}
            onBackToPreviousStep={() => setShowInlineSurvey(false)}
            onCompleteSurvey={() => {
              void beginAutoAdvance(activeSpecStep, { navigateOnSuccess: false });
            }}
            onRequestGuidance={handleRequestGuidance}
            onAnswerChange={updateRefinementAnswer}
            onAnswerLater={deferRefinementQuestion}
          />
        )
      ) : null}

      {hasActiveContent && !showingInlineSurvey ? (
        <div className="planning-main-column">
          <DocumentSummaryCard
            step={activeSpecStep}
            content={savedDrafts[activeSpecStep]}
            initiativeTitle={initiativeTitle}
            isBusy={isBusy}
            onEdit={() => openEditDrawer(activeSpecStep)}
          />
        </div>
      ) : null}
    </div>
  );
};
