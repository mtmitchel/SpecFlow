import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { InitiativePlanningQuestion, InitiativeRefinementState } from "../../../types.js";
import { MarkdownView } from "../../components/markdown-view.js";
import { INITIATIVE_WORKFLOW_LABELS } from "../../utils/initiative-workflow.js";
import type { RefinementAnswer, SaveState, SpecStep } from "./shared.js";
import { isQuestionAnswered } from "./shared.js";

const QUESTION_DECISION_LABELS: Record<InitiativePlanningQuestion["decisionType"], string> = {
  scope: "Scope",
  user: "User",
  workflow: "Workflow",
  platform: "Platform",
  data: "Data",
  security: "Security",
  integration: "Integration",
  "success-metric": "Success metric",
};

const getAnswerPreview = (
  question: InitiativePlanningQuestion,
  value: RefinementAnswer,
  usingDefault: boolean,
): string | null => {
  if (usingDefault) {
    return question.assumptionIfUnanswered;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    const resolvedValues = value.map((item) => item.trim()).filter(Boolean);
    return resolvedValues.length > 0 ? resolvedValues.join(", ") : null;
  }

  return null;
};

const getFirstOpenQuestionId = (
  activeRefinement: InitiativeRefinementState,
  refinementAnswers: Record<string, string | string[] | boolean>,
  defaultAnswerQuestionIds: string[],
): string | null => {
  const firstUnresolved = activeRefinement.questions.find(
    (question) =>
      !isQuestionAnswered(refinementAnswers[question.id]) && !defaultAnswerQuestionIds.includes(question.id),
  );

  return firstUnresolved?.id ?? activeRefinement.questions[0]?.id ?? null;
};

const SelectChoiceCards = ({
  question,
  value,
  onChange
}: {
  question: InitiativePlanningQuestion;
  value: string | undefined;
  onChange: (nextValue: string) => void;
}) => {
  const options = (question.options ?? []).filter((option) => option !== "Other");
  const currentValue = value ?? "";
  const hasCustomValue = currentValue !== "" && !options.includes(currentValue) && currentValue !== "Other";
  const otherSelected = currentValue === "Other" || hasCustomValue;

  return (
    <div className="clarification-option-list">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`clarification-option-card clarification-option-button${currentValue === option ? " selected" : ""}`}
          onClick={() => onChange(option)}
        >
          <div className="clarification-option-header">
            <span>{option}</span>
            {question.recommendedOption === option ? (
              <span className="clarification-option-badge">Recommended</span>
            ) : null}
          </div>
          {question.optionHelp?.[option] ? <p>{question.optionHelp[option]}</p> : null}
        </button>
      ))}
      <button
        type="button"
        className={`clarification-option-card clarification-option-button${otherSelected ? " selected" : ""}`}
        onClick={() => onChange(hasCustomValue ? currentValue : "Other")}
      >
        <div className="clarification-option-header">
          <span>Other</span>
        </div>
        <p>Use a custom answer if none of these options fit.</p>
      </button>
      {otherSelected ? (
        <input
          value={hasCustomValue ? currentValue : ""}
          placeholder="Optional custom answer"
          onChange={(event) => onChange(event.target.value || "Other")}
        />
      ) : null}
    </div>
  );
};

const RefinementField = ({
  question,
  value,
  onChange
}: {
  question: InitiativePlanningQuestion;
  value: RefinementAnswer;
  onChange: (nextValue: string | string[] | boolean) => void;
}) => {
  if (question.type === "boolean") {
    const otherSelected = typeof value === "string";
    return (
      <div className="clarification-option-list">
        {[
          { label: "Yes", value: true, description: "Use this when the feature or constraint should be included." },
          { label: "No", value: false, description: "Use this when it should stay out of scope or off by default." }
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            className={`clarification-option-card clarification-option-button${value === option.value ? " selected" : ""}`}
            onClick={() => onChange(option.value)}
          >
            <div className="clarification-option-header">
              <span>{option.label}</span>
            </div>
            <p>{option.description}</p>
          </button>
        ))}
        <button
          type="button"
          className={`clarification-option-card clarification-option-button${otherSelected ? " selected" : ""}`}
          onClick={() => onChange(typeof value === "string" && value.trim() ? value : "Other")}
        >
          <div className="clarification-option-header">
            <span>Other</span>
          </div>
          <p>Use a custom answer if yes or no does not fit.</p>
        </button>
        {otherSelected ? (
          <input
            value={typeof value === "string" && value !== "Other" ? value : ""}
            placeholder="Optional custom answer"
            onChange={(event) => onChange(event.target.value || "Other")}
          />
        ) : null}
      </div>
    );
  }

  if (question.type === "select") {
    return (
      <SelectChoiceCards
        question={question}
        value={typeof value === "string" ? value : undefined}
        onChange={onChange}
      />
    );
  }

  if (question.type === "multi-select") {
    const selected = Array.isArray(value) ? value : [];
    const options = (question.options ?? []).filter((option) => option !== "Other");
    const customValues = selected.filter((item) => !options.includes(item) && item !== "Other");
    const hasOther = selected.includes("Other") || customValues.length > 0;

    return (
      <div className="clarification-option-list">
        {options.map((option) => (
          <label key={option} className="clarification-option-card clarification-option-checkbox">
            <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={(event) => {
                  if (event.target.checked) {
                    onChange([...selected, option]);
                  } else {
                    onChange(selected.filter((item) => item !== option));
                  }
                }}
              />
              <span>{option}</span>
            </span>
            {question.optionHelp?.[option] ? <p>{question.optionHelp[option]}</p> : null}
          </label>
        ))}
        <label className="clarification-option-card clarification-option-checkbox">
          <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={hasOther}
              onChange={(event) => {
                if (event.target.checked) {
                  onChange([...selected.filter((item) => options.includes(item)), "Other"]);
                } else {
                  onChange(selected.filter((item) => options.includes(item)));
                }
              }}
            />
            <span>Other</span>
          </span>
          <p>Use a custom answer if none of these options fit.</p>
        </label>
        {hasOther ? (
          <input
            value={customValues[0] ?? ""}
            placeholder="Optional custom answer"
            onChange={(event) => {
              const baseValues = selected.filter((item) => options.includes(item));
              onChange(event.target.value ? [...baseValues, event.target.value] : [...baseValues, "Other"]);
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <input
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Type your answer"
    />
  );
};

interface RefinementSectionProps {
  activeSpecStep: SpecStep;
  activeRefinement: InitiativeRefinementState;
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
  variant?: "full" | "compact" | "survey";
  leadingStepCount?: number;
  onBackToPreviousStep?: () => void;
  onRequestGuidance: (questionId: string) => void | Promise<void>;
  onAnswerChange: (questionId: string, nextValue: string | string[] | boolean) => void;
  onAnswerLater: (questionId: string) => void;
}

export const RefinementSection = ({
  activeSpecStep,
  activeRefinement,
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
  variant = "full",
  leadingStepCount = 0,
  onBackToPreviousStep,
  onRequestGuidance,
  onAnswerChange,
  onAnswerLater
}: RefinementSectionProps) => {
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(() =>
    getFirstOpenQuestionId(activeRefinement, refinementAnswers, defaultAnswerQuestionIds),
  );
  const compact = variant !== "full";
  const survey = variant === "survey";

  const resolvedQuestionCount = activeRefinement.questions.length - unresolvedQuestionCount;
  const completionPercent =
    activeRefinement.questions.length === 0
      ? 0
      : Math.round((resolvedQuestionCount / activeRefinement.questions.length) * 100);

  useEffect(() => {
    if (openQuestionId === null) {
      if (survey && unresolvedQuestionCount > 0) {
        setOpenQuestionId(getFirstOpenQuestionId(activeRefinement, refinementAnswers, defaultAnswerQuestionIds));
      }
      return;
    }

    const hasOpenQuestion = activeRefinement.questions.some((question) => question.id === openQuestionId);
    if (hasOpenQuestion) {
      return;
    }

    setOpenQuestionId(getFirstOpenQuestionId(activeRefinement, refinementAnswers, defaultAnswerQuestionIds));
  }, [activeRefinement, defaultAnswerQuestionIds, openQuestionId, refinementAnswers, survey, unresolvedQuestionCount]);

  const questionIds = useMemo(
    () => activeRefinement.questions.map((question) => question.id),
    [activeRefinement.questions],
  );
  const currentQuestion = survey
    ? openQuestionId === null
      ? null
      : activeRefinement.questions.find((question) => question.id === openQuestionId) ?? null
    : null;
  const currentQuestionIndex = currentQuestion ? questionIds.indexOf(currentQuestion.id) : -1;
  const previousQuestionId = currentQuestionIndex > 0 ? questionIds[currentQuestionIndex - 1] ?? null : null;
  const nextQuestionId =
    currentQuestionIndex >= 0 && currentQuestionIndex < questionIds.length - 1
      ? questionIds[currentQuestionIndex + 1] ?? null
      : null;
  const surveyStepLabel =
    currentQuestionIndex >= 0
      ? `Step ${leadingStepCount + currentQuestionIndex + 1} of ${leadingStepCount + activeRefinement.questions.length}`
      : null;

  return (
    <div className={`planning-intake-flow${compact ? " planning-intake-flow-compact" : ""}${survey ? " planning-intake-flow-survey" : ""}`}>
      {survey ? (
        <div className="planning-survey-step-header">
          {surveyStepLabel ? <span className="planning-survey-card-step">{surveyStepLabel}</span> : null}
          {saveStateIndicator}
        </div>
      ) : !compact ? (
        <div className="planning-intake-header">
          <div>
            <div className="planning-intake-title">
              {activeRefinement.questions.length} question{activeRefinement.questions.length === 1 ? "" : "s"} before the{" "}
              {INITIATIVE_WORKFLOW_LABELS[activeSpecStep].toLowerCase()}
            </div>
            <p className="planning-intake-copy">
              Answer what matters, use a default assumption when it does not, and keep the artifact grounded before generation.
            </p>
          </div>
          <div className="planning-intake-meta">
            <span>
              {resolvedQuestionCount}/{activeRefinement.questions.length} resolved
            </span>
            {saveStateIndicator}
          </div>
        </div>
      ) : null}

      <div className="planning-intake-progress" aria-hidden="true">
        <div className="planning-intake-progress-fill" style={{ width: `${completionPercent}%` }} />
      </div>

      {loadingStateLabel ? (
        <div className="planning-intake-loading" role="status" aria-live="polite">
          <span className="planning-intake-loading-dot" aria-hidden="true" />
          <div className="planning-intake-loading-copy">
            <strong>{loadingStateLabel}</strong>
            <span>Stay here. More questions may appear, or the next step will unlock.</span>
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

      {!survey ? (
        <div className="planning-intake-question-list">
          {activeRefinement.questions.map((question, index) => {
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
                    <span className="planning-intake-question-pill">{QUESTION_DECISION_LABELS[question.decisionType]}</span>
                  ) : null}
                </button>

                {open ? (
                  <div className="planning-intake-question-panel">
                    <p className="planning-intake-question-support">{question.whyThisBlocks}</p>
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

      {survey && currentQuestion ? (
        <div className="planning-survey-question">
          <h3 className="planning-survey-question-title">{currentQuestion.label}</h3>
          <p className="planning-survey-question-copy">{currentQuestion.whyThisBlocks}</p>
          <RefinementField
            question={currentQuestion}
            value={refinementAnswers[currentQuestion.id]}
            onChange={(nextValue) => onAnswerChange(currentQuestion.id, nextValue)}
          />

          <div className="button-row planning-intake-question-actions">
            <button
              type="button"
              onClick={() => {
                if (previousQuestionId) {
                  setOpenQuestionId(previousQuestionId);
                  return;
                }

                onBackToPreviousStep?.();
              }}
            >
              Back
            </button>
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
                !defaultAnswerQuestionIds.includes(currentQuestion.id) &&
                !isQuestionAnswered(refinementAnswers[currentQuestion.id])
              }
              onClick={() => {
                if (nextQuestionId) {
                  setOpenQuestionId(nextQuestionId);
                  return;
                }

                setOpenQuestionId(null);
              }}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
