import type { ArtifactsSnapshot } from "../../types.js";

export const OverviewPanel = ({ snapshot }: { snapshot: ArtifactsSnapshot }) => {
  const total = snapshot.tickets.length;
  const done = snapshot.tickets.filter((t) => t.status === "done").length;
  const inProgress = snapshot.tickets.filter((t) => t.status === "in-progress").length;

  return (
    <section>
      <header className="section-header">
        <h2>SpecFlow</h2>
        <p>
          {snapshot.initiatives.length} initiative{snapshot.initiatives.length !== 1 ? "s" : ""} ·{" "}
          {total} ticket{total !== 1 ? "s" : ""} · {done} done · {inProgress} in progress
        </p>
      </header>
      <div className="panel" style={{ maxWidth: 480 }}>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: 0 }}>
          Press <kbd style={{ fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", background: "var(--surface-button)", border: "1px solid var(--panel-border)", borderRadius: "var(--radius-sm)", padding: "0.1em 0.4em" }}>Cmd K</kbd> to get started, or select an item from the navigator.
        </p>
      </div>
    </section>
  );
};
