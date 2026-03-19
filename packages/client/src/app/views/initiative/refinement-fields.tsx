import type { InitiativePlanningQuestion } from "../../../types.js";
import type { RefinementAnswer } from "./shared.js";

const CUSTOM_ANSWER_SENTINEL = "Other";

const OtherAnswerField = ({
  value,
  onChange
}: {
  value: string;
  onChange: (nextValue: string) => void;
}) => (
  <textarea
    className="multiline textarea-sm"
    value={value}
    placeholder="Add a custom answer"
    rows={4}
    onChange={(event) => onChange(event.target.value)}
  />
);

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
  const hasCustomValue = currentValue !== "" && !options.includes(currentValue) && currentValue !== CUSTOM_ANSWER_SENTINEL;
  const otherSelected = currentValue === CUSTOM_ANSWER_SENTINEL || hasCustomValue;

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
        onClick={() => onChange(hasCustomValue ? currentValue : CUSTOM_ANSWER_SENTINEL)}
      >
        <div className="clarification-option-header">
          <span>Other</span>
        </div>
        <p>Use a custom answer if none of these options fit.</p>
      </button>
      {otherSelected ? (
        <OtherAnswerField
          value={hasCustomValue ? currentValue : ""}
          onChange={(nextValue) => onChange(nextValue || CUSTOM_ANSWER_SENTINEL)}
        />
      ) : null}
    </div>
  );
};

export const RefinementField = ({
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
        {question.allowCustomAnswer ? (
          <>
            <button
              type="button"
              className={`clarification-option-card clarification-option-button${otherSelected ? " selected" : ""}`}
              onClick={() => onChange(typeof value === "string" && value.trim() ? value : CUSTOM_ANSWER_SENTINEL)}
            >
              <div className="clarification-option-header">
                <span>Other</span>
              </div>
              <p>Use a custom answer if yes or no does not fit.</p>
            </button>
            {otherSelected ? (
              <OtherAnswerField
                value={typeof value === "string" && value !== CUSTOM_ANSWER_SENTINEL ? value : ""}
                onChange={(nextValue) => onChange(nextValue || CUSTOM_ANSWER_SENTINEL)}
              />
            ) : null}
          </>
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
    const customValues = selected.filter((item) => !options.includes(item) && item !== CUSTOM_ANSWER_SENTINEL);
    const hasOther =
      selected.includes(CUSTOM_ANSWER_SENTINEL) || customValues.length > 0;

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
                  onChange([...selected.filter((item) => options.includes(item)), CUSTOM_ANSWER_SENTINEL]);
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
          <OtherAnswerField
            value={customValues[0] ?? ""}
            onChange={(nextValue) => {
              const baseValues = selected.filter((item) => options.includes(item));
              onChange(nextValue ? [...baseValues, nextValue] : [...baseValues, CUSTOM_ANSWER_SENTINEL]);
            }}
          />
        ) : null}
      </div>
    );
  }

  return null;
};
