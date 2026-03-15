import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { saveInitiativeSpecs } from "../../api.js";
import type { ArtifactsSnapshot } from "../../types.js";
import { MarkdownView } from "../components/markdown-view.js";
import { useDirtyForm } from "../hooks/use-dirty-form.js";
import { getSpecMarkdown } from "../utils/specs.js";

type SpecType = "brief" | "prd" | "tech-spec";

const SPEC_LABELS: Record<SpecType, string> = {
  brief: "Brief",
  prd: "PRD",
  "tech-spec": "Tech Spec"
};

export const SpecView = ({
  snapshot,
  onRefresh
}: {
  snapshot: ArtifactsSnapshot;
  onRefresh: () => Promise<void>;
}) => {
  const { id, type } = useParams<{ id: string; type: string }>();
  const specType = (type as SpecType | undefined) ?? "brief";
  const initiative = snapshot.initiatives.find((item) => item.id === id);

  const currentContent = initiative ? getSpecMarkdown(snapshot.specs, initiative.id, specType as "brief" | "prd" | "tech-spec") : "";
  const [editContent, setEditContent] = useState(currentContent);
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState(false);

  const isDirty = editMode && editContent !== currentContent;

  useEffect(() => {
    setEditContent(currentContent);
  }, [id, specType, currentContent]);

  useDirtyForm(isDirty);

  if (!initiative) {
    return (
      <section>
        <h2>Initiative not found</h2>
      </section>
    );
  }

  const label = SPEC_LABELS[specType] ?? specType;

  const handleSave = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const briefContent = specType === "brief" ? editContent : getSpecMarkdown(snapshot.specs, initiative.id, "brief");
      const prdContent = specType === "prd" ? editContent : getSpecMarkdown(snapshot.specs, initiative.id, "prd");
      const techContent = specType === "tech-spec" ? editContent : getSpecMarkdown(snapshot.specs, initiative.id, "tech-spec");
      await saveInitiativeSpecs(initiative.id, {
        briefMarkdown: briefContent,
        prdMarkdown: prdContent,
        techSpecMarkdown: techContent
      });
      await onRefresh();
      setEditMode(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <header className="section-header">
        <h2>{initiative.title} -- {label}</h2>
        <p>{initiative.description}</p>
      </header>

      <div className="panel">
        <div className="button-row">
          <button type="button" onClick={() => setEditMode((current) => !current)}>
            {editMode ? "View" : "Edit"}
          </button>
          {editMode ? (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void handleSave()}>
              Save
            </button>
          ) : null}
          {isDirty ? (
            <span style={{ color: "var(--warning)", fontSize: "0.82rem", alignSelf: "center" }}>Unsaved changes</span>
          ) : null}
        </div>

        {editMode ? (
          <textarea
            className="multiline"
            value={editContent}
            onChange={(event) => setEditContent(event.target.value)}
            style={{ minHeight: 480 }}
          />
        ) : (
          <MarkdownView content={currentContent || "(empty)"} />
        )}
      </div>
    </section>
  );
};
