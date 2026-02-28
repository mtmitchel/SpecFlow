import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRuns } from "../../api";
import type { RunListItem, Ticket } from "../../types";

export const RunsPage = ({ tickets }: { tickets: Ticket[] }): JSX.Element => {
  const [rows, setRows] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [ticketFilter, setTicketFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState<"all" | "claude-code" | "codex-cli" | "opencode" | "generic">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "complete">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      setLoading(true);
      try {
        const list = await fetchRuns({
          ticketId: ticketFilter === "all" ? undefined : ticketFilter,
          agent: agentFilter === "all" ? undefined : agentFilter,
          status: statusFilter === "all" ? undefined : statusFilter,
          dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
          dateTo: dateTo ? new Date(dateTo).toISOString() : undefined
        });

        if (!cancelled) {
          setRows(list);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [agentFilter, dateFrom, dateTo, statusFilter, ticketFilter]);

  const grouped = useMemo(() => {
    const groups = new Map<string, RunListItem[]>();

    for (const row of rows) {
      const key = row.ticket?.id ?? "unlinked";
      const current = groups.get(key) ?? [];
      current.push(row);
      groups.set(key, current);
    }

    return Array.from(groups.entries()).sort((left, right) => {
      const leftLabel = left[0] === "unlinked" ? "zzz" : left[1][0]?.ticket?.title ?? left[0];
      const rightLabel = right[0] === "unlinked" ? "zzz" : right[1][0]?.ticket?.title ?? right[0];
      return leftLabel.localeCompare(rightLabel);
    });
  }, [rows]);

  return (
    <section>
      <header className="section-header">
        <h2>Runs</h2>
        <p>Grouped by ticket with attempt history and operation-state guidance.</p>
      </header>

      <div className="panel">
        <div className="button-row">
          <select value={ticketFilter} onChange={(event) => setTicketFilter(event.target.value)}>
            <option value="all">All tickets</option>
            {tickets.map((ticket) => (
              <option key={ticket.id} value={ticket.id}>
                {ticket.title}
              </option>
            ))}
          </select>

          <select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value as typeof agentFilter)}>
            <option value="all">All agents</option>
            <option value="claude-code">Claude Code</option>
            <option value="codex-cli">Codex CLI</option>
            <option value="opencode">OpenCode</option>
            <option value="generic">Generic</option>
          </select>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="complete">Complete</option>
          </select>

          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>

        {loading ? <p>Loading runs...</p> : null}
        {!loading && grouped.length === 0 ? <p>No runs match the selected filters.</p> : null}

        {!loading
          ? grouped.map(([ticketId, items]) => (
              <div key={ticketId} className="panel" style={{ marginTop: "0.8rem" }}>
                <h3>{ticketId === "unlinked" ? "Unlinked runs" : items[0]?.ticket?.title ?? ticketId}</h3>
                <ul>
                  {items.map((item) => (
                    <li key={item.run.id}>
                      <div className="button-row">
                        <Link to={`/runs/${item.run.id}`}>
                          {item.run.id} · {item.run.agentType} · {item.run.status} ·{" "}
                          {new Date(item.run.lastCommittedAt ?? item.run.createdAt).toLocaleString()}
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setExpanded((current) => ({
                              ...current,
                              [item.run.id]: !current[item.run.id]
                            }));
                          }}
                        >
                          {expanded[item.run.id] ? "Hide attempts" : "Show attempts"}
                        </button>
                      </div>

                      {item.operationState === "abandoned" ||
                      item.operationState === "superseded" ||
                      item.operationState === "failed" ? (
                        <div className="status-banner warn">
                          Operation {item.operationState}. Retry from{" "}
                          {item.ticket ? <Link to={`/tickets/${item.ticket.id}`}>ticket actions</Link> : "the linked ticket"}.
                          {item.ticket ? (
                            <span>
                              {" "}
                              <Link to={`/tickets/${item.ticket.id}`}>Retry Now</Link>
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {expanded[item.run.id] ? (
                        <ul>
                          {item.attempts.length === 0 ? (
                            <li>No attempts yet.</li>
                          ) : (
                            item.attempts.map((attempt) => (
                              <li key={`${item.run.id}:${attempt.attemptId}`}>
                                {attempt.attemptId} · {attempt.overallPass ? "pass" : "fail"} ·{" "}
                                {new Date(attempt.createdAt).toLocaleString()}
                              </li>
                            ))
                          )}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          : null}
      </div>
    </section>
  );
};
