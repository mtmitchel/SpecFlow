import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRuns } from "../../api/runs.js";
import type { ArtifactsSnapshot, RunListItem } from "../../types.js";
import { CustomSelect } from "../components/custom-select.js";
import { useToast } from "../context/toast.js";
import { formatDateTime } from "../utils/date-format.js";

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
      showError((err as Error).message ?? "We couldn't load the runs.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, ticketFilter, showError]);

  useEffect(() => {
    setLoading(true);
    void loadRuns();
  }, [loadRuns, snapshot.runs]);

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
        <h2>Runs</h2>
        {!loading && <p>{runs.length} run{runs.length !== 1 ? "s" : ""}</p>}
      </header>

      <div className="aggregate-filters">
        <CustomSelect
          options={[{ value: "", label: "All statuses" }, { value: "pending", label: "Pending" }, { value: "complete", label: "Complete" }]}
          value={statusFilter}
          onChange={(val) => setStatusFilter(val as "pending" | "complete" | "")}
        />
        <CustomSelect
          options={[{ value: "", label: "All tickets" }, ...snapshot.tickets.map((t) => ({ value: t.id, label: t.title }))]}
          value={ticketFilter}
          onChange={setTicketFilter}
        />
      </div>

      {loading ? (
        <div className="aggregate-empty empty-state">
          <div className="status-loading-card" role="status" aria-live="polite">
            <span className="status-loading-spinner" aria-hidden="true" />
            <div className="status-loading-copy">
              <strong>Loading runs...</strong>
              <span>Pulling together the latest execution and review history.</span>
            </div>
          </div>
        </div>
      ) : runs.length === 0 ? (
        <div className="aggregate-empty empty-state">
          <p>{isFiltered ? "No runs match these filters." : "No runs yet"}</p>
          {!isFiltered && (
            <p className="aggregate-empty-hint empty-state-hint">
              Runs appear after you export a ticket and review the work.
            </p>
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
                    {formatDateTime(item.run.createdAt)}
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
