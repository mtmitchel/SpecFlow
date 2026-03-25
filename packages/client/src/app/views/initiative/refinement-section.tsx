import type { ReactNode } from "react";
import type {
  InitiativePlanningQuestion,
  InitiativePlanningStep,
  InitiativeRefinementState
} from "../../../types.js";
import { getDecisionTypeLabel } from "../../../planning-decision-types.js";
import { MarkdownView } from "../../components/markdown-view.js";
import {
  INITIATIVE_WORKFLOW_LABELS,
} from "../../utils/initiative-workflow.js";
import { RefinementField } from "./refinement-fields.js";
import type { ReopenedQuestionContext } from "./refinement-history.js";
import { getAnswerPreview } from "./refinement-question-utils.js";
import type { SaveState } from "./shared.js";
import { isQuestionAnswered } from "./shared.js";
import { useRefinementState } from "./use-refinement-state.js";

interface RefinementSectionProps {
  activeSpecStep: InitiativePlanningStep;
  activeRefinement: InitiativeRefinementState;
  reopenedQuestionContext?: Record<string, ReopenedQuestionContext>;
  refinementAnswers: Record<string, string | string[] | boolean>;
  defaultAnswerQuestionIds: string[];
  refinementAssumptions: string[];
  refinementSaveState: SaveState;
  unresolvedQuestionCount: number;
  guidanceQuestionId: string | null;
  guidanceText: string | null;
  busyAction: string | null;
  isBusy: boolean;
  saveStateIndicator: ReactNode;
  loadingStateLabel?: string | null;
  loadingStateBody?: string | null;
  variant?: "full" | "compact" | "survey";
  leadingStepCount?: number;
  surveyResumeKey?: number;
  surveyCompleteLabel?: string;
  autoCompleteResolvedSurvey?: boolean;
  onBackToPreviousStep?: () => void;
  onCompleteSurvey?: () => void | Promise<void>;
  onRequestGuidance: (questionId: string) => void | Promise<void>;
  onAnswerChange: (questionId: string, nextValue: string | string[] | boolean) => void;
  onAnswerLater: (questionId: string) => void;
}

export const RefinementSection = ({
  activeSpecStep,
  activeRefinement,
  reopenedQuestionContext = {},
  refinementAnswers,
  defaultAnswerQuestionIds,
  refinementAssumptions,
  unresolvedQuestionCount: _unresolvedQuestionCount,
  guidanceQuestionId,
  guidanceText,
  busyAction,
  isBusy,
  saveStateIndicator,
  loadingStateLabel = null,
  loadingStateBody = null,
  variant = "full",
  leadingStepCount = 0,
  surveyResumeKey = 0,
  surveyCompleteLabel = "Continue",
  autoCompleteResolvedSurvey = false,
  onBackToPreviousStep,
  onCompleteSurvey,
  onRequestGuidance,
  onAnswerChange,
  onAnswerLater
}: RefinementSectionProps) => {
  const {
    visibleQuestions,
    effectiveRefinementAnswers,
    effectiveDefaultAnswerQuestionIds,
    locallyUnresolvedQuestionCount,
    resolvedQuestionCount,
    completionPercent,
    openQuestionId,
    setOpenQuestionId,
    currentQuestion,
    previousQuestionId,
    nextQuestionId,
    questionIds,
    surveyStepLabel,
    completionReviewQuestionId,
    questionDeck,
    compact,
    survey,
    showSurveyLoading,
  } = useRefinementState({
    activeSpecStep,
    activeRefinement,
    refinementAnswers,
    defaultAnswerQuestionIds,
    variant,
    leadingStepCount,
    surveyResumeKey,
    autoCompleteResolvedSurvey,
    loadingStateLabel,
    onCompleteSurvey,
  });

  const backButtonLabel = "Back";

  const renderReopenedQuestionContext = (
    question: InitiativePlanningQuestion,
    variant: "panel" | "survey" = "panel",
  ): ReactNode => {
    if (!question.reopensQuestionIds?.length) {
      return null;
    }

    const reopenedQuestions = question.reopensQuestionIds
      .map((questionId) => reopenedQuestionContext[questionId])
      .filter((context): context is ReopenedQuestionContext => Boolean(context));

    if (reopenedQuestions.length === 0) {
      return null;
    }

    if (variant === "survey") {
      return (
        <div className="planning-survey-question-context" aria-label="Earlier decision context">
          {reopenedQuestions.map((context) => (
            <p key={context.questionId} className="planning-survey-question-context-line">
              <span className="planning-survey-question-context-step">{context.stepLabel}</span>
              <span aria-hidden="true">:</span>
              <span>{context.resolutionLabel ?? context.questionLabel}</span>
            </p>
          ))}
        </div>
      );
    }

    return (
      <div className="planning-inline-note planning-inline-note-reopen">
        <div className="planning-reopen-context-copy">
          <strong>Reopening an earlier decision</strong>
          <ul className="planning-reopen-context-list">
            {reopenedQuestions.map((context) => (
              <li key={context.questionId}>
                <span>{context.stepLabel}: {context.questionLabel}</span>
                {context.resolutionLabel ? <span>{context.resolutionLabel}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`planning-intake-flow${compact ? " planning-intake-flow-compact" : ""}${questionDeck ? " planning-intake-flow-survey" : ""}${
        loadingStateLabel && compact ? " planning-intake-flow-loading" : ""
      }`}
    >
      {questionDeck ? (
        <div className="planning-survey-step-header">
          {surveyStepLabel ? <span className="planning-survey-card-step">{surveyStepLabel}</span> : null}
          {saveStateIndicator}
        </div>
      ) : !compact ? (
        <div className="planning-intake-header">
          <div>
            <div className="planning-intake-title">
              {visibleQuestions.length} question{visibleQuestions.length === 1 ? "" : "s"} before the{" "}
              {INITIATIVE_WORKFLOW_LABELS[activeSpecStep].toLowerCase()}
            </div>
            <p className="planning-intake-copy">
              Answer the open questions. If one does not matter yet, use the default and keep moving.
            </p>
          </div>
          <div className="planning-intake-meta">
            <span>
              {resolvedQuestionCount}/{visibleQuestions.length} resolved
            </span>
            {saveStateIndicator}
          </div>
        </div>
      ) : null}

      <div className="planning-intake-progress" aria-hidden="true">
        <div className="planning-intake-progress-fill" style={{ width: `${completionPercent}%` }} />
      </div>

      {loadingStateLabel ? (
        <div
          className={`status-loading-card planning-intake-loading${compact ? " planning-intake-loading-compact" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span className="status-loading-spinner" aria-hidden="true" />
          <div className="status-loading-copy">
            <strong>{loadingStateLabel}</strong>
            {loadingStateBody ? <span>{loadingStateBody}</span> : null}
          </div>
        </div>
      ) : null}

      {!compact && !survey && locallyUnresolvedQuestionCount > 0 ? (
        <div className="planning-inline-note planning-inline-note-warn">
          <span>
            Answer {locallyUnresolvedQuestionCount} more question{locallyUnresolvedQuestionCount === 1 ? "" : "s"}, or use the default where it fits, before you generate this step.
          </span>
        </div>
      ) : null}

      {!questionDeck ? (
        <div className="planning-intake-question-list">
          {visibleQuestions.map((question, index) => {
            const usingDefault =
              effectiveDefaultAnswerQuestionIds.includes(question.id) &&
              !isQuestionAnswered(effectiveRefinementAnswers[question.id]);
            const preview = getAnswerPreview(
              question,
              effectiveRefinementAnswers[question.id],
              usingDefault,
            );
            const resolved = Boolean(preview);
            const open = openQuestionId === question.id;
            const questionIndex = questionIds.indexOf(question.id);
            const nextQuestionId = questionIds[questionIndex + 1] ?? null;

            return (
              <div
                key={question.id}
                className={`planning-intake-question${open ? " active" : ""}${resolved ? " resolved" : ""}${
                  usingDefault ? " defaulted" : ""
                }`}
              >
                <button
                  type="button"
                  className="planning-intake-question-toggle"
                  onClick={() => setOpenQuestionId((current) => (current === question.id ? null : question.id))}
                >
                  <span className="planning-intake-question-index" aria-hidden="true">
                    {resolved ? "✓" : index + 1}
                  </span>
                  <span className="planning-intake-question-body-copy">
                    <span className="planning-intake-question-label">{question.label}</span>
                    {!open ? (
                      <span className="planning-intake-question-hint">
                        {usingDefault ? "Using default assumption" : question.whyThisBlocks}
                      </span>
                    ) : null}
                  </span>
                  {preview && !open ? <span className="planning-intake-question-preview">{preview}</span> : null}
                  {!compact ? (
                    <span className="planning-intake-question-pill">{getDecisionTypeLabel(question.decisionType)}</span>
                  ) : null}
                </button>

                {open ? (
                  <div className="planning-intake-question-panel">
                    <p className="planning-intake-question-support">{question.whyThisBlocks}</p>
                    {renderReopenedQuestionContext(question)}
                    <RefinementField
                      question={question}
                      value={effectiveRefinementAnswers[question.id]}
                      onChange={(nextValue) => onAnswerChange(question.id, nextValue)}
                    />

                    <div className="button-row planning-intake-question-actions">
                      {!compact ? (
                        <button type="button" onClick={() => void onRequestGuidance(question.id)} disabled={isBusy}>
                          {busyAction === "refinement-help" && guidanceQuestionId === question.id ? "Thinking..." : "Get guidance"}
                        </button>
                      ) : null}
                      <button type="button" onClick={() => onAnswerLater(question.id)}>
                        {usingDefault ? (compact ? "Using default" : "Using default assumption") : compact ? "Skip" : "Use default assumption"}
                      </button>
                      {nextQuestionId ? (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => setOpenQuestionId(nextQuestionId)}
                        >
                          {compact ? "Next" : "Next question"}
                        </button>
                      ) : (
                        <button type="button" className="btn-primary" onClick={() => setOpenQuestionId(null)}>
                          Done
                        </button>
                      )}
                    </div>

                    {!compact && guidanceQuestionId === question.id && guidanceText ? (
                      <div className="clarification-guidance">
                        <MarkdownView content={guidanceText} />
                      </div>
                    ) : null}

                    {!compact && usingDefault ? (
                      <div className="status-banner warn mb-0">
                        Default assumption: {question.assumptionIfUnanswered}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {!compact && refinementAssumptions.length > 0 ? (
        <div className="clarification-help-panel">
          <span className="qa-label">Current assumptions</span>
          <ul className="m-0">
            {refinementAssumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {questionDeck && !showSurveyLoading && currentQuestion ? (
        <div className="planning-survey-question">
          <h3 className="planning-survey-question-title">{currentQuestion.label}</h3>
          {renderReopenedQuestionContext(currentQuestion, "survey")}
          <RefinementField
            question={currentQuestion}
            value={effectiveRefinementAnswers[currentQuestion.id]}
            onChange={(nextValue) => onAnswerChange(currentQuestion.id, nextValue)}
          />

          <div className="button-row planning-intake-question-actions">
            {previousQuestionId ? (
              <button
                type="button"
                onClick={() => setOpenQuestionId(previousQuestionId)}
              >
                Back
              </button>
            ) : onBackToPreviousStep ? (
              <button
                type="button"
                onClick={() => onBackToPreviousStep()}
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                onAnswerLater(currentQuestion.id);
                if (nextQuestionId) {
                  setOpenQuestionId(nextQuestionId);
                  return;
                }

                setOpenQuestionId(null);
              }}
            >
              Skip
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={
                isBusy ||
                !effectiveDefaultAnswerQuestionIds.includes(currentQuestion.id) &&
                !isQuestionAnswered(effectiveRefinementAnswers[currentQuestion.id])
              }
              onClick={() => {
                if (nextQuestionId) {
                  setOpenQuestionId(nextQuestionId);
                  return;
                }

                if (onCompleteSurvey) {
                  void onCompleteSurvey();
                  return;
                }

                setOpenQuestionId(null);
              }}
            >
              {nextQuestionId ? "Continue" : surveyCompleteLabel}
            </button>
          </div>
        </div>
      ) : questionDeck && !showSurveyLoading && locallyUnresolvedQuestionCount === 0 && visibleQuestions.length > 0 ? (
        <div className="planning-survey-question">
          <h3 className="planning-survey-question-title">All questions are answered</h3>
          <p className="planning-survey-question-copy">
            Review an answer, or keep moving when you are ready.
          </p>

          <div className="button-row planning-intake-question-actions">
            {onBackToPreviousStep ? (
              <button
                type="button"
                onClick={() => onBackToPreviousStep()}
              >
                {backButtonLabel}
              </button>
            ) : null}
            {completionReviewQuestionId ? (
              <button
                type="button"
                onClick={() => setOpenQuestionId(completionReviewQuestionId)}
              >
                Review answers
              </button>
            ) : null}
            {onCompleteSurvey ? (
              <button
                type="button"
                className="btn-primary"
                disabled={isBusy}
                onClick={() => {
                  void onCompleteSurvey();
                }}
              >
                {surveyCompleteLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
