import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ArtifactsSnapshot, TicketStatus } from "../../types.js";
import { statusColumns } from "../constants/status-columns.js";

interface TicketsListViewProps {
  snapshot: ArtifactsSnapshot;
  onOpenCommandPalette: () => void;
}

export const TicketsListView = ({ snapshot, onOpenCommandPalette }: TicketsListViewProps) => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">("");
  const [initiativeFilter, setInitiativeFilter] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let result = snapshot.tickets;
    if (statusFilter) {
      result = result.filter((t) => t.status === statusFilter);
    }
    if (initiativeFilter === "__none__") {
      result = result.filter((t) => !t.initiativeId);
    } else if (initiativeFilter) {
      result = result.filter((t) => t.initiativeId === initiativeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) => t.title.toLowerCase().includes(q));
    }
    return result;
  }, [snapshot.tickets, statusFilter, initiativeFilter, search]);

  const initiativeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const init of snapshot.initiatives) {
      map.set(init.id, init.title);
    }
    return map;
  }, [snapshot.initiatives]);

  const phaseMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const init of snapshot.initiatives) {
      for (const phase of init.phases) {
        map.set(phase.id, phase.name);
      }
    }
    return map;
  }, [snapshot.initiatives]);

  const hasAnyTickets = snapshot.tickets.length > 0;
  const isFiltered = statusFilter || initiativeFilter || search.trim();

  return (
    <section>
      <header className="section-header">
        <h2>All Tickets</h2>
        {hasAnyTickets && (
          <p>
            {isFiltered
              ? `${filtered.length} of ${snapshot.tickets.length} ticket${snapshot.tickets.length !== 1 ? "s" : ""}`
              : `${snapshot.tickets.length} ticket${snapshot.tickets.length !== 1 ? "s" : ""}`}
          </p>
        )}
      </header>

      <div className="button-row">
        <button type="button" className="btn-primary" onClick={() => navigate("/new-initiative")}>
          New Initiative
        </button>
        <button type="button" onClick={onOpenCommandPalette}>
          Quick Task
        </button>
      </div>

      <div className="aggregate-filters">
        <input
          type="text"
          placeholder="Search tickets"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="aggregate-search"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TicketStatus | "")}>
          <option value="">All statuses</option>
          {statusColumns.map((col) => (
            <option key={col.key} value={col.key}>{col.label}</option>
          ))}
        </select>
        <select value={initiativeFilter} onChange={(e) => setInitiativeFilter(e.target.value)}>
          <option value="">All initiatives</option>
          {snapshot.initiatives.map((init) => (
            <option key={init.id} value={init.id}>{init.title}</option>
          ))}
          <option value="__none__">Quick Tasks</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="aggregate-empty">
          <p>{hasAnyTickets ? "No tickets match the current filters" : "No tickets yet"}</p>
          {!hasAnyTickets && (
            <p className="aggregate-empty-hint">Create a ticket from an initiative or use Quick Task</p>
          )}
        </div>
      ) : (
        <div className="panel">
          <table className="aggregate-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Initiative</th>
                <th>Phase</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <Link to={`/ticket/${ticket.id}`}>
                      {ticket.title}
                    </Link>
                  </td>
                  <td>
                    <span className={`badge${ticket.status === "done" ? "" : ticket.status === "in-progress" ? " warn" : ""}`}>
                      {ticket.status}
                    </span>
                  </td>
                  <td className="aggregate-table-muted">
                    {ticket.initiativeId ? (
                      <Link to={`/initiative/${ticket.initiativeId}`} className="aggregate-table-link-muted">
                        {initiativeMap.get(ticket.initiativeId) ?? ticket.initiativeId}
                      </Link>
                    ) : (
                      "Quick Task"
                    )}
                  </td>
                  <td className="aggregate-table-muted">
                    {ticket.phaseId ? phaseMap.get(ticket.phaseId) ?? ticket.phaseId : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
