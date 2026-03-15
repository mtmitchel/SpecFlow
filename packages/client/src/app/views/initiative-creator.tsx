import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createInitiative, generateInitiativeSpecs } from "../../api/initiatives.js";
import { useToast } from "../context/toast.js";

const StepIndicator = ({ current }: { current: "describe" | "questions" | "generating" }) => {
  const steps: Array<{ key: string; label: string }> = [
    { key: "describe", label: "Describe" },
    { key: "questions", label: "Refine" },
    { key: "generating", label: "Generate" }
  ];

  const currentIndex = steps.findIndex((s) => s.key === current);

  return (
    <div className="step-indicator">
      {steps.map((step, i) => (
        <span key={step.key} style={{ display: "contents" }}>
          {i > 0 && <span className="step-connector" />}
          <span className={`step-dot${i === currentIndex ? " active" : i < currentIndex ? " done" : ""}`}>
            {i < currentIndex ? "\u2713" : i + 1}
          </span>
          <span className={`step-label${i === currentIndex ? " active" : ""}`}>{step.label}</span>
        </span>
      ))}
    </div>
  );
};

export const InitiativeCreator = ({ onRefresh }: { onRefresh: () => Promise<void> }) => {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [description, setDescription] = useState("");
  const [initiativeId, setInitiativeId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Array<{ id: string; label: string; type: string; options?: string[] }>>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"describe" | "questions" | "generating">("describe");

  const handleAnalyze = async () => {
    if (!description.trim() || busy) return;
    setBusy(true);
    try {
      const result = await createInitiative(description.trim());
      setInitiativeId(result.initiativeId);
      setQuestions(result.questions);
      setAnswers({});
      setStep("questions");
      await onRefresh();
    } catch (err) {
      showError((err as Error).message ?? "Failed to analyze initiative");
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateSpecs = async () => {
    if (!initiativeId || busy) return;
    setBusy(true);
    setStep("generating");
    try {
      await generateInitiativeSpecs(initiativeId, answers);
      await onRefresh();
      navigate(`/initiative/${initiativeId}`);
    } catch (err) {
      showError((err as Error).message ?? "Failed to generate specs");
      setStep("questions");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <header className="section-header">
        <h2>New Initiative</h2>
        <p>Describe what you want to build. AI will generate specs and a delivery plan.</p>
      </header>

      <StepIndicator current={step} />

      {step === "describe" || step === "questions" ? (
        <div className="panel">
          {step === "describe" ? (
            <>
              <h3>Describe what you want to build</h3>
              <textarea
                className="multiline"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe initiative goals, users, and constraints"
                style={{ minHeight: 180 }}
                autoFocus
              />
              <div className="button-row">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleAnalyze()}
                  disabled={busy || description.trim().length === 0}
                >
                  {busy ? "Analyzing" : "Analyze"}
                </button>
                {busy && (
                  <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--muted)", fontSize: "0.85rem" }}>
                    <span className="verify-spinner" />
                    AI is analyzing your description
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <h3>Answer follow-up questions</h3>
              {questions.length > 0 ? (
                <div className="qa-grid">
                  {questions.map((question) => (
                    <label key={question.id}>
                      {question.label}
                      <input
                        value={answers[question.id] ?? ""}
                        onChange={(event) =>
                          setAnswers((current) => ({
                            ...current,
                            [question.id]: event.target.value
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--muted)" }}>No questions -- ready to generate.</p>
              )}
              <div className="button-row">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleGenerateSpecs()}
                  disabled={busy}
                >
                  Generate Specs
                </button>
                <button
                  type="button"
                  onClick={() => setStep("describe")}
                  disabled={busy}
                >
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="panel">
          <div className="generating-panel">
            <div className="generating-spinner" />
            <p>Generating specs and delivery plan</p>
            <p className="generating-hint">This typically takes 30-60 seconds</p>
          </div>
        </div>
      )}
    </section>
  );
};
