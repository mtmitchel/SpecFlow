import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  InitiativePlanningQuestion,
  InitiativePlanningStep,
  InitiativeRefinementState
} from "../../../types.js";
import { getDecisionTypeLabel } from "../../../planning-decision-types.js";
import { MarkdownView } from "../../components/markdown-view.js";
import {
  getPreviousInitiativeStep,
  INITIATIVE_WORKFLOW_LABELS,
} from "../../utils/initiative-workflow.js";
import { RefinementField } from "./refinement-fields.js";
import type { ReopenedQuestionContext } from "./refinement-history.js";
import { getAnswerPreview, getFirstOpenQuestionId, getResumeQuestionId } from "./refinement-question-utils.js";
import type { SaveState } from "./shared.js";
import { isQuestionAnswered } from "./shared.js";

const buildVisibleQuestions = (
  activeRefinement: InitiativeRefinementState,
): InitiativePlanningQuestion[] => {
  const history = activeRefinement.history ?? [];
  const activeQuestions = activeRefinement.questions;

  if (history.length === 0 || activeQuestions.length === 0) {
    return activeQuestions.length > 0 ? activeQuestions : history;
  }

  const reopenedHistoryQuestionIds = new Set(
    activeQuestions.flatMap((question) => question.reopensQuestionIds ?? [])
  );
  const visibleHistory = history.filter(
    (question) => !reopenedHistoryQuestionIds.has(question.id)
  );
  const activeQuestionsById = new Map(activeQuestions.map((question) => [question.id, question]));
  const visibleQuestions = visibleHistory.map((question) => activeQuestionsById.get(question.id) ?? question);
  const historyQuestionIds = new Set(visibleHistory.map((question) => question.id));

  for (const question of activeQuestions) {
    if (!historyQuestionIds.has(question.id)) {
      visibleQuestions.push(question);
    }
  }

  return visibleQuestions;
};

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
  unresolvedQuestionCount,
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
  onBackToPreviousStep,
  onCompleteSurvey,
  onRequestGuidance,
  onAnswerChange,
  onAnswerLater
}: RefinementSectionProps) => {
  const visibleQuestions = useMemo(
    () => buildVisibleQuestions(activeRefinement),
    [activeRefinement],
  );
  const visibleRefinement = useMemo<InitiativeRefinementState>(
    () => ({
      ...activeRefinement,
      questions: visibleQuestions,
    }),
    [activeRefinement, visibleQuestions],
  );
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(() =>
    getFirstOpenQuestionId(visibleRefinement, refinementAnswers, defaultAnswerQuestionIds),
  );
  const compact = variant !== "full";
  const questionDeck = variant === "survey" || variant === "compact";
  const survey = variant === "survey";
  const showSurveyLoading = questionDeck && Boolean(loadingStateLabel);

  const resolvedQuestionCount = visibleQuestions.length - unresolvedQuestionCount;
  const completionPercent =
    visibleQuestions.length === 0
      ? 0
      : Math.round((resolvedQuestionCount / visibleQuestions.length) * 100);

  useEffect(() => {
    if (openQuestionId === null) {
      if (questionDeck && unresolvedQuestionCount > 0) {
        setOpenQuestionId(getFirstOpenQuestionId(visibleRefinement, refinementAnswers, defaultAnswerQuestionIds));
      }
      return;
    }

    const hasOpenQuestion = visibleQuestions.some((question) => question.id === openQuestionId);
    if (hasOpenQuestion) {
      return;
    }

    setOpenQuestionId(getFirstOpenQuestionId(visibleRefinement, refinementAnswers, defaultAnswerQuestionIds));
  }, [defaultAnswerQuestionIds, openQuestionId, questionDeck, refinementAnswers, unresolvedQuestionCount, visibleQuestions, visibleRefinement]);

  useEffect(() => {
    if (!survey || surveyResumeKey === 0) {
      return;
    }

    setOpenQuestionId(getResumeQuestionId(visibleRefinement, refinementAnswers, defaultAnswerQuestionIds));
  }, [defaultAnswerQuestionIds, refinementAnswers, survey, surveyResumeKey, visibleRefinement]);

  const questionIds = useMemo(
    () => visibleQuestions.map((question) => question.id),
    [visibleQuestions],
  );
  const currentQuestion = questionDeck
    ? openQuestionId === null
      ? null
      : visibleQuestions.find((question) => question.id === openQuestionId) ?? null
    : null;
  const currentQuestionIndex = currentQuestion ? questionIds.indexOf(currentQuestion.id) : -1;
  const previousQuestionId = currentQuestionIndex > 0 ? questionIds[currentQuestionIndex - 1] ?? null : null;
  const nextQuestionId =
    currentQuestionIndex >= 0 && currentQuestionIndex < questionIds.length - 1
      ? questionIds[currentQuestionIndex + 1] ?? null
      : null;
  const surveyStepLabel =
    questionDeck && currentQuestionIndex >= 0
      ? `Step ${leadingStepCount + currentQuestionIndex + 1} of ${leadingStepCount + visibleQuestions.length}`
      : null;
  const completionReviewQuestionId = questionIds[questionIds.length - 1] ?? null;
  const previousStage = getPreviousInitiativeStep(activeSpecStep);
  const backButtonLabel =
    previousStage === null
      ? "Back"
      : `Back to ${INITIATIVE_WORKFLOW_LABELS[previousStage]}`;

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
              Answer what matters, use a default assumption when it does not, and keep the artifact grounded before generation.
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

      {!compact && !survey && unresolvedQuestionCount > 0 ? (
        <div className="planning-inline-note planning-inline-note-warn">
          <span>
            Answer {unresolvedQuestionCount} more question{unresolvedQuestionCount === 1 ? "" : "s"} or use a default assumption before generation.
          </span>
        </div>
      ) : null}

      {!questionDeck ? (
        <div className="planning-intake-question-list">
          {visibleQuestions.map((question, index) => {
            const usingDefault =
              defaultAnswerQuestionIds.includes(question.id) && !isQuestionAnswered(refinementAnswers[question.id]);
            const preview = getAnswerPreview(question, refinementAnswers[question.id], usingDefault);
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
                      value={refinementAnswers[question.id]}
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
                      <div className="status-banner warn" style={{ marginBottom: 0 }}>
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
          <ul style={{ margin: 0 }}>
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
            value={refinementAnswers[currentQuestion.id]}
            onChange={(nextValue) => onAnswerChange(currentQuestion.id, nextValue)}
          />

          <div className="button-row planning-intake-question-actions">
            {onBackToPreviousStep ? (
              <button
                type="button"
                onClick={() => onBackToPreviousStep()}
              >
                {backButtonLabel}
              </button>
            ) : null}
            {previousQuestionId ? (
              <button
                type="button"
                onClick={() => setOpenQuestionId(previousQuestionId)}
              >
                Previous question
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
                !defaultAnswerQuestionIds.includes(currentQuestion.id) &&
                !isQuestionAnswered(refinementAnswers[currentQuestion.id])
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
      ) : questionDeck && !showSurveyLoading && unresolvedQuestionCount === 0 && visibleQuestions.length > 0 ? (
        <div className="planning-survey-question">
          <h3 className="planning-survey-question-title">All questions are answered</h3>
          <p className="planning-survey-question-copy">
            Review an answer or continue when you are ready.
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
