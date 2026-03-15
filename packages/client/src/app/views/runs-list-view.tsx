import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRuns } from "../../api/runs.js";
import type { ArtifactsSnapshot, RunListItem } from "../../types.js";
import { useToast } from "../context/toast.js";

interface RunsListViewProps {
  snapshot: ArtifactsSnapshot;
}

export const RunsListView = ({ snapshot }: RunsListViewProps) => {
  const { showError } = useToast();
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending" | "complete" | "">("");
  const [ticketFilter, setTicketFilter] = useState("");

  const loadRuns = useCallback(async () => {
    try {
      const filters: Record<string, string> = {};
      if (statusFilter) filters.status = statusFilter;
      if (ticketFilter) filters.ticketId = ticketFilter;
      const data = await fetchRuns(filters);
      setRuns(data);
    } catch (err) {
      showError((err as Error).message ?? "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, ticketFilter, showError]);

  useEffect(() => {
    setLoading(true);
    void loadRuns();
  }, [loadRuns]);

  const ticketMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of snapshot.tickets) {
      map.set(t.id, t.title);
    }
    return map;
  }, [snapshot.tickets]);

  const isFiltered = statusFilter || ticketFilter;

  return (
    <section>
      <header className="section-header">
        <h2>All Runs</h2>
        {!loading && <p>{runs.length} run{runs.length !== 1 ? "s" : ""}</p>}
      </header>

      <div className="aggregate-filters">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "pending" | "complete" | "")}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="complete">Complete</option>
        </select>
        <select value={ticketFilter} onChange={(e) => setTicketFilter(e.target.value)}>
          <option value="">All tickets</option>
          {snapshot.tickets.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="aggregate-empty">
          <p>Loading runs</p>

        </div>
      ) : runs.length === 0 ? (
        <div className="aggregate-empty">
          <p>{isFiltered ? "No runs match the current filters" : "No runs yet"}</p>
          {!isFiltered && (
            <p className="aggregate-empty-hint">Runs are created when you export a ticket bundle to an agent</p>
          )}
        </div>
      ) : (
        <div className="panel">
          <table className="aggregate-table">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Type</th>
                <th>Status</th>
                <th>Ticket</th>
                <th>Attempts</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((item) => (
                <tr key={item.run.id}>
                  <td>
                    <Link to={`/run/${item.run.id}`} className="aggregate-table-mono">
                      {item.run.id}
                    </Link>
                  </td>
                  <td>{item.run.type}</td>
                  <td>
                    <span className={`badge${item.run.status === "complete" ? "" : " warn"}`}>
                      {item.run.status}
                    </span>
                  </td>
                  <td className="aggregate-table-muted">
                    {item.run.ticketId ? (
                      <Link to={`/ticket/${item.run.ticketId}`} className="aggregate-table-link-muted">
                        {ticketMap.get(item.run.ticketId) ?? item.run.ticketId}
                      </Link>
                    ) : "--"}
                  </td>
                  <td className="aggregate-table-muted">{item.attempts.length}</td>
                  <td className="aggregate-table-muted">
                    {new Date(item.run.createdAt).toLocaleString()}
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
