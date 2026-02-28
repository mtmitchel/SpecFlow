import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createInitiative, generateInitiativeSpecs } from "../../api";
import type { Initiative } from "../../types";

export const InitiativesPage = ({
  initiatives,
  onRefresh
}: {
  initiatives: Initiative[];
  onRefresh: () => Promise<void>;
}): JSX.Element => {
  const navigate = useNavigate();
  const [showComposer, setShowComposer] = useState(false);
  const [description, setDescription] = useState("");
  const [initiativeId, setInitiativeId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Array<{ id: string; label: string; type: string; options?: string[] }>>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  return (
    <section>
      <header className="section-header">
        <h2>Initiatives</h2>
        <p>Groundwork turns raw intent into specs and a ticketed delivery plan.</p>
      </header>

      <button type="button" className="inline-action" onClick={() => setShowComposer((current) => !current)}>
        New Initiative
      </button>

      {showComposer ? (
        <div className="panel">
          <h3>Describe what you want to build</h3>
          <textarea
            className="multiline"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe initiative goals, users, and constraints"
          />
          <div className="button-row">
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await createInitiative(description);
                  setInitiativeId(result.initiativeId);
                  setQuestions(result.questions);
                  setAnswers({});
                  await onRefresh();
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy || description.trim().length === 0}
            >
              Analyze
            </button>
            {initiativeId ? (
              <button
                type="button"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await generateInitiativeSpecs(initiativeId, answers);
                    await onRefresh();
                    navigate(`/initiatives/${initiativeId}`);
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >
                Generate Specs
              </button>
            ) : null}
          </div>

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
          ) : null}
        </div>
      ) : null}

      <div className="panel">
        {initiatives.length === 0 ? (
          <p>No initiatives yet.</p>
        ) : (
          <ul>
            {initiatives.map((initiative) => (
              <li key={initiative.id}>
                <Link to={`/initiatives/${initiative.id}`}>
                  <strong>{initiative.title}</strong>
                </Link>{" "}
                · {initiative.status} · {initiative.ticketIds.length} tickets
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
