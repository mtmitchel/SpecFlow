import { useEffect, useMemo, useState } from "react";
import { type ReviewQuestion } from "./shared.js";

const MAX_VISIBLE_DETAILS = 4;

interface ReviewQuestionSurveyProps {
  title: string;
  intro: string;
  questions: ReviewQuestion[];
  completeLabel: string;
  completeBusyLabel?: string;
  completeBusy?: boolean;
  onComplete: () => void | Promise<void>;
  onClose?: () => void;
  onResolveCurrent?: (question: ReviewQuestion) => void;
  showOverrideAction?: boolean;
  showOverrideForm?: boolean;
  overrideReason?: string | null;
  overridePlaceholder?: string;
  overrideBusy?: boolean;
  overrideActionLabel?: string;
  cancelOverrideLabel?: string;
  overrideConfirmLabel?: string;
  overrideBusyLabel?: string;
  onToggleOverride?: () => void;
  onChangeOverrideReason?: (reason: string) => void;
  onConfirmOverride?: () => void | Promise<void>;
}

export const ReviewQuestionSurvey = ({
  title,
  intro,
  questions,
  completeLabel,
  completeBusyLabel = completeLabel,
  completeBusy = false,
  onComplete,
  onClose,
  onResolveCurrent,
  showOverrideAction = false,
  showOverrideForm = false,
  overrideReason = "",
  overridePlaceholder = "Add a short reason for accepting the remaining risk.",
  overrideBusy = false,
  overrideActionLabel = "Accept risk",
  cancelOverrideLabel = "Keep blocking",
  overrideConfirmLabel = "Accept risk",
  overrideBusyLabel = "Saving...",
  onToggleOverride,
  onChangeOverrideReason,
  onConfirmOverride,
}: ReviewQuestionSurveyProps) => {
  const [questionIndex, setQuestionIndex] = useState(0);

  const questionKey = useMemo(
    () => questions.map((question) => question.id).join("|"),
    [questions],
  );

  useEffect(() => {
    setQuestionIndex(0);
  }, [questionKey]);

  const safeQuestionIndex =
    questions.length === 0 ? 0 : Math.min(questionIndex, questions.length - 1);
  const currentQuestion =
    questions.length === 0 ? null : questions[safeQuestionIndex] ?? null;
  const stepLabel =
    questions.length > 0
      ? `Step ${safeQuestionIndex + 1} of ${questions.length}`
      : "Coverage review";
  const progressPercent =
    questions.length > 0
      ? Math.round(((safeQuestionIndex + 1) / questions.length) * 100)
      : 100;
  const visibleDetails = currentQuestion?.details.slice(0, MAX_VISIBLE_DETAILS) ?? [];
  const hiddenDetailCount =
    currentQuestion === null
      ? 0
      : Math.max(currentQuestion.details.length - visibleDetails.length, 0);
  const canSubmitOverride =
    typeof overrideReason === "string" && overrideReason.trim().length > 0;
  const atLastQuestion =
    questions.length === 0 || safeQuestionIndex === questions.length - 1;
  const currentQuestionActionLabel = currentQuestion?.actionLabel?.trim() ?? "";
  const showResolveAction =
    Boolean(currentQuestion) &&
    currentQuestionActionLabel.length > 0 &&
    typeof onResolveCurrent === "function";

  return (
    <div className="planning-survey-card planning-survey-card-active">
      <div className="planning-survey-step-header">
        <span className="planning-survey-card-step">
          {questions.length > 0
            ? `Fix ${safeQuestionIndex + 1} of ${questions.length}`
            : stepLabel}
        </span>
      </div>

      <div className="planning-intake-progress" aria-hidden="true">
        <div
          className="planning-intake-progress-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="planning-survey-question">
        <h3 className="planning-survey-question-title">
          {currentQuestion?.prompt ?? title}
        </h3>
        <p className="planning-survey-question-copy">
          {currentQuestion?.helper ?? intro}
        </p>

        {currentQuestion ? (
          <div className="planning-review-question-card">
            <ul className="planning-review-question-list">
              {visibleDetails.map((detail) => (
                <li key={`${currentQuestion.id}:${detail}`}>{detail}</li>
              ))}
            </ul>

            {hiddenDetailCount > 0 ? (
              <p className="planning-review-question-overflow">
                {hiddenDetailCount} more related gap
                {hiddenDetailCount === 1 ? "" : "s"} are grouped into this
                question.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="planning-inline-note planning-inline-note-warn">
            <span>Coverage still needs review before execution can start.</span>
          </div>
        )}

        {showOverrideForm && onChangeOverrideReason && onConfirmOverride ? (
          <div className="planning-review-override-panel">
            <label className="planning-review-override-label" htmlFor="coverage-override-reason">
              Why is it safe to move ahead?
            </label>
            <textarea
              id="coverage-override-reason"
              className="multiline textarea-sm"
              value={overrideReason ?? ""}
              onChange={(event) => onChangeOverrideReason(event.target.value)}
              placeholder={overridePlaceholder}
              rows={3}
            />
            <div className="button-row planning-intake-question-actions">
              {onToggleOverride ? (
                <button
                  type="button"
                  onClick={onToggleOverride}
                  disabled={overrideBusy}
                >
                  {cancelOverrideLabel}
                </button>
              ) : null}
              <button
                type="button"
                className="btn-primary"
                onClick={() => void onConfirmOverride()}
                disabled={overrideBusy || !canSubmitOverride}
              >
                {overrideBusy ? overrideBusyLabel : overrideConfirmLabel}
              </button>
            </div>
          </div>
        ) : null}

        <div className="button-row planning-intake-question-actions">
          {onClose ? (
            <button
              type="button"
              onClick={() => onClose()}
              disabled={completeBusy || overrideBusy || showOverrideForm}
            >
              Back
            </button>
          ) : null}
          {safeQuestionIndex > 0 ? (
            <button
              type="button"
              onClick={() => setQuestionIndex(safeQuestionIndex - 1)}
              disabled={completeBusy || overrideBusy || showOverrideForm}
            >
              Previous question
            </button>
          ) : null}

          {showOverrideAction && onToggleOverride && !showOverrideForm ? (
            <button
              type="button"
              onClick={onToggleOverride}
              disabled={completeBusy || overrideBusy}
            >
              {overrideActionLabel}
            </button>
          ) : null}

          {showResolveAction ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                if (currentQuestion) {
                  onResolveCurrent?.(currentQuestion);
                }
              }}
              disabled={completeBusy || overrideBusy || showOverrideForm}
            >
              {currentQuestionActionLabel}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              if (!atLastQuestion) {
                setQuestionIndex(safeQuestionIndex + 1);
                return;
              }

              void onComplete();
            }}
            disabled={completeBusy || overrideBusy || showOverrideForm}
          >
            {!atLastQuestion
              ? "Continue"
              : completeBusy
                ? completeBusyLabel
                : completeLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
