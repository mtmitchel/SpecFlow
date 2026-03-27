import type { ReactNode } from "react";
import type { InitiativePhaseCheckResult } from "../../../api/initiatives.js";
import type {
  InitiativePlanningStep,
  InitiativeRefinementState,
} from "../../../types.js";
import type { InitiativePlanningSurface } from "../../utils/initiative-progress.js";
import { DocumentSummaryCard } from "./document-summary-card.js";
import { RefinementSection } from "./refinement-section.js";
import { type ReopenedQuestionContext } from "./refinement-history.js";
import type { SaveState, SpecStep } from "./shared.js";
import type { BusyActionResult } from "./use-cancellable-busy-action.js";
import { PlanningSurveyCard } from "./planning-survey-card.js";
import { usePlanningSpecState } from "./use-planning-spec-state.js";

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
  hasPhaseSpecificRefinementDecisions: boolean;
  unresolvedQuestionCount: number;
  nextStep: InitiativePlanningStep | null;
  nextStepActionLabel: string | null;
  handlePhaseCheckResult: (
    step: SpecStep,
    result: InitiativePhaseCheckResult,
  ) => void;
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
  navigateToStep: (
    step: InitiativePlanningStep,
    surface?: InitiativePlanningSurface | null,
  ) => void;
  setActiveSurface: (surface: InitiativePlanningSurface) => void;
  handleCheckAndAdvance: (step: SpecStep) => Promise<BusyActionResult>;
  onAdvanceToNextStep: (() => void) | null;
  handleRequestGuidance: (questionId: string) => void | Promise<void>;
  updateRefinementAnswer: (
    questionId: string,
    nextValue: string | string[] | boolean,
  ) => void;
  deferRefinementQuestion: (questionId: string) => void;
  openEditDrawer: (step: SpecStep) => void;
  openRefinementDrawer: (step: SpecStep) => void;
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
  hasPhaseSpecificRefinementDecisions,
  unresolvedQuestionCount,
  nextStep,
  nextStepActionLabel,
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
  onAdvanceToNextStep,
  handleRequestGuidance,
  updateRefinementAnswer,
  deferRefinementQuestion,
  openEditDrawer,
  openRefinementDrawer,
  renderSaveState,
}: PlanningSpecSectionProps) => {
  const state = usePlanningSpecState({
    initiativeId,
    activeSpecStep,
    activeSurface,
    activeRefinement,
    busyAction,
    isDeletingInitiative,
    hasActiveContent,
    hasPhaseSpecificRefinementDecisions,
    unresolvedQuestionCount,
    nextStep,
    nextStepActionLabel,
    handlePhaseCheckResult,
    flushRefinementPersistence,
    refinementAnswers,
    defaultAnswerQuestionIds,
    autoQuestionLoadStep,
    autoQuestionLoadFailedStep,
    onRefresh,
    navigateToStep,
    setActiveSurface,
    handleCheckAndAdvance,
    onAdvanceToNextStep,
    openRefinementDrawer,
  });

  if (isDeletingInitiative) {
    return (
      <div className="planning-step-column planning-step-column-narrow">
        <PlanningSurveyCard compact transient>
          <div
            className="status-loading-card planning-intake-loading planning-intake-loading-hero"
            role="status"
            aria-live="polite"
          >
            <span className="status-loading-spinner" aria-hidden="true" />
            <div className="status-loading-copy">
              <strong>Deleting project</strong>
              <span>Stopping work on this project and removing it.</span>
            </div>
          </div>
        </PlanningSurveyCard>
      </div>
    );
  }

  if (!hasActiveContent) {
    if (state.loadingQuestions || state.showingTransientEntryLoading) {
      return (
        <div className="planning-step-column planning-step-column-narrow">
          <PlanningSurveyCard compact transient>
            <div
              className="status-loading-card planning-intake-loading"
              role="status"
              aria-live="polite"
            >
              <span className="status-loading-spinner" aria-hidden="true" />
              <div className="status-loading-copy">
                <strong>{state.loadingStateLabel ?? state.entryLoadingCopy.title}</strong>
                <span>{state.loadingStateBody ?? state.entryLoadingCopy.body}</span>
              </div>
            </div>
          </PlanningSurveyCard>
        </div>
      );
    }

    if (state.generatingStep) {
      return (
        <div className="planning-step-column planning-step-column-narrow">
          <PlanningSurveyCard compact transient>
            <div
              className="status-loading-card planning-intake-loading planning-intake-loading-hero"
              role="status"
              aria-live="polite"
            >
              <span className="status-loading-spinner" aria-hidden="true" />
              <div className="status-loading-copy">
                <strong>{state.generationStateCopy.title}</strong>
                <span>{state.generationStateCopy.body}</span>
              </div>
            </div>
          </PlanningSurveyCard>
        </div>
      );
    }

    if (activeRefinement && state.hasRevisableQuestions) {
      return (
        <div className="planning-step-column planning-step-column-narrow">
          <PlanningSurveyCard
            compact={Boolean(state.loadingStateLabel)}
            transient={Boolean(state.loadingStateLabel)}
          >
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
              loadingStateLabel={state.loadingStateLabel}
              loadingStateBody={state.loadingStateBody}
              variant="survey"
              autoCompleteResolvedSurvey={activeSurface === "questions"}
              surveyCompleteLabel={
                state.generationFailed
                  ? `Generate ${state.label.toLowerCase()}`
                  : state.questionLoadFailed
                    ? "Try again"
                    : "Continue"
              }
              onBackToPreviousStep={state.previousStep ? state.navigateToPreviousStage : undefined}
              onCompleteSurvey={state.handleCompleteSurvey}
              onQuestionContinue={state.handleQuestionContinue}
              onRequestGuidance={handleRequestGuidance}
              onAnswerChange={updateRefinementAnswer}
              onAnswerLater={deferRefinementQuestion}
            />
          </PlanningSurveyCard>
        </div>
      );
    }

    if (state.questionLoadFailed || state.generationFailed || !state.showingTransientEntryLoading) {
      return (
        <div className="planning-step-column planning-step-column-narrow">
          <PlanningSurveyCard compact retryOnly>
            <div className="planning-step-actions planning-step-actions-centered">
              <button
                type="button"
                className="btn-primary"
                onClick={state.handleRetry}
                disabled={isBusy}
              >
                {state.generationFailed
                  ? `Generate ${state.label.toLowerCase()}`
                  : "Try again"}
              </button>
            </div>
          </PlanningSurveyCard>
        </div>
      );
    }
  }

  return (
    <div
      className={`planning-step-column${hasActiveContent ? " planning-step-column-wide" : " planning-step-column-narrow"}`}
    >
      {hasActiveContent && !state.showingInlineSurvey ? (
        <div className="planning-step-actions planning-step-actions-end">
          {state.previousStep ? (
            <button
              type="button"
              onClick={state.navigateToPreviousStage}
              disabled={isBusy}
            >
              {state.previousStepLabel}
            </button>
          ) : null}
          {state.canReviseAnswers ? (
            <button
              type="button"
              onClick={state.handleReviseAnswers}
              disabled={isBusy}
            >
              Revise answers
            </button>
          ) : null}
          {nextStep ? (
            <button
              type="button"
              className="btn-primary"
              onClick={state.handleAdvanceToNextStep}
              disabled={isBusy}
            >
              {state.nextStepActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {hasActiveContent && state.showingInlineSurvey && activeRefinement
        ? (
          <PlanningSurveyCard>
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
              loadingStateLabel={state.inlineSurveyLoadingLabel}
              loadingStateBody={state.inlineSurveyLoadingBody}
              variant="survey"
              surveyResumeKey={state.surveyResumeKey}
              surveyCompleteLabel={
                state.questionLoadFailed
                  ? "Try again"
                  : activeSpecStep === "brief"
                    ? "Regenerate brief"
                    : `Update ${state.label.toLowerCase()}`
              }
              onBackToPreviousStep={state.previousStep ? state.navigateToPreviousStage : undefined}
              onCompleteSurvey={state.handleCompleteSurvey}
              onQuestionContinue={state.handleQuestionContinue}
              onRequestGuidance={handleRequestGuidance}
              onAnswerChange={updateRefinementAnswer}
              onAnswerLater={deferRefinementQuestion}
            />
          </PlanningSurveyCard>
        )
        : null}

      {hasActiveContent && !state.showingInlineSurvey ? (
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
