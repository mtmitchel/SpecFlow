import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  captureResults,
  capturePreview,
  createTicketFromAuditFinding,
  createInitiative,
  dismissAuditFinding,
  exportBundle,
  exportFixBundle,
  fetchArtifacts,
  fetchOperationStatus,
  fetchRunDetail,
  fetchRuns,
  fetchRunState,
  generateInitiativePlan,
  generateInitiativeSpecs,
  overrideDone,
  runAudit,
  saveConfig,
  saveInitiativeSpecs,
  triageQuickTask,
  updateInitiativePhases,
  updateTicketStatus
} from "./api";
import type {
  ArtifactsSnapshot,
  AuditReport,
  Config,
  Initiative,
  InitiativePhase,
  RunDetail,
  RunListItem,
  Run,
  RunAttempt,
  SpecDocument,
  Ticket,
  TicketStatus
} from "./types";

const statusColumns: Array<{ key: TicketStatus; label: string }> = [
  { key: "backlog", label: "Backlog" },
  { key: "ready", label: "Ready" },
  { key: "in-progress", label: "In Progress" },
  { key: "verify", label: "Verify" },
  { key: "done", label: "Done" }
];

const canTransition = (from: TicketStatus, to: TicketStatus): boolean => {
  const transitions: Record<TicketStatus, TicketStatus[]> = {
    backlog: ["ready"],
    ready: ["backlog", "in-progress"],
    "in-progress": ["ready", "verify"],
    verify: ["in-progress", "done"],
    done: ["verify"]
  };

  return transitions[from].includes(to);
};

const useSseReconnect = (url: string, onReconnect: () => Promise<void> | void): void => {
  const reconnectAttempt = useRef(0);

  useEffect(() => {
    let isMounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let eventSource: EventSource | null = null;

    const connect = (): void => {
      if (!isMounted) {
        return;
      }

      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        reconnectAttempt.current = 0;
      };

      eventSource.onerror = () => {
        eventSource?.close();
        const backoff = Math.min(1000 * 2 ** reconnectAttempt.current, 10_000);
        reconnectAttempt.current += 1;

        timer = setTimeout(() => {
          void Promise.resolve(onReconnect()).finally(() => {
            connect();
          });
        }, backoff);
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (timer) {
        clearTimeout(timer);
      }
      eventSource?.close();
    };
  }, [onReconnect, url]);
};

const findPhaseWarning = (
  ticket: Ticket,
  initiatives: Initiative[],
  tickets: Ticket[]
): { hasWarning: boolean; message: string } => {
  if (!ticket.initiativeId || !ticket.phaseId) {
    return { hasWarning: false, message: "" };
  }

  const initiative = initiatives.find((item) => item.id === ticket.initiativeId);
  if (!initiative) {
    return { hasWarning: false, message: "" };
  }

  const currentPhase = initiative.phases.find((phase) => phase.id === ticket.phaseId);
  if (!currentPhase) {
    return { hasWarning: false, message: "" };
  }

  const predecessorPhases = initiative.phases.filter((phase) => phase.order < currentPhase.order);
  for (const predecessor of predecessorPhases) {
    const predecessorTickets = tickets.filter(
      (item) => item.initiativeId === initiative.id && item.phaseId === predecessor.id
    );

    if (predecessorTickets.some((item) => item.status !== "done")) {
      return {
        hasWarning: true,
        message: `Phase warning: ${currentPhase.name} started before ${predecessor.name} completed.`
      };
    }
  }

  return { hasWarning: false, message: "" };
};

const getSpecMarkdown = (
  specs: SpecDocument[],
  initiativeId: string,
  type: "brief" | "prd" | "tech-spec"
): string => specs.find((spec) => spec.initiativeId === initiativeId && spec.type === type)?.content ?? "";

const MarkdownView = ({ content }: { content: string }): JSX.Element => {
  const lines = content.split("\n");

  return (
    <div className="markdown-view">
      {lines.map((line, index) => {
        if (line.startsWith("### ")) {
          return <h4 key={`md-${index}`}>{line.slice(4)}</h4>;
        }

        if (line.startsWith("## ")) {
          return <h3 key={`md-${index}`}>{line.slice(3)}</h3>;
        }

        if (line.startsWith("# ")) {
          return <h2 key={`md-${index}`}>{line.slice(2)}</h2>;
        }

        if (line.startsWith("- ")) {
          return <div key={`md-${index}`} className="md-li">• {line.slice(2)}</div>;
        }

        if (!line.trim()) {
          return <div key={`md-${index}`} className="md-gap" />;
        }

        return <p key={`md-${index}`}>{line}</p>;
      })}
    </div>
  );
};

const AppShell = ({ children }: { children: ReactNode }): JSX.Element => {
  const navigate = useNavigate();
  const location = useLocation();
  const navItems = [
    { to: "/initiatives", label: "Initiatives" },
    { to: "/tickets", label: "Tickets" },
    { to: "/specs", label: "Specs/Docs" },
    { to: "/runs", label: "Runs" },
    { to: "/settings", label: "Settings" }
  ];
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickDescription, setQuickDescription] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickResult, setQuickResult] = useState<
    | {
        decision: "ok";
        reason: string;
        ticketId: string;
        ticketTitle: string;
        acceptanceCriteria: Array<{ id: string; text: string }>;
        implementationPlan: string;
        fileTargets: string[];
      }
    | { decision: "too-large"; reason: string; initiativeId: string; initiativeTitle: string }
    | null
  >(null);

  useEffect(() => {
    setQuickOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SF</div>
          <div>
            <h1>SpecFlow</h1>
            <p>Board Control</p>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          className="quick-task-button"
          onClick={() => {
            setQuickOpen(true);
            setQuickResult(null);
            setQuickDescription("");
          }}
        >
          + Quick Task
        </button>
      </aside>
      <main className="main-content">{children}</main>

      {quickOpen ? (
        <section className="quick-task-panel">
          <div className="panel">
            <div className="button-row">
              <h3>Quick Build</h3>
              <button
                type="button"
                onClick={() => {
                  setQuickOpen(false);
                  setQuickResult(null);
                }}
              >
                Dismiss
              </button>
            </div>

            <p>Describe the task. Planner triage will route to a ready ticket or Groundwork.</p>
            <textarea
              className="multiline"
              value={quickDescription}
              onChange={(event) => setQuickDescription(event.target.value)}
              placeholder="Implement dark-mode toggle with persisted preference and tests"
            />
            <div className="button-row">
              <button
                type="button"
                disabled={quickBusy || quickDescription.trim().length === 0}
                onClick={async () => {
                  setQuickBusy(true);
                  try {
                    const result = await triageQuickTask(quickDescription);
                    setQuickResult(result);

                    if (result.decision === "too-large") {
                      navigate(`/initiatives/${result.initiativeId}`);
                    }
                  } finally {
                    setQuickBusy(false);
                  }
                }}
              >
                Submit
              </button>
            </div>

            {quickBusy ? <p>Planner triaging task...</p> : null}

            {quickResult?.decision === "ok" ? (
              <div className="status-banner">
                <div>Created ready ticket: <strong>{quickResult.ticketTitle}</strong></div>
                <div>{quickResult.reason}</div>
                <div>Criteria: {quickResult.acceptanceCriteria.length} · File targets: {quickResult.fileTargets.length}</div>
                <Link to={`/tickets/${quickResult.ticketId}`}>View Ticket</Link>
              </div>
            ) : null}

            {quickResult?.decision === "too-large" ? (
              <div className="status-banner warn">
                This looks like a larger initiative. Opening in Groundwork...
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
};

const InitiativesPage = ({
  initiatives,
  onRefresh
}: {
  initiatives: Initiative[];
  onRefresh: () => Promise<void>;
}): JSX.Element => {
  const navigate = useNavigate();
  const [showComposer, setShowComposer] = useState(false);
  const [description, setDescription] = useState("");
  const [initiativeId, setInitiativeId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Array<{ id: string; label: string; type: string; options?: string[] }>>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  return (
    <section>
      <header className="section-header">
        <h2>Initiatives</h2>
        <p>Groundwork turns raw intent into specs and a ticketed delivery plan.</p>
      </header>

      <button type="button" className="inline-action" onClick={() => setShowComposer((current) => !current)}>
        New Initiative
      </button>

      {showComposer ? (
        <div className="panel">
          <h3>Describe what you want to build</h3>
          <textarea
            className="multiline"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe initiative goals, users, and constraints"
          />
          <div className="button-row">
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await createInitiative(description);
                  setInitiativeId(result.initiativeId);
                  setQuestions(result.questions);
                  setAnswers({});
                  await onRefresh();
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy || description.trim().length === 0}
            >
              Analyze
            </button>
            {initiativeId ? (
              <button
                type="button"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await generateInitiativeSpecs(initiativeId, answers);
                    await onRefresh();
                    navigate(`/initiatives/${initiativeId}`);
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >
                Generate Specs
              </button>
            ) : null}
          </div>

          {questions.length > 0 ? (
            <div className="qa-grid">
              {questions.map((question) => (
                <label key={question.id}>
                  {question.label}
                  <input
                    value={answers[question.id] ?? ""}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="panel">
        {initiatives.length === 0 ? (
          <p>No initiatives yet.</p>
        ) : (
          <ul>
            {initiatives.map((initiative) => (
              <li key={initiative.id}>
                <Link to={`/initiatives/${initiative.id}`}>
                  <strong>{initiative.title}</strong>
                </Link>{" "}
                · {initiative.status} · {initiative.ticketIds.length} tickets
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

const InitiativeDetailPage = ({
  snapshot,
  onRefresh
}: {
  snapshot: ArtifactsSnapshot;
  onRefresh: () => Promise<void>;
}): JSX.Element => {
  const params = useParams<{ id: string }>();
  const initiative = snapshot.initiatives.find((item) => item.id === params.id);
  const [activeTab, setActiveTab] = useState<"brief" | "prd" | "tech" | "tickets">("brief");
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState(false);

  const [brief, setBrief] = useState(initiative ? getSpecMarkdown(snapshot.specs, initiative.id, "brief") : "");
  const [prd, setPrd] = useState(initiative ? getSpecMarkdown(snapshot.specs, initiative.id, "prd") : "");
  const [tech, setTech] = useState(initiative ? getSpecMarkdown(snapshot.specs, initiative.id, "tech-spec") : "");

  useEffect(() => {
    if (!initiative) {
      return;
    }

    setBrief(getSpecMarkdown(snapshot.specs, initiative.id, "brief"));
    setPrd(getSpecMarkdown(snapshot.specs, initiative.id, "prd"));
    setTech(getSpecMarkdown(snapshot.specs, initiative.id, "tech-spec"));
  }, [initiative?.id, snapshot.specs]);

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

      <div className="tab-row">
        <button type="button" className={activeTab === "brief" ? "tab active" : "tab"} onClick={() => setActiveTab("brief")}>
          Brief
        </button>
        <button type="button" className={activeTab === "prd" ? "tab active" : "tab"} onClick={() => setActiveTab("prd")}>
          PRD
        </button>
        <button type="button" className={activeTab === "tech" ? "tab active" : "tab"} onClick={() => setActiveTab("tech")}>
          Tech Spec
        </button>
        <button type="button" className={activeTab === "tickets" ? "tab active" : "tab"} onClick={() => setActiveTab("tickets")}>
          Tickets
        </button>
      </div>

      {activeTab === "brief" || activeTab === "prd" || activeTab === "tech" ? (
        <div className="panel">
          <div className="button-row">
            <button type="button" onClick={() => setEditMode((current) => !current)}>
              {editMode ? "View" : "Edit"}
            </button>
            {editMode ? (
              <button
                type="button"
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
          </div>

          {activeTab === "brief" ? (
            editMode ? <textarea className="multiline" value={brief} onChange={(event) => setBrief(event.target.value)} /> : <MarkdownView content={brief || "(empty)"} />
          ) : null}
          {activeTab === "prd" ? (
            editMode ? <textarea className="multiline" value={prd} onChange={(event) => setPrd(event.target.value)} /> : <MarkdownView content={prd || "(empty)"} />
          ) : null}
          {activeTab === "tech" ? (
            editMode ? <textarea className="multiline" value={tech} onChange={(event) => setTech(event.target.value)} /> : <MarkdownView content={tech || "(empty)"} />
          ) : null}
        </div>
      ) : (
        <div className="panel">
          <div className="button-row">
            <button
              type="button"
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
          {initiative.phases.length === 0 ? <p>No phases yet.</p> : null}
          {initiative.phases
            .slice()
            .sort((left, right) => left.order - right.order)
            .map((phase) => {
              const phaseTickets = initiativeTickets.filter((ticket) => ticket.phaseId === phase.id);

              return (
                <div key={phase.id} className="phase-block">
                  <input
                    className="phase-name-input"
                    value={phase.name}
                    onChange={(event) => {
                      const nextPhases = initiative.phases.map((item) =>
                        item.id === phase.id ? { ...item, name: event.target.value } : item
                      );
                      void updateInitiativePhases(initiative.id, nextPhases).then(onRefresh);
                    }}
                  />
                  <ul>
                    {phaseTickets.map((ticket) => (
                      <li key={ticket.id}>
                        <Link to={`/tickets/${ticket.id}`}>{ticket.title}</Link> · {ticket.status}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

          <h3>Run history</h3>
          <ul>
            {linkedRuns.length === 0 ? <li>No runs linked yet.</li> : linkedRuns.map((run) => <li key={run.id}>{run.id} · {run.status}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
};

const TicketsPage = ({
  tickets,
  initiatives,
  onMoveTicket
}: {
  tickets: Ticket[];
  initiatives: Initiative[];
  onMoveTicket: (ticketId: string, status: TicketStatus) => Promise<void>;
}): JSX.Element => {
  const [initiativeFilter, setInitiativeFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredTickets = tickets.filter((ticket) => {
    if (initiativeFilter !== "all" && ticket.initiativeId !== initiativeFilter) {
      return false;
    }
    if (phaseFilter !== "all" && ticket.phaseId !== phaseFilter) {
      return false;
    }
    if (statusFilter !== "all" && ticket.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const phases = useMemo(() => {
    const allPhases: InitiativePhase[] = [];
    for (const initiative of initiatives) {
      allPhases.push(...initiative.phases);
    }

    return allPhases;
  }, [initiatives]);

  return (
    <section>
      <header className="section-header">
        <h2>Ticket Board</h2>
        <p>Drag cards through the lifecycle with state-guarded transitions.</p>
      </header>
      <div className="filters">
        <select value={initiativeFilter} onChange={(event) => setInitiativeFilter(event.target.value)}>
          <option value="all">All initiatives</option>
          {initiatives.map((initiative) => (
            <option key={initiative.id} value={initiative.id}>
              {initiative.title}
            </option>
          ))}
        </select>
        <select value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value)}>
          <option value="all">All phases</option>
          {phases.map((phase) => (
            <option key={phase.id} value={phase.id}>
              {phase.name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          {statusColumns.map((column) => (
            <option key={column.key} value={column.key}>
              {column.label}
            </option>
          ))}
        </select>
      </div>
      <div className="kanban-grid">
        {statusColumns.map((column) => (
          <div
            key={column.key}
            className="kanban-column"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const ticketId = event.dataTransfer.getData("text/ticket-id");
              const ticket = filteredTickets.find((item) => item.id === ticketId);
              if (!ticket || !canTransition(ticket.status, column.key)) {
                return;
              }

              void onMoveTicket(ticket.id, column.key);
            }}
          >
            <h3>{column.label}</h3>
            <div className="ticket-stack">
              {filteredTickets
                .filter((ticket) => ticket.status === column.key)
                .map((ticket) => {
                  const initiative = initiatives.find((item) => item.id === ticket.initiativeId);
                  const phaseWarning = findPhaseWarning(ticket, initiatives, tickets);

                  return (
                    <Link
                      key={ticket.id}
                      to={`/tickets/${ticket.id}`}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/ticket-id", ticket.id);
                      }}
                      className="ticket-card"
                    >
                      <strong>{ticket.title}</strong>
                      {initiative ? <span className="badge">{initiative.title}</span> : <span className="badge">Quick Task</span>}
                      {phaseWarning.hasWarning ? <span className="badge warn">Phase warning</span> : null}
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

const TicketDetailPage = ({
  tickets,
  runs,
  runAttempts,
  initiatives,
  onRefresh
}: {
  tickets: Ticket[];
  runs: Run[];
  runAttempts: RunAttempt[];
  initiatives: Initiative[];
  onRefresh: () => Promise<void>;
}): JSX.Element => {
  const params = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<"plan" | "runs">("plan");
  const [operationState, setOperationState] = useState<string | null>(null);
  const [agentTarget, setAgentTarget] = useState<"claude-code" | "codex-cli" | "opencode" | "generic">("codex-cli");
  const [exportResult, setExportResult] = useState<{
    runId: string;
    attemptId: string;
    flatString: string;
    bundlePath: string;
  } | null>(null);
  const [captureSummary, setCaptureSummary] = useState("");
  const [captureScopeInput, setCaptureScopeInput] = useState("");
  const [widenedInput, setWidenedInput] = useState("");
  const [capturePreviewData, setCapturePreviewData] = useState<{
    source: "git" | "snapshot";
    defaultScope: string[];
    changedPaths: string[];
    primaryDiff: string;
    driftDiff: string | null;
  } | null>(null);
  const [selectedNoGitPaths, setSelectedNoGitPaths] = useState<string[]>([]);
  const [verifyStreamEvents, setVerifyStreamEvents] = useState<string[]>([]);
  const [verificationResult, setVerificationResult] = useState<{
    overallPass: boolean;
    criteriaResults: Array<{ criterionId: string; pass: boolean; evidence: string }>;
    driftFlags: Array<{ type: string; file: string; description: string }>;
  } | null>(null);
  const [verifyState, setVerifyState] = useState<"idle" | "running" | "reconnecting">("idle");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideStepTwo, setOverrideStepTwo] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [showAuditPanel, setShowAuditPanel] = useState(false);

  const ticket = tickets.find((item) => item.id === params.id);
  const run = runs.find((item) => item.id === ticket?.runId);
  const attempts = runAttempts.filter((attempt) => run?.attempts.includes(attempt.attemptId));
  const parseScopeCsv = (value: string): string[] =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const syncVerificationFromRunState = (attemptData: Array<{
    attemptId: string;
    overallPass: boolean;
    criteriaResults: Array<{ criterionId: string; pass: boolean; evidence: string }>;
    driftFlags: Array<{ type: string; file: string; description: string }>;
  }>): void => {
    const latest = attemptData
      .slice()
      .sort((left, right) => left.attemptId.localeCompare(right.attemptId))
      .at(-1);

    if (!latest) {
      return;
    }

    setVerificationResult({
      overallPass: latest.overallPass,
      criteriaResults: latest.criteriaResults,
      driftFlags: latest.driftFlags
    });
  };

  useSseReconnect(`/api/tickets/${params.id ?? "none"}/verify/stream`, async () => {
    setVerifyState("reconnecting");
    if (run?.id) {
      const snapshot = await fetchRunState(run.id).catch(() => undefined);
      if (snapshot) {
        syncVerificationFromRunState(snapshot.attempts);
      }
    }

    await onRefresh();
    setVerifyState("idle");
  });

  useEffect(() => {
    const ticketId = params.id;
    if (!ticketId) {
      return;
    }

    const source = new EventSource(`/api/tickets/${ticketId}/verify/stream`);
    source.addEventListener("verify-token", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { chunk?: string };
        if (payload.chunk) {
          setVerifyStreamEvents((current) => [...current, payload.chunk].slice(-200));
        }
      } catch {
        // ignore invalid event payloads
      }
    });
    source.addEventListener("verify-complete", () => {
      if (!run?.id) {
        return;
      }

      void fetchRunState(run.id).then((snapshot) => {
        syncVerificationFromRunState(snapshot.attempts);
      });
    });

    return () => {
      source.close();
    };
  }, [params.id, run?.id]);

  useEffect(() => {
    if (!ticket) {
      return;
    }

    setCaptureScopeInput(ticket.fileTargets.join(", "));
  }, [ticket?.id]);

  const refreshCapturePreview = async (): Promise<void> => {
    if (!ticket) {
      return;
    }

    const preview = await capturePreview(ticket.id, {
      scopePaths: parseScopeCsv(captureScopeInput),
      widenedScopePaths: parseScopeCsv(widenedInput),
      diffSource: { mode: "auto" }
    });

    setCapturePreviewData(preview);

    if (!captureScopeInput.trim() && preview.defaultScope.length > 0) {
      setCaptureScopeInput(preview.defaultScope.join(", "));
    }
  };

  useEffect(() => {
    if (!run?.activeOperationId) {
      setOperationState(null);
      return;
    }

    void fetchOperationStatus(run.activeOperationId).then((status) => {
      setOperationState(status?.state ?? null);
    });
  }, [run?.activeOperationId]);

  useEffect(() => {
    if (!ticket?.id || !run?.id) {
      return;
    }

    void refreshCapturePreview();
  }, [ticket?.id, run?.id]);

  useEffect(() => {
    if (!ticket?.id || !run?.id) {
      return;
    }

    const timer = setTimeout(() => {
      void refreshCapturePreview();
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [captureScopeInput, widenedInput, ticket?.id, run?.id]);

  if (!ticket) {
    return (
      <section>
        <h2>Ticket not found</h2>
      </section>
    );
  }

  const phaseWarning = findPhaseWarning(ticket, initiatives, tickets);
  const primaryDrift = verificationResult?.driftFlags.filter((flag) => flag.type !== "widened-scope-drift") ?? [];
  const widenedDrift = verificationResult?.driftFlags.filter((flag) => flag.type === "widened-scope-drift") ?? [];

  return (
    <section>
      <header className="section-header">
        <h2>{ticket.title}</h2>
        <p>{ticket.description}</p>
        {run ? (
          <div className="button-row">
            <Link to={`/runs/${run.id}`}>Open Run</Link>
            <button type="button" onClick={() => setShowAuditPanel((current) => !current)}>
              {showAuditPanel ? "Hide Audit" : "Run Audit"}
            </button>
          </div>
        ) : null}
      </header>

      {operationState === "abandoned" || operationState === "superseded" || operationState === "failed" ? (
        <div className="status-banner">
          Operation {operationState}. Retry from ticket actions.
          <span>
            {" "}
            <button type="button" onClick={() => setActiveTab("plan")}>
              Go to Retry Controls
            </button>
          </span>
        </div>
      ) : null}

      {phaseWarning.hasWarning ? <div className="status-banner warn">{phaseWarning.message}</div> : null}
      {verifyState === "reconnecting" ? (
        <div className="status-banner warn">Reconnecting to verification stream and refreshing run snapshot...</div>
      ) : null}

      {showAuditPanel && run ? <AuditPanel runId={run.id} defaultScopePaths={ticket.fileTargets} /> : null}

      <div className="tab-row">
        <button type="button" className={activeTab === "plan" ? "tab active" : "tab"} onClick={() => setActiveTab("plan")}>
          Plan
        </button>
        <button type="button" className={activeTab === "runs" ? "tab active" : "tab"} onClick={() => setActiveTab("runs")}>
          Runs
        </button>
      </div>

      {activeTab === "plan" ? (
        <div className="panel">
          <h3>Acceptance Criteria</h3>
          <ul>
            {ticket.acceptanceCriteria.map((criterion) => (
              <li key={criterion.id}>{criterion.text}</li>
            ))}
          </ul>
          <h3>Implementation Plan</h3>
          <pre>{ticket.implementationPlan || "(not provided)"}</pre>
          <h3>File Targets</h3>
          <ul>
            {ticket.fileTargets.length === 0 ? <li>(none)</li> : ticket.fileTargets.map((target) => <li key={target}>{target}</li>)}
          </ul>

          <h3>Export Bundle</h3>
          <div className="button-row">
            <select value={agentTarget} onChange={(event) => setAgentTarget(event.target.value as typeof agentTarget)}>
              <option value="claude-code">Claude Code</option>
              <option value="codex-cli">Codex CLI</option>
              <option value="opencode">OpenCode</option>
              <option value="generic">Generic</option>
            </select>
            <button
              type="button"
              onClick={async () => {
                const exported = await exportBundle(ticket.id, agentTarget);
                if (downloadUrl) {
                  URL.revokeObjectURL(downloadUrl);
                }

                const blob = new Blob([exported.flatString], { type: "text/plain" });
                const nextUrl = URL.createObjectURL(blob);
                setDownloadUrl(nextUrl);
                setExportResult({
                  runId: exported.runId,
                  attemptId: exported.attemptId,
                  flatString: exported.flatString,
                  bundlePath: exported.bundlePath
                });
                await onRefresh();
              }}
            >
              Export
            </button>
            {exportResult ? (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(exportResult.flatString);
                }}
              >
                Copy
              </button>
            ) : null}
            {downloadUrl ? (
              <a href={downloadUrl} download={`${ticket.id}-bundle-flat.md`} className="inline-action">
                Download flat bundle
              </a>
            ) : null}
            {exportResult ? (
              <a
                href={`/api/runs/${exportResult.runId}/attempts/${exportResult.attemptId}/bundle.zip`}
                className="inline-action"
              >
                Download bundle zip
              </a>
            ) : null}
          </div>
          {exportResult ? <pre>{exportResult.flatString}</pre> : null}

          <h3>Capture Results</h3>
          <p>Preview current changes, then submit capture scope and widened (drift-only) scope.</p>
          <div className="button-row">
            <button type="button" onClick={() => void refreshCapturePreview()}>
              Refresh diff preview
            </button>
            {capturePreviewData ? <span>Source: {capturePreviewData.source}</span> : null}
          </div>
          {capturePreviewData ? (
            <>
              <h4>Primary scope</h4>
              <input
                className="phase-name-input"
                value={captureScopeInput}
                onChange={(event) => setCaptureScopeInput(event.target.value)}
                placeholder="src/a.ts, src/b.ts"
              />
              <h4>Git diff preview</h4>
              <pre>{capturePreviewData.primaryDiff || "(no changes in selected scope)"}</pre>
            </>
          ) : null}
          {capturePreviewData?.source === "snapshot" ? (
            <div className="panel">
              <h4>No-git scope picker</h4>
              <input
                type="file"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  const paths = files.map((file) => file.webkitRelativePath || file.name);
                  setSelectedNoGitPaths(Array.from(new Set(paths)));
                }}
              />
              <input
                type="file"
                multiple
                {...({ webkitdirectory: "true", directory: "true" } as Record<string, string>)}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  const paths = files.map((file) => file.webkitRelativePath || file.name);
                  setSelectedNoGitPaths(Array.from(new Set(paths)));
                }}
              />
              <ul>
                {selectedNoGitPaths.length === 0
                  ? <li>No paths selected.</li>
                  : selectedNoGitPaths.map((entry) => <li key={entry}>{entry}</li>)}
              </ul>
            </div>
          ) : null}
          <textarea
            className="multiline"
            value={captureSummary}
            onChange={(event) => setCaptureSummary(event.target.value)}
            placeholder="Optional agent summary"
          />
          <input
            className="phase-name-input"
            value={widenedInput}
            onChange={(event) => setWidenedInput(event.target.value)}
            placeholder="widened/scope/path.ts, another/path.ts"
          />
          <div className="status-banner warn">Widened scope is treated as drift-only context.</div>
          <div className="button-row">
            <button
              type="button"
              onClick={async () => {
                setVerifyState("running");
                setVerifyStreamEvents([]);
                try {
                  const widenedScopePaths = parseScopeCsv(widenedInput);
                  const scopePaths =
                    capturePreviewData?.source === "snapshot" && selectedNoGitPaths.length > 0
                      ? selectedNoGitPaths
                      : parseScopeCsv(captureScopeInput);

                  const result = await captureResults(ticket.id, captureSummary, scopePaths, widenedScopePaths);
                  setVerificationResult(result);
                  await onRefresh();
                } finally {
                  setVerifyState("idle");
                }
              }}
            >
              Submit Results
            </button>
            {verifyState === "running" ? <span>Verification running...</span> : null}
          </div>
          {verifyStreamEvents.length > 0 ? <pre>{verifyStreamEvents.join("")}</pre> : null}

          <h3>Verification</h3>
          {verificationResult ? (
            <>
              <p>Overall: {verificationResult.overallPass ? "pass" : "fail"}</p>
              <ul>
                {verificationResult.criteriaResults.map((criterion) => (
                  <li key={criterion.criterionId}>
                    {criterion.criterionId} · {criterion.pass ? "pass" : "fail"} · {criterion.evidence}
                  </li>
                ))}
              </ul>

              <h4>Primary drift flags</h4>
              <ul>
                {primaryDrift.length === 0 ? <li>None</li> : primaryDrift.map((flag) => <li key={`${flag.type}-${flag.file}`}>{flag.type} · {flag.file} · {flag.description}</li>)}
              </ul>

              <h4>Widened-scope drift warnings</h4>
              <ul>
                {widenedDrift.length === 0 ? <li>None</li> : widenedDrift.map((flag) => <li key={`${flag.type}-${flag.file}`}>{flag.file} · {flag.description}</li>)}
              </ul>

              {!verificationResult.overallPass ? (
                <div className="button-row">
                  <button
                    type="button"
                    onClick={async () => {
                      const exported = await exportBundle(ticket.id, agentTarget);
                      const failureContext = verificationResult.criteriaResults
                        .filter((criterion) => !criterion.pass)
                        .map((criterion) => `- ${criterion.criterionId}: ${criterion.evidence}`)
                        .join("\n");

                      const enrichedFlat =
                        failureContext.length > 0
                          ? `# Verification Failure Context\n${failureContext}\n\n${exported.flatString}`
                          : exported.flatString;
                      if (downloadUrl) {
                        URL.revokeObjectURL(downloadUrl);
                      }
                      const nextUrl = URL.createObjectURL(new Blob([enrichedFlat], { type: "text/plain" }));
                      setDownloadUrl(nextUrl);

                      setExportResult({
                        runId: exported.runId,
                        attemptId: exported.attemptId,
                        flatString: enrichedFlat,
                        bundlePath: exported.bundlePath
                      });
                      await onRefresh();
                    }}
                  >
                    Re-export with findings
                  </button>
                </div>
              ) : null}

              <h4>Override to Done</h4>
              <textarea
                className="multiline"
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                placeholder="Required reason for override"
              />
              {!overrideStepTwo ? (
                <button
                  type="button"
                  onClick={() => {
                    if (overrideReason.trim().length === 0) {
                      return;
                    }
                    setOverrideStepTwo(true);
                  }}
                >
                  Override
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    await overrideDone(ticket.id, overrideReason, true);
                    setOverrideStepTwo(false);
                    setOverrideReason("");
                    await onRefresh();
                  }}
                >
                  I accept risk
                </button>
              )}
            </>
          ) : (
            <p>No verification run captured yet.</p>
          )}
        </div>
      ) : (
        <div className="panel">
          <h3>Run Attempts</h3>
          {attempts.length === 0 ? (
            <p>No attempts yet.</p>
          ) : (
            <ul>
              {attempts.map((attempt) => (
                  <li key={attempt.id}>
                  {attempt.attemptId} · {attempt.overallPass ? "pass" : "fail"} · {new Date(attempt.createdAt).toLocaleString()}
                  {attempt.overrideReason ? ` · override: ${attempt.overrideReason}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};

const RunsPage = ({ tickets }: { tickets: Ticket[] }): JSX.Element => {
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

const findDiffRowsForFinding = (diff: string, file: string, line: number | null): Set<number> => {
  if (!file || line === null) {
    return new Set<number>();
  }

  const rows = new Set<number>();
  const lines = diff.split("\n");
  let currentFile: string | null = null;
  let currentLine = 0;

  for (const [index, row] of lines.entries()) {
    if (row.startsWith("+++ b/")) {
      currentFile = row.slice(6).trim();
      continue;
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
    if (hunk) {
      currentLine = Number.parseInt(hunk[1], 10);
      continue;
    }

    if (row.startsWith("+") && !row.startsWith("+++")) {
      if (currentFile === file && currentLine === line) {
        rows.add(index + 1);
      }
      currentLine += 1;
      continue;
    }

    if (!row.startsWith("-")) {
      currentLine += 1;
    }
  }

  return rows;
};

const DiffViewer = ({
  title,
  diff,
  highlightedRows
}: {
  title: string;
  diff: string;
  highlightedRows?: Set<number>;
}): JSX.Element => (
  <div className="panel">
    <h4>{title}</h4>
    <div className="diff-viewer">
      {diff.split("\n").map((line, index) => (
        <div
          key={`${title}-${index}`}
          className={highlightedRows?.has(index + 1) ? "diff-row highlight" : "diff-row"}
        >
          <span className="diff-line-number">{index + 1}</span>
          <code>{line || " "}</code>
        </div>
      ))}
    </div>
  </div>
);

const AuditPanel = ({
  runId,
  defaultScopePaths
}: {
  runId: string;
  defaultScopePaths: string[];
}): JSX.Element => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"branch" | "commit-range" | "snapshot">("branch");
  const [branch, setBranch] = useState("main");
  const [fromCommit, setFromCommit] = useState("");
  const [toCommit, setToCommit] = useState("");
  const [scopeInput, setScopeInput] = useState("");
  const [scopeTouched, setScopeTouched] = useState(false);
  const [widenedInput, setWidenedInput] = useState("");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [dismissNote, setDismissNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportAgent, setExportAgent] = useState<"claude-code" | "codex-cli" | "opencode" | "generic">("codex-cli");
  const [exportFlat, setExportFlat] = useState<string | null>(null);

  useEffect(() => {
    setScopeInput("");
    setScopeTouched(false);
  }, [defaultScopePaths.join(",")]);

  const selectedFinding = report?.findings.find((item) => item.id === selectedFindingId) ?? null;
  const highlightedRows = selectedFinding && report
    ? findDiffRowsForFinding(report.primaryDiff, selectedFinding.file, selectedFinding.line)
    : new Set<number>();

  const executeAudit = async (): Promise<void> => {
    setBusy(true);
    try {
      const diffSource =
        mode === "branch"
          ? { mode: "branch" as const, branch }
          : mode === "commit-range"
            ? { mode: "commit-range" as const, from: fromCommit, to: toCommit }
            : { mode: "snapshot" as const };

      const payload = await runAudit(runId, {
        diffSource,
        scopePaths: scopeInput
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
        widenedScopePaths: widenedInput
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      });

      setReport(payload);
      if (!scopeTouched && payload.defaultScope.length > 0) {
        setScopeInput(payload.defaultScope.join(", "));
      }
      setSelectedFindingId(payload.findings[0]?.id ?? null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void executeAudit();
  }, [runId]);

  return (
    <div className="panel">
      <h3>Drift Audit</h3>
      <div className="button-row">
        <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
          <option value="branch">Git Branch</option>
          <option value="commit-range">Commit Range</option>
          <option value="snapshot">File Snapshot</option>
        </select>
        {mode === "branch" ? (
          <input value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="branch name" />
        ) : null}
        {mode === "commit-range" ? (
          <>
            <input value={fromCommit} onChange={(event) => setFromCommit(event.target.value)} placeholder="from commit" />
            <input value={toCommit} onChange={(event) => setToCommit(event.target.value)} placeholder="to commit" />
          </>
        ) : null}
      </div>

      <input
        className="phase-name-input"
        value={scopeInput}
        onChange={(event) => {
          setScopeInput(event.target.value);
          setScopeTouched(true);
        }}
        placeholder={
          defaultScopePaths.length > 0
            ? `Primary scope (default: ${defaultScopePaths.join(", ")})`
            : "Primary scope paths (comma separated)"
        }
      />
      <input
        className="phase-name-input"
        value={widenedInput}
        onChange={(event) => setWidenedInput(event.target.value)}
        placeholder="Widened scope paths (comma separated)"
      />

      <div className="button-row">
        <button type="button" onClick={() => void executeAudit()} disabled={busy}>
          {busy ? "Running..." : "Run Audit"}
        </button>
      </div>

      {!report ? <p>No audit report yet.</p> : null}
      {report ? (
        <div className="audit-layout">
          <div>
            <h4>Findings</h4>
            <ul>
              {report.findings.map((finding) => (
                <li key={finding.id}>
                  <div className="button-row">
                    <span className={finding.severity === "error" ? "badge danger" : finding.severity === "warning" ? "badge warn" : "badge"}>
                      {finding.severity}
                    </span>
                    <span className="badge">{finding.category}</span>
                  </div>
                  <button
                    type="button"
                    className={selectedFindingId === finding.id ? "tab active" : "tab"}
                    onClick={() => setSelectedFindingId(finding.id)}
                  >
                    {finding.file}
                    {finding.line ? `:${finding.line}` : ""}
                  </button>
                  <div>{finding.description}</div>
                  {finding.dismissed ? <div className="badge warn">Dismissed: {finding.dismissNote}</div> : null}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Unified Diff</h4>
            <DiffViewer title="Audit Diff" diff={report.primaryDiff || "(empty diff)"} highlightedRows={highlightedRows} />
            {report.driftDiff ? <DiffViewer title="Drift Diff" diff={report.driftDiff} /> : null}

            {selectedFinding ? (
              <div className="panel">
                <h4>Finding Actions</h4>
                <div className="button-row">
                  <button
                    type="button"
                    onClick={async () => {
                      const ticket = await createTicketFromAuditFinding(runId, selectedFinding.id);
                      navigate(`/tickets/${ticket.id}`);
                    }}
                  >
                    Create Ticket
                  </button>
                  <select value={exportAgent} onChange={(event) => setExportAgent(event.target.value as typeof exportAgent)}>
                    <option value="claude-code">Claude Code</option>
                    <option value="codex-cli">Codex CLI</option>
                    <option value="opencode">OpenCode</option>
                    <option value="generic">Generic</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      const exported = await exportFixBundle(runId, selectedFinding.id, exportAgent);
                      setExportFlat(exported.flatString);
                      void navigator.clipboard.writeText(exported.flatString);
                    }}
                  >
                    Export Fix Bundle
                  </button>
                </div>

                <textarea
                  className="multiline"
                  value={dismissNote}
                  onChange={(event) => setDismissNote(event.target.value)}
                  placeholder="Required dismiss note"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!dismissNote.trim()) {
                      return;
                    }
                    await dismissAuditFinding(runId, selectedFinding.id, dismissNote);
                    setDismissNote("");
                    await executeAudit();
                  }}
                >
                  Dismiss
                </button>

                {exportFlat ? <pre>{exportFlat}</pre> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const RunDetailPage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDrift, setShowDrift] = useState(false);
  const [showAuditPanel, setShowAuditPanel] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const runId = params.id;

    if (!runId) {
      setError("Run id is required");
      setLoading(false);
      return;
    }

    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchRunDetail(runId);
        if (!cancelled) {
          setDetail(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError((loadError as Error).message);
          setDetail(null);
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
  }, [params.id]);

  if (loading) {
    return <section><p>Loading run detail...</p></section>;
  }

  if (error || !detail) {
    return (
      <section>
        <h2>Run not found</h2>
        <p>{error ?? "Missing run detail payload."}</p>
      </section>
    );
  }

  const verificationPass = detail.committed?.attempt?.overallPass ?? null;
  const bundleFiles = [
    ...(detail.committed?.bundleManifest?.requiredFiles ?? []),
    ...(detail.committed?.bundleManifest?.contextFiles ?? [])
  ];

  return (
    <section>
      <header className="section-header">
        <h2>{detail.run.id}</h2>
        <p>
          {detail.ticket ? <Link to={`/tickets/${detail.ticket.id}`}>{detail.ticket.title}</Link> : "No linked ticket"} ·{" "}
          {detail.run.agentType} · {detail.run.type}
        </p>
      </header>

      {detail.operationState === "abandoned" ||
      detail.operationState === "superseded" ||
      detail.operationState === "failed" ? (
        <div className="status-banner warn">
          Operation {detail.operationState}. Retry from{" "}
          {detail.ticket ? <Link to={`/tickets/${detail.ticket.id}`}>ticket actions</Link> : "the linked ticket"}.
          {detail.ticket ? (
            <span>
              {" "}
              <Link to={`/tickets/${detail.ticket.id}`}>Retry Now</Link>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="panel">
        <div className="button-row">
          <strong>Verification:</strong>{" "}
          {verificationPass === null ? "not captured" : verificationPass ? "pass" : "fail"}
          {detail.ticket ? <Link to={`/tickets/${detail.ticket.id}`}>Open Ticket Verification Panel</Link> : null}
          <button type="button" onClick={() => setShowAuditPanel((current) => !current)}>
            {showAuditPanel ? "Hide Audit" : "Run Audit"}
          </button>
        </div>

        {showAuditPanel ? <AuditPanel runId={detail.run.id} defaultScopePaths={detail.ticket?.fileTargets ?? []} /> : null}

        <h3>Context Bundle Contents</h3>
        <ul>
          {bundleFiles.length === 0 ? <li>No bundle manifest on committed attempt.</li> : bundleFiles.map((entry) => <li key={entry}>{entry}</li>)}
        </ul>

        <h3>Agent Summary</h3>
        <MarkdownView content={detail.committed?.attempt?.agentSummary || "(no summary provided)"} />

        {detail.committed?.primaryDiff ? <DiffViewer title="Primary Diff" diff={detail.committed.primaryDiff} /> : <p>No primary diff captured.</p>}

        {detail.committed?.driftDiff ? (
          <div className="panel">
            <div className="button-row">
              <strong>Drift Diff Warning</strong>
              <button type="button" onClick={() => setShowDrift((current) => !current)}>
                {showDrift ? "Hide drift diff" : "Show drift diff"}
              </button>
            </div>
            {showDrift ? <DiffViewer title="Drift Diff" diff={detail.committed.driftDiff} /> : null}
          </div>
        ) : null}

        <h3>Attempts</h3>
        <ul>
          {detail.attempts.length === 0 ? (
            <li>No attempts recorded.</li>
          ) : (
            detail.attempts.map((attempt) => (
              <li key={attempt.id}>
                {attempt.attemptId} · {attempt.overallPass ? "pass" : "fail"} · {new Date(attempt.createdAt).toLocaleString()}
                {attempt.overrideReason ? ` · override: ${attempt.overrideReason}` : ""}
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
};

const SpecsPage = ({ snapshot }: { snapshot: ArtifactsSnapshot }): JSX.Element => {
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

const SettingsPage = ({
  config,
  onSave
}: {
  config: Config | null;
  onSave: (next: Config) => Promise<void>;
}): JSX.Element => {
  const [form, setForm] = useState<Config | null>(config);

  useEffect(() => {
    setForm(config);
  }, [config]);

  if (!form) {
    return <p>Configuration not loaded.</p>;
  }

  return (
    <section>
      <header className="section-header">
        <h2>Settings</h2>
        <p>Provider and model configuration for local backend services.</p>
      </header>
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(form);
        }}
      >
        <label>
          Provider
          <select value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value as Config["provider"] })}>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </label>
        <label>
          Model
          <input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
        </label>
        <label>
          API key
          <input
            type="password"
            placeholder="Set in .env when possible"
            value={form.apiKey ?? ""}
            onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
          />
        </label>
        <label>
          Host
          <input value={form.host} readOnly />
        </label>
        <label>
          Port
          <input value={String(form.port)} readOnly />
        </label>
        <button type="submit">Save settings</button>
      </form>
    </section>
  );
};

export const App = (): JSX.Element => {
  const [snapshot, setSnapshot] = useState<ArtifactsSnapshot>({
    config: null,
    initiatives: [],
    tickets: [],
    runs: [],
    runAttempts: [],
    specs: []
  });
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  const refreshArtifacts = async (): Promise<void> => {
    const data = await fetchArtifacts();
    setSnapshot(data);
  };

  useEffect(() => {
    void refreshArtifacts().finally(() => setLoading(false));
  }, []);

  useSseReconnect("/api/planner/stream", refreshArtifacts);

  if (loading) {
    return <div className="loading">Loading SpecFlow board...</div>;
  }

  return (
    <AppShell>
      <Routes>
        <Route
          path="/initiatives"
          element={<InitiativesPage initiatives={snapshot.initiatives} onRefresh={refreshArtifacts} />}
        />
        <Route
          path="/initiatives/:id"
          element={<InitiativeDetailPage snapshot={snapshot} onRefresh={refreshArtifacts} />}
        />
        <Route
          path="/tickets"
          element={
            <TicketsPage
              tickets={snapshot.tickets}
              initiatives={snapshot.initiatives}
              onMoveTicket={async (ticketId, status) => {
                await updateTicketStatus(ticketId, status);
                await refreshArtifacts();
              }}
            />
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <TicketDetailPage
              tickets={snapshot.tickets}
              runs={snapshot.runs}
              runAttempts={snapshot.runAttempts}
              initiatives={snapshot.initiatives}
              onRefresh={refreshArtifacts}
            />
          }
        />
        <Route path="/specs" element={<SpecsPage snapshot={snapshot} />} />
        <Route path="/runs" element={<RunsPage tickets={snapshot.tickets} />} />
        <Route path="/runs/:id" element={<RunDetailPage />} />
        <Route
          path="/settings"
          element={
            <SettingsPage
              config={snapshot.config}
              onSave={async (next) => {
                await saveConfig(next);
                await refreshArtifacts();
              }}
            />
          }
        />
        <Route path="*" element={<NavigateToTickets locationPath={location.pathname} navigate={navigate} />} />
      </Routes>
    </AppShell>
  );
};

const NavigateToTickets = ({
  locationPath,
  navigate
}: {
  locationPath: string;
  navigate: (path: string) => void;
}): null => {
  useEffect(() => {
    if (locationPath === "/") {
      navigate("/tickets");
    }
  }, [locationPath, navigate]);

  return null;
};
