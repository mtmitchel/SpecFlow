import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createInitiative } from "../../api/initiatives.js";
import { useToast } from "../context/toast.js";
import { Pipeline } from "../components/pipeline.js";
import {
  PIPELINE_NODE_LABELS,
  PIPELINE_NODE_ORDER,
  type PipelineNodeKey,
  type PipelineNodeModel,
} from "../utils/initiative-progress.js";

const ENTRY_PIPELINE: PipelineNodeModel[] = PIPELINE_NODE_ORDER.map((key) => ({
  key,
  label: PIPELINE_NODE_LABELS[key],
  zone: (["execute", "verify", "done"] as PipelineNodeKey[]).includes(key)
    ? "execution"
    : "planning",
  state: "future",
}));

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
      navigate(`/initiative/${result.initiativeId}?step=brief`);
    } catch (err) {
      showError((err as Error).message ?? "We couldn't start the project.");
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
            <span>New project</span>
          </div>
        </div>
        <div className="planning-topbar-pipeline">
          <Pipeline nodes={entryNodes} selectedKey={description.trim().length > 0 ? "brief" : null} />
        </div>
      </div>

      <div className="planning-entry-column">
        <div className="planning-entry-card">
          <h3>What are you planning?</h3>
          <p className="text-muted-sm" style={{ margin: "0 0 0.75rem" }}>
            Start with the outcome, who it is for, and any limits that matter.
          </p>
          <textarea
            className="multiline"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            autoFocus
          />
          <div className="planning-entry-card-footer">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleCreate()}
              disabled={busy || description.trim().length === 0}
            >
              {busy ? "Starting..." : "Start brief intake"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
