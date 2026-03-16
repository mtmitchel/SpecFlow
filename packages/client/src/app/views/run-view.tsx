import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchRunDetail } from "../../api.js";
import type {
  ArtifactsSnapshot,
  Initiative,
  PlanningReviewArtifact,
  Run,
  RunDetail,
  Ticket,
  TicketCoverageArtifact,
} from "../../types.js";
import { DiffViewer } from "../components/diff-viewer.js";
import { MarkdownView } from "../components/markdown-view.js";
import { AuditPanel } from "../components/audit-panel.js";
import { Pipeline } from "../components/pipeline.js";
import { getInitiativeProgressModel } from "../utils/initiative-progress.js";

const RunReportCard = ({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: ReactNode;
}) => (
  <section className="run-report-card">
    <div className="run-report-card-header">
      <h3>{title}</h3>
      {badge ? <span className="run-report-badge">{badge}</span> : null}
    </div>
    <div className="run-report-card-body">{children}</div>
  </section>
);

export const RunView = ({
  initiatives,
  tickets,
  planningReviews,
  runs,
  ticketCoverageArtifacts,
}: {
  initiatives: Initiative[];
  tickets: Ticket[];
  planningReviews: PlanningReviewArtifact[];
  runs: Run[];
  ticketCoverageArtifacts: TicketCoverageArtifact[];
}) => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
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

  useEffect(() => {
    if (!params.id || !detail || detail.run.status !== "pending") {
      return;
    }

    let cancelled = false;
    const interval = window.setInterval(() => {
      void fetchRunDetail(params.id!)
        .then((payload) => {
          if (!cancelled) {
            setDetail(payload);
            setError(null);
          }
        })
        .catch((loadError) => {
          if (!cancelled) {
            setError((loadError as Error).message);
          }
        });
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [detail, params.id]);

  if (loading) {
    return (
      <section>
        <p>Loading run detail...</p>
      </section>
    );
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
  const initiative = detail.ticket?.initiativeId ? initiatives.find((item) => item.id === detail.ticket?.initiativeId) ?? null : null;
  const progressModel = initiative
    ? getInitiativeProgressModel(
        initiative,
        {
          config: null,
          initiatives,
          tickets,
          runs,
          runAttempts: [],
          specs: [],
          planningReviews,
          ticketCoverageArtifacts,
        } as ArtifactsSnapshot
      )
    : null;
  const reportVerdict = verificationPass === null ? "No verdict yet" : verificationPass ? "Pass" : "Fail";

  return (
    <section className="ticket-journey">
      <header className="section-header ticket-journey-header">
        <div>
          {initiative ? (
            <div className="planning-breadcrumb">
              <Link to="/">Home</Link>
              <span>/</span>
              <Link to={`/initiative/${initiative.id}`}>{initiative.title}</Link>
              <span>/</span>
              {detail.ticket ? <Link to={`/ticket/${detail.ticket.id}`}>{detail.ticket.title}</Link> : null}
              <span>/</span>
              <span>{detail.run.id}</span>
            </div>
          ) : null}
          <div className="planning-shell-kicker">Run report</div>
          <h2>{detail.run.id}</h2>
          <p>
            {detail.ticket ? <Link to={`/ticket/${detail.ticket.id}`}>{detail.ticket.title}</Link> : "No linked ticket"} ·{" "}
            {detail.run.agentType} · {detail.run.type}
          </p>
        </div>
        {detail.ticket ? (
          <div className="button-row" style={{ marginBottom: 0 }}>
            <Link to={`/ticket/${detail.ticket.id}`}>Back to ticket</Link>
          </div>
        ) : null}
      </header>

      {initiative && progressModel ? (
        <div className="planning-pipeline-card">
          <div className="planning-pipeline-meta">
            <div>
              <span className="planning-stage-chip">Run report</span>
              <strong>{progressModel.statusLabel}</strong>
            </div>
            <span>{detail.run.status}</span>
          </div>
          <Pipeline
            nodes={progressModel.nodes}
            selectedKey={verificationPass === null || verificationPass === false ? "verify" : progressModel.currentKey}
            onNodeClick={(key) => {
              if (key === "execute" || key === "verify") {
                if (detail.ticket) {
                  navigate(`/ticket/${detail.ticket.id}`);
                }
                return;
              }

              if (key === "done") {
                navigate(`/initiative/${initiative.id}`);
                return;
              }

              navigate(`/initiative/${initiative.id}?step=${key}`);
            }}
          />
        </div>
      ) : null}

      <div className="run-report-shell">
        <div className="run-report-main">
          <div className="planning-phase-hero run-report-hero">
            <div className="planning-phase-hero-main">
              <div className="planning-stage-chip">Execution report</div>
              <h3>Review the evidence from this run</h3>
              <p className="planning-phase-hero-copy">
                Runs are subordinate reports. Use this surface to inspect what the agent changed, what verification concluded, and whether drift or follow-up work remains.
              </p>
            </div>
            <div className="planning-phase-hero-side">
              <span className="planning-phase-summary-label">Verdict</span>
              <p>{reportVerdict}</p>
              <span className="planning-phase-summary-label">Operation state</span>
              <p>{detail.operationState ?? detail.run.status}</p>
              {detail.ticket ? <Link to={`/ticket/${detail.ticket.id}`}>Back to ticket</Link> : null}
            </div>
          </div>

          {detail.operationState === "abandoned" ||
          detail.operationState === "superseded" ||
          detail.operationState === "failed" ? (
            <div className="checkpoint-gate-banner">
              <div className="checkpoint-gate-copy">
                <strong>Run ended early</strong>
                <span>
                  This run ended {detail.operationState}. Start the next run from the ticket so the execution history stays attached to the same work item.
                </span>
              </div>
              {detail.ticket ? <Link to={`/ticket/${detail.ticket.id}`}>Open ticket</Link> : null}
            </div>
          ) : null}

          <RunReportCard title="Report summary" badge={reportVerdict}>
            <div className="button-row">
              <button type="button" onClick={() => setShowAuditPanel((current) => !current)}>
                {showAuditPanel ? "Hide drift review" : "Review drift"}
              </button>
            </div>

            {showAuditPanel ? <AuditPanel runId={detail.run.id} defaultScopePaths={detail.ticket?.fileTargets ?? []} /> : null}

            <h4>Agent summary</h4>
            <MarkdownView content={detail.committed?.attempt?.agentSummary || "(no summary provided)"} />
          </RunReportCard>

          <RunReportCard title="Captured changes" badge={detail.committed?.primaryDiff ? "Available" : "No diff"}>
            {detail.committed?.primaryDiff ? (
              <DiffViewer title="Changes" diff={detail.committed.primaryDiff} />
            ) : (
              <p className="ticket-empty-note">No captured changes for this run.</p>
            )}
          </RunReportCard>

          {detail.committed?.driftDiff ? (
            <RunReportCard title="Out-of-scope changes" badge="Drift">
              <div className="button-row">
                <button type="button" onClick={() => setShowDrift((current) => !current)}>
                  {showDrift ? "Hide diff" : "Show diff"}
                </button>
              </div>
              {showDrift ? <DiffViewer title="Drift diff" diff={detail.committed.driftDiff} /> : null}
            </RunReportCard>
          ) : null}

          <RunReportCard
            title="Attempt history"
            badge={`${detail.attempts.length} attempt${detail.attempts.length === 1 ? "" : "s"}`}
          >
            <ul className="planning-ticket-list">
              {detail.attempts.length === 0 ? (
                <li>
                  <span>No attempts recorded.</span>
                </li>
              ) : (
                detail.attempts.map((attempt) => (
                  <li key={attempt.id}>
                    <span>
                      {attempt.attemptId} · {attempt.overallPass ? "pass" : "fail"}
                      {attempt.overrideReason ? ` · override: ${attempt.overrideReason}` : ""}
                    </span>
                    <span>{new Date(attempt.createdAt).toLocaleString()}</span>
                  </li>
                ))
              )}
            </ul>
          </RunReportCard>
        </div>

        <aside className="run-report-side">
          <RunReportCard title="Report facts">
            <div className="ticket-context-metrics">
              <div>
                <span>Attempts</span>
                <strong>{detail.attempts.length}</strong>
              </div>
              <div>
                <span>Files</span>
                <strong>{bundleFiles.length}</strong>
              </div>
              <div>
                <span>Agent</span>
                <strong>{detail.run.agentType}</strong>
              </div>
            </div>
          </RunReportCard>

          <RunReportCard title="Included files">
            <ul>
              {bundleFiles.length === 0 ? (
                <li>No bundled files were recorded for the committed attempt.</li>
              ) : (
                bundleFiles.map((entry) => <li key={entry}>{entry}</li>)
              )}
            </ul>
          </RunReportCard>
        </aside>
      </div>
    </section>
  );
};
