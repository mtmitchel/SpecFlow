import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ArtifactsSnapshot } from "../../types";
import { MarkdownView } from "../components/markdown-view";

export const SpecsPage = ({ snapshot }: { snapshot: ArtifactsSnapshot }) => {
  const [selectedSpecId, setSelectedSpecId] = useState<string | null>(snapshot.specs[0]?.id ?? null);
  useEffect(() => {
    if (!selectedSpecId && snapshot.specs[0]?.id) {
      setSelectedSpecId(snapshot.specs[0].id);
    }
  }, [selectedSpecId, snapshot.specs]);

  const ticketsById = new Map(snapshot.tickets.map((ticket) => [ticket.id, ticket]));
  const selectedSpec = snapshot.specs.find((spec) => spec.id === selectedSpecId) ?? null;
  const linkedTickets = snapshot.tickets.filter((ticket) => ticket.initiativeId === selectedSpec?.initiativeId);
  const linkedRuns = snapshot.runs.filter((run) => run.ticketId && linkedTickets.some((ticket) => ticket.id === run.ticketId));

  return (
    <section>
      <header className="section-header">
        <h2>Specs / Docs</h2>
        <p>Rendered initiative documents with links to connected tickets.</p>
      </header>

      <div className="panel">
        {snapshot.specs.length === 0 ? (
          <p>No specs generated yet.</p>
        ) : (
          <div className="audit-layout">
            <div>
              <h3>All Specs</h3>
              <ul>
                {snapshot.specs.map((spec) => (
                  <li key={spec.id}>
                    <button
                      type="button"
                      className={selectedSpecId === spec.id ? "tab active" : "tab"}
                      onClick={() => setSelectedSpecId(spec.id)}
                    >
                      {spec.title} · {spec.type}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              {!selectedSpec ? (
                <p>Select a spec to view.</p>
              ) : (
                <>
                  <h3>{selectedSpec.title}</h3>
                  <MarkdownView content={selectedSpec.content} />
                  <div>
                    Linked tickets:{" "}
                    {linkedTickets.length === 0
                      ? "None"
                      : linkedTickets.map((ticket, index) => (
                          <span key={ticket.id}>
                            {index > 0 ? ", " : ""}
                            <Link to={`/tickets/${ticket.id}`}>{ticketsById.get(ticket.id)?.title}</Link>
                          </span>
                        ))}
                  </div>
                  <div>
                    Linked runs:{" "}
                    {linkedRuns.length === 0
                      ? "None"
                      : linkedRuns.map((run, index) => (
                          <span key={run.id}>
                            {index > 0 ? ", " : ""}
                            <Link to={`/runs/${run.id}`}>{run.id}</Link>
                          </span>
                        ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
