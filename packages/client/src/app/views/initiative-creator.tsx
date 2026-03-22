import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createInitiative } from "../../api/initiatives.js";
import { pickProjectRoot } from "../../api/transport.js";
import { useToast } from "../context/toast.js";
import { Pipeline } from "../components/pipeline.js";
import { applyInitiativeUpdate, noopApplySnapshotUpdate, type ApplySnapshotUpdate } from "../utils/snapshot-updates.js";
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

export const InitiativeCreator = ({
  onApplySnapshotUpdate = noopApplySnapshotUpdate,
  defaultBrowseRoot
}: {
  onApplySnapshotUpdate?: ApplySnapshotUpdate;
  defaultBrowseRoot: string;
}) => {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [description, setDescription] = useState("");
  const [projectRoot, setProjectRoot] = useState("");
  const [projectRootToken, setProjectRootToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickingProjectRoot, setPickingProjectRoot] = useState(false);

  const entryNodes = useMemo<PipelineNodeModel[]>(
    () =>
      ENTRY_PIPELINE.map((node) =>
        node.key === "brief" && description.trim().length > 0
          ? { ...node, state: "active" }
          : node
      ),
    [description]
  );

  const handleChooseProjectRoot = async () => {
    if (busy || pickingProjectRoot) {
      return;
    }

    setPickingProjectRoot(true);
    try {
      const selection = await pickProjectRoot(defaultBrowseRoot.trim() || undefined);
      if (selection) {
        setProjectRoot(selection.displayPath);
        setProjectRootToken(selection.token);
      }
    } catch (err) {
      showError((err as Error).message ?? "We couldn't open the folder picker.");
    } finally {
      setPickingProjectRoot(false);
    }
  };

  const handleCreate = async () => {
    if (!description.trim() || !projectRoot.trim() || busy) {
      return;
    }

    if (!projectRootToken) {
      return;
    }

    setBusy(true);
    try {
      const result = await createInitiative(description.trim(), projectRootToken);
      onApplySnapshotUpdate((current) => applyInitiativeUpdate(current, result.initiative));
      navigate(`/initiative/${result.initiative.id}?step=brief`);
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
          <div className="planning-entry-root-card">
            <div className="planning-entry-root-header">
              <div className="planning-entry-root-copy">
                <strong>Project folder</strong>
                <span className="text-muted-caption">Choose the repo or folder this project should target.</span>
              </div>
              <button
                type="button"
                className="inline-action"
                onClick={() => void handleChooseProjectRoot()}
                disabled={busy || pickingProjectRoot}
              >
                {pickingProjectRoot ? "Choosing..." : "Choose folder"}
              </button>
            </div>
            <input
              className="phase-name-input planning-entry-root-input"
              value={projectRoot}
              onChange={() => undefined}
              placeholder="Choose the project folder"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-label="Project folder"
              readOnly
            />
          </div>
          <textarea
            className="multiline"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            autoFocus
            aria-label="Project idea"
          />
          <div className="planning-entry-card-footer">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleCreate()}
              disabled={
                busy ||
                description.trim().length === 0 ||
                projectRoot.trim().length === 0 ||
                !projectRootToken
              }
            >
              {busy ? "Starting..." : "Start brief intake"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
