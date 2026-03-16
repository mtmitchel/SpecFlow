import type { ReactNode } from "react";
import type { InitiativePlanningQuestion, InitiativeRefinementState } from "../../../types.js";
import { MarkdownView } from "../../components/markdown-view.js";
import { INITIATIVE_WORKFLOW_LABELS } from "../../utils/initiative-workflow.js";
import type { RefinementAnswer, SaveState, SpecStep } from "./shared.js";
import { isQuestionAnswered } from "./shared.js";

const SelectChoiceCards = ({
  question,
  value,
  onChange
}: {
  question: InitiativePlanningQuestion;
  value: string | undefined;
  onChange: (nextValue: string) => void;
}) => {
  const options = question.options ?? [];
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
    const options = question.options ?? [];
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
  onRequestGuidance,
  onAnswerChange,
  onAnswerLater
}: RefinementSectionProps) => (
  <div className="clarification-review">
    <div className="clarification-progress">
      {activeRefinement.questions.length} question{activeRefinement.questions.length === 1 ? "" : "s"} before the{" "}
      {INITIATIVE_WORKFLOW_LABELS[activeSpecStep].toLowerCase()}
    </div>
    <div className="button-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
      {saveStateIndicator}
      {unresolvedQuestionCount > 0 ? (
        <span style={{ color: "var(--warning)", fontSize: "0.82rem" }}>
          Answer {unresolvedQuestionCount} more question{unresolvedQuestionCount === 1 ? "" : "s"} or use a default assumption.
        </span>
      ) : null}
    </div>
    {activeRefinement.questions.map((question) => {
      const usingDefault =
        defaultAnswerQuestionIds.includes(question.id) && !isQuestionAnswered(refinementAnswers[question.id]);

      return (
        <div key={question.id} className="clarification-card">
          <div>
            <div className="clarification-option-header" style={{ marginBottom: "0.35rem" }}>
              <span>{question.label}</span>
              <span className="clarification-option-badge">{question.decisionType}</span>
            </div>
            <p className="qa-label" style={{ margin: 0 }}>{question.whyThisBlocks}</p>
          </div>
          <RefinementField
            question={question}
            value={refinementAnswers[question.id]}
            onChange={(nextValue) => onAnswerChange(question.id, nextValue)}
          />
          <div className="button-row">
            <button
              type="button"
              onClick={() => void onRequestGuidance(question.id)}
              disabled={isBusy}
            >
              {busyAction === "refinement-help" && guidanceQuestionId === question.id ? "Thinking..." : "Get guidance"}
            </button>
            <button type="button" onClick={() => onAnswerLater(question.id)}>
              {usingDefault ? "Using default assumption" : "Answer later"}
            </button>
          </div>
          {guidanceQuestionId === question.id && guidanceText ? (
            <div className="clarification-guidance">
              <MarkdownView content={guidanceText} />
            </div>
          ) : null}
          {usingDefault ? (
            <div className="status-banner warn" style={{ marginBottom: 0 }}>
              Default assumption: {question.assumptionIfUnanswered}
            </div>
          ) : null}
        </div>
      );
    })}
    {refinementAssumptions.length > 0 ? (
      <div className="clarification-help-panel">
        <span className="qa-label">Current assumptions</span>
        <ul style={{ margin: 0 }}>
          {refinementAssumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </div>
    ) : null}
  </div>
);
