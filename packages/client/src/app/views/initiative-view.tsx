import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { generateInitiativePlan, saveInitiativeSpecs, updateInitiativePhases } from "../../api.js";
import type { ArtifactsSnapshot } from "../../types.js";
import { MarkdownView } from "../components/markdown-view.js";
import { MermaidView } from "../components/mermaid-view.js";
import { useDirtyForm } from "../hooks/use-dirty-form.js";
import { getSpecMarkdown } from "../utils/specs.js";

const PhaseNameEditor = ({
  name,
  onCommit
}: {
  name: string;
  onCommit: (nextName: string) => void;
}) => {
  const [localName, setLocalName] = useState(name);

  useEffect(() => {
    setLocalName(name);
  }, [name]);

  return (
    <input
      className="phase-name-input"
      value={localName}
      onChange={(event) => setLocalName(event.target.value)}
      onBlur={() => {
        if (localName !== name) {
          onCommit(localName);
        }
      }}
    />
  );
};

export const InitiativeView = ({
  snapshot,
  onRefresh
}: {
  snapshot: ArtifactsSnapshot;
  onRefresh: () => Promise<void>;
}) => {
  const params = useParams<{ id: string }>();
  const initiative = snapshot.initiatives.find((item) => item.id === params.id);
  const [activeTab, setActiveTab] = useState<"brief" | "prd" | "tech" | "tickets" | "diagram">("brief");
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState(false);

  const [brief, setBrief] = useState(initiative ? getSpecMarkdown(snapshot.specs, initiative.id, "brief") : "");
  const [prd, setPrd] = useState(initiative ? getSpecMarkdown(snapshot.specs, initiative.id, "prd") : "");
  const [tech, setTech] = useState(initiative ? getSpecMarkdown(snapshot.specs, initiative.id, "tech-spec") : "");

  // Canonical (saved) versions for dirty tracking
  const savedBrief = initiative ? getSpecMarkdown(snapshot.specs, initiative.id, "brief") : "";
  const savedPrd = initiative ? getSpecMarkdown(snapshot.specs, initiative.id, "prd") : "";
  const savedTech = initiative ? getSpecMarkdown(snapshot.specs, initiative.id, "tech-spec") : "";

  const isDirty = editMode && (brief !== savedBrief || prd !== savedPrd || tech !== savedTech);

  useEffect(() => {
    if (!initiative) {
      return;
    }

    setBrief(getSpecMarkdown(snapshot.specs, initiative.id, "brief"));
    setPrd(getSpecMarkdown(snapshot.specs, initiative.id, "prd"));
    setTech(getSpecMarkdown(snapshot.specs, initiative.id, "tech-spec"));
  }, [initiative?.id, snapshot.specs]);

  useDirtyForm(isDirty);

  if (!initiative) {
    return (
      <section>
        <h2>Initiative not found</h2>
      </section>
    );
  }

  const initiativeTickets = snapshot.tickets.filter((ticket) => ticket.initiativeId === initiative.id);
  const linkedRuns = snapshot.runs.filter((run) => run.ticketId && initiativeTickets.some((ticket) => ticket.id === run.ticketId));

  return (
    <section>
      <header className="section-header">
        <h2>{initiative.title}</h2>
        <p>{initiative.description}</p>
      </header>

      <div className="tab-row" role="tablist">
        <button type="button" role="tab" aria-selected={activeTab === "brief"} className={activeTab === "brief" ? "tab active" : "tab"} onClick={() => setActiveTab("brief")}>
          Brief
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "prd"} className={activeTab === "prd" ? "tab active" : "tab"} onClick={() => setActiveTab("prd")}>
          PRD
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "tech"} className={activeTab === "tech" ? "tab active" : "tab"} onClick={() => setActiveTab("tech")}>
          Tech Spec
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "tickets"} className={activeTab === "tickets" ? "tab active" : "tab"} onClick={() => setActiveTab("tickets")}>
          Tickets
        </button>
        {initiative.mermaidDiagram ? (
          <button type="button" role="tab" aria-selected={activeTab === "diagram"} className={activeTab === "diagram" ? "tab active" : "tab"} onClick={() => setActiveTab("diagram")}>
            Diagram
          </button>
        ) : null}
      </div>

      {activeTab === "diagram" && initiative.mermaidDiagram ? (
        <div className="panel">
          <MermaidView chart={initiative.mermaidDiagram} />
        </div>
      ) : activeTab === "brief" || activeTab === "prd" || activeTab === "tech" ? (
        <div className="panel">
          <div className="button-row">
            <button type="button" onClick={() => setEditMode((current) => !current)}>
              {editMode ? "View" : "Edit"}
            </button>
            {editMode ? (
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await saveInitiativeSpecs(initiative.id, {
                      briefMarkdown: brief,
                      prdMarkdown: prd,
                      techSpecMarkdown: tech
                    });
                    await onRefresh();
                    setEditMode(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save Spec
              </button>
            ) : null}
            {isDirty ? (
              <span style={{ color: "var(--warning)", fontSize: "0.82rem", alignSelf: "center" }}>Unsaved changes</span>
            ) : null}
          </div>

          {activeTab === "brief" ? (
            editMode ? (
              <textarea className="multiline" value={brief} onChange={(event) => setBrief(event.target.value)} />
            ) : (
              <MarkdownView content={brief || "(empty)"} />
            )
          ) : null}
          {activeTab === "prd" ? (
            editMode ? (
              <textarea className="multiline" value={prd} onChange={(event) => setPrd(event.target.value)} />
            ) : (
              <MarkdownView content={prd || "(empty)"} />
            )
          ) : null}
          {activeTab === "tech" ? (
            editMode ? (
              <textarea className="multiline" value={tech} onChange={(event) => setTech(event.target.value)} />
            ) : (
              <MarkdownView content={tech || "(empty)"} />
            )
          ) : null}
        </div>
      ) : (
        <div className="panel">
          <div className="button-row">
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await generateInitiativePlan(initiative.id);
                  await onRefresh();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Generate Plan
            </button>
          </div>

          <h3>Phase grouped tickets</h3>
          {initiative.phases.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No phases generated. Click "Generate Plan" to create a phased ticket breakdown.</p>
          ) : null}
          {initiative.phases
            .slice()
            .sort((left, right) => left.order - right.order)
            .map((phase) => {
              const phaseTickets = initiativeTickets.filter((ticket) => ticket.phaseId === phase.id);

              return (
                <div key={phase.id} className="phase-block">
                  <PhaseNameEditor
                    name={phase.name}
                    onCommit={(nextName) => {
                      const nextPhases = initiative.phases.map((item) =>
                        item.id === phase.id ? { ...item, name: nextName } : item
                      );
                      void updateInitiativePhases(initiative.id, nextPhases).then(onRefresh);
                    }}
                  />
                  <ul>
                    {phaseTickets.map((ticket) => (
                      <li key={ticket.id}>
                        <Link to={`/ticket/${ticket.id}`}>{ticket.title}</Link> · {ticket.status}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

          <h3>Run history</h3>
          <ul>
            {linkedRuns.length === 0
              ? <li style={{ color: "var(--muted)" }}>No runs linked yet</li>
              : linkedRuns.map((run) => <li key={run.id}>{run.id} · {run.status}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
};
