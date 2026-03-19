import { useEffect, useRef, useState, type ReactNode } from "react";
import type { InitiativePhaseCheckResult } from "../../../api/initiatives.js";
import type {
  InitiativePlanningStep,
  InitiativeRefinementState
} from "../../../types.js";
import type { InitiativePlanningSurface } from "../../utils/initiative-progress.js";
import { INITIATIVE_WORKFLOW_LABELS } from "../../utils/initiative-workflow.js";
import {
  getPlanningGenerationTransitionCopy,
  getPlanningNextActionLabel,
  getPlanningQuestionTransitionCopy
} from "../../utils/ui-language.js";
import { DocumentSummaryCard } from "./document-summary-card.js";
import { RefinementSection } from "./refinement-section.js";
import type { ReopenedQuestionContext } from "./refinement-history.js";
import type { SaveState, SpecStep } from "./shared.js";
import type { BusyActionResult } from "./use-cancellable-busy-action.js";
import { usePhaseAutoAdvance } from "./use-phase-auto-advance.js";

const ENTRY_LOADING_STALL_MS = 3_000;
const INITIAL_BRIEF_CHECK_TIMEOUT_MS = 3_000;

interface PlanningSpecSectionProps {
  initiativeId: string;
  initiativeTitle: string;
  activeSpecStep: SpecStep;
  activeSurface: InitiativePlanningSurface;
  activeRefinement: InitiativeRefinementState | null;
  reopenedQuestionContext?: Record<string, ReopenedQuestionContext>;
  busyAction: string | null;
  isBusy: boolean;
  isDeletingInitiative: boolean;
  hasActiveContent: boolean;
  hasRefinementQuestions: boolean;
  hasPhaseSpecificRefinementDecisions: boolean;
  unresolvedQuestionCount: number;
  nextStep: InitiativePlanningStep | null;
  handlePhaseCheckResult: (step: SpecStep, result: InitiativePhaseCheckResult) => void;
  flushRefinementPersistence: () => Promise<boolean>;
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
  navigateToStep: (step: InitiativePlanningStep, surface?: InitiativePlanningSurface | null) => void;
  setActiveSurface: (surface: InitiativePlanningSurface) => void;
  handleCheckAndAdvance: (step: SpecStep) => Promise<BusyActionResult>;
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
  activeSurface,
  activeRefinement,
  reopenedQuestionContext = {},
  busyAction,
  isBusy,
  isDeletingInitiative,
  hasActiveContent,
  hasRefinementQuestions,
  hasPhaseSpecificRefinementDecisions,
  unresolvedQuestionCount,
  nextStep,
  handlePhaseCheckResult,
  flushRefinementPersistence,
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
  setActiveSurface,
  handleCheckAndAdvance,
  handleRequestGuidance,
  updateRefinementAnswer,
  deferRefinementQuestion,
  openEditDrawer,
  renderSaveState
}: PlanningSpecSectionProps) => {
  const [surveyResumeKey, setSurveyResumeKey] = useState(0);
  const [entryLoadingStalled, setEntryLoadingStalled] = useState(false);
  const downstreamEntryGenerationRef = useRef<SpecStep | null>(null);
  const previousSurfaceRef = useRef<InitiativePlanningSurface>(activeSurface);
  const {
    autoAdvanceFailedStage,
    autoAdvanceStep,
    autoAdvanceFailedStep,
    beginAutoAdvance,
    cancelAutoAdvance: _cancelAutoAdvance,
    isAutoGenerating,
    isAutoPending
  } = usePhaseAutoAdvance({
    initiativeId,
    navigateToStep,
    nextStep,
    onRefresh,
    onPhaseCheckResult: handlePhaseCheckResult
  });

  useEffect(() => {
    if (!isDeletingInitiative) {
      return;
    }

    _cancelAutoAdvance();
  }, [_cancelAutoAdvance, isDeletingInitiative]);

  const refinementCheckedAt = activeRefinement?.checkedAt ?? null;
  const label = INITIATIVE_WORKFLOW_LABELS[activeSpecStep];
  const hasQuestionHistory = Boolean((activeRefinement?.history?.length ?? 0) > 0);
  const showingInlineSurvey = activeSurface === "questions" && hasQuestionHistory;
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
    if (activeSurface === "questions" && previousSurfaceRef.current !== "questions") {
      setSurveyResumeKey((current) => current + 1);
    }

    previousSurfaceRef.current = activeSurface;
  }, [activeSpecStep, activeSurface]);

  useEffect(() => {
    if (!shouldAutoStartBrief) {
      return;
    }

    if (
      (isAutoPending && autoAdvanceStep === "brief") ||
      autoAdvanceFailedStep === "brief"
    ) {
      return;
    }

    void beginAutoAdvance("brief", {
      navigateOnSuccess: false,
      phaseCheckTimeoutMs: INITIAL_BRIEF_CHECK_TIMEOUT_MS,
    });
  }, [
    autoAdvanceFailedStep,
    autoAdvanceStep,
    beginAutoAdvance,
    isAutoPending,
    shouldAutoStartBrief,
  ]);

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
  const loadingStateCopy = loadingQuestions
    ? getPlanningQuestionTransitionCopy(
        activeSpecStep,
        activeRefinement?.questions.length && unresolvedQuestionCount === 0 ? "follow-up" : "entry"
      )
    : null;
  const entryLoadingCopy = getPlanningQuestionTransitionCopy(activeSpecStep, "entry");
  const generationStateCopy = getPlanningGenerationTransitionCopy(activeSpecStep);
  const loadingStateLabel = loadingStateCopy?.title ?? null;
  const loadingStateBody = loadingStateCopy?.body ?? null;
  const questionLoadFailed =
    (activeSpecStep === "brief"
      ? autoAdvanceFailedStep === activeSpecStep
      : autoQuestionLoadFailedStep === activeSpecStep || autoAdvanceFailedStep === activeSpecStep) &&
    (!refinementCheckedAt || autoAdvanceFailedStage === "check");
  const generationFailed =
    autoAdvanceFailedStep === activeSpecStep &&
    autoAdvanceFailedStage === "generate" &&
    !hasActiveContent;
  const showEntryLoadingFallback =
    !hasActiveContent &&
    !hasRefinementQuestions &&
    !loadingQuestions &&
    !generatingStep &&
    !questionLoadFailed &&
    !generationFailed;
  const showingTransientEntryLoading = showEntryLoadingFallback && !entryLoadingStalled;

  useEffect(() => {
    if (!showEntryLoadingFallback) {
      setEntryLoadingStalled(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setEntryLoadingStalled(true);
    }, ENTRY_LOADING_STALL_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showEntryLoadingFallback]);

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

  if (isDeletingInitiative) {
    return (
      <div className="planning-step-column planning-step-column-narrow">
        {renderSurveyCard(
          <div className="status-loading-card planning-intake-loading planning-intake-loading-hero" role="status" aria-live="polite">
            <span className="status-loading-spinner" aria-hidden="true" />
            <div className="status-loading-copy">
              <strong>Deleting initiative</strong>
              <span>Stopping work on this initiative and removing it.</span>
            </div>
          </div>,
          { compact: true, transient: true }
        )}
      </div>
    );
  }

  if (!hasActiveContent) {
    if (activeRefinement && hasRefinementQuestions) {
      return (
        <div className="planning-step-column planning-step-column-narrow">
          {renderSurveyCard(
            <RefinementSection
              activeSpecStep={activeSpecStep}
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
              saveStateIndicator={renderSaveState(refinementSaveState)}
              loadingStateLabel={loadingStateLabel}
              loadingStateBody={loadingStateBody}
              variant="survey"
              surveyCompleteLabel={
                generationFailed
                  ? `Generate ${label.toLowerCase()}`
                  : questionLoadFailed
                    ? "Try again"
                    : "Continue"
              }
              onCompleteSurvey={() => {
                void flushRefinementPersistence().then((persisted) => {
                  if (!persisted) {
                    return;
                  }

                  void beginAutoAdvance(activeSpecStep, { navigateOnSuccess: false });
                });
              }}
              onRequestGuidance={handleRequestGuidance}
              onAnswerChange={updateRefinementAnswer}
              onAnswerLater={deferRefinementQuestion}
            />,
            { compact: Boolean(loadingStateLabel), transient: Boolean(loadingStateLabel) }
          )}
        </div>
      );
    }

    if (loadingQuestions || showingTransientEntryLoading) {
      return (
        <div className="planning-step-column planning-step-column-narrow">
          {renderSurveyCard(
            <div className="status-loading-card planning-intake-loading" role="status" aria-live="polite">
              <span className="status-loading-spinner" aria-hidden="true" />
              <div className="status-loading-copy">
                <strong>{loadingStateLabel ?? entryLoadingCopy.title}</strong>
                <span>{loadingStateBody ?? entryLoadingCopy.body}</span>
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
                <strong>{generationStateCopy.title}</strong>
                <span>{generationStateCopy.body}</span>
              </div>
            </div>,
            { compact: true, transient: true }
          )}
        </div>
      );
    }

    if (questionLoadFailed || generationFailed || entryLoadingStalled) {
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
                      skipCheck: generationFailed,
                      phaseCheckTimeoutMs: generationFailed ? undefined : INITIAL_BRIEF_CHECK_TIMEOUT_MS,
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
          {hasQuestionHistory ? (
            <button
              type="button"
              onClick={() => setActiveSurface("questions")}
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
            saveStateIndicator={renderSaveState(refinementSaveState)}
            variant="survey"
            surveyResumeKey={surveyResumeKey}
            surveyCompleteLabel={
              questionLoadFailed
                ? "Try again"
                : activeSpecStep === "brief"
                  ? "Regenerate brief"
                  : `Update ${label.toLowerCase()}`
            }
            onBackToPreviousStep={() => setActiveSurface("review")}
            onCompleteSurvey={() => {
              void flushRefinementPersistence().then((persisted) => {
                if (!persisted) {
                  return;
                }

                void beginAutoAdvance(activeSpecStep, { navigateOnSuccess: false });
              });
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
