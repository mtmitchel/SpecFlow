import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createInitiative } from "../../api/initiatives.js";
import { useToast } from "../context/toast.js";
import { Pipeline } from "../components/pipeline.js";
import type { PipelineNodeModel } from "../utils/initiative-progress.js";

const ENTRY_PIPELINE: PipelineNodeModel[] = [
  { key: "brief", label: "Brief", zone: "planning", state: "future" },
  { key: "core-flows", label: "Core flows", zone: "planning", state: "future" },
  { key: "prd", label: "PRD", zone: "planning", state: "future" },
  { key: "tech-spec", label: "Tech spec", zone: "planning", state: "future" },
  { key: "tickets", label: "Tickets", zone: "planning", state: "future" },
  { key: "execute", label: "Execute", zone: "execution", state: "future" },
  { key: "verify", label: "Verify", zone: "execution", state: "future" },
  { key: "done", label: "Done", zone: "execution", state: "future" },
];

export const InitiativeCreator = ({ onRefresh }: { onRefresh: () => Promise<void> }) => {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const entryNodes = useMemo<PipelineNodeModel[]>(
    () =>
      ENTRY_PIPELINE.map((node) =>
        node.key === "brief" && description.trim().length > 0
          ? { ...node, state: "active" }
          : node
      ),
    [description]
  );

  const handleCreate = async () => {
    if (!description.trim() || busy) {
      return;
    }

    setBusy(true);
    try {
      const result = await createInitiative(description.trim());
      await onRefresh();
      navigate(`/initiative/${result.initiativeId}?step=brief&handoff=created`);
    } catch (err) {
      showError((err as Error).message ?? "Failed to create initiative");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="planning-shell planning-entry-shell">
      <div className="planning-topbar">
        <div className="planning-topbar-row">
          <div className="planning-breadcrumb">
            <Link to="/">Home</Link>
            <span>/</span>
            <span>New initiative</span>
          </div>
        </div>
        <div className="planning-topbar-pipeline">
          <Pipeline nodes={entryNodes} selectedKey={description.trim().length > 0 ? "brief" : null} />
        </div>
      </div>

      <div className="planning-entry-column">
        <div className="planning-entry-card">
          <h3>What do you want to build?</h3>
          <textarea
            className="multiline"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What are you building? Who is it for? Any hard limits?"
            style={{ minHeight: 140 }}
            autoFocus
          />
          <div className="planning-entry-card-footer">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleCreate()}
              disabled={busy || description.trim().length === 0}
            >
              {busy ? "Creating..." : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
