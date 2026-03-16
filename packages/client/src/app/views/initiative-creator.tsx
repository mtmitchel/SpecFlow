import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createInitiative } from "../../api/initiatives.js";
import { useToast } from "../context/toast.js";

export const InitiativeCreator = ({ onRefresh }: { onRefresh: () => Promise<void> }) => {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!description.trim() || busy) {
      return;
    }

    setBusy(true);
    try {
      const result = await createInitiative(description.trim());
      await onRefresh();
      navigate(`/initiative/${result.initiativeId}`);
    } catch (err) {
      showError((err as Error).message ?? "Failed to create initiative");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <header className="section-header">
        <h2>New Initiative</h2>
        <p>Describe what you want to build. SpecFlow will create a brief first, then guide the work through PRD, tech spec, and tickets.</p>
      </header>

      <div className="panel">
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
            onClick={() => void handleCreate()}
            disabled={busy || description.trim().length === 0}
          >
            {busy ? "Creating..." : "Create initiative"}
          </button>
        </div>
      </div>
    </section>
  );
};
