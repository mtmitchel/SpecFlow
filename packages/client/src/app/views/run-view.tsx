import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  fetchRunAttemptDetail,
  fetchRunDetail,
  fetchRunDiff,
  fetchRunProgress
} from "../../api.js";
import type {
  ArtifactsSnapshot,
  Initiative,
  PlanningReviewArtifact,
  Run,
  RunAttemptDetail,
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
  const [committedAttemptDetail, setCommittedAttemptDetail] = useState<RunAttemptDetail | null>(null);
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [primaryDiff, setPrimaryDiff] = useState<string | null>(null);
  const [primaryDiffLoading, setPrimaryDiffLoading] = useState(false);
  const [driftDiff, setDriftDiff] = useState<string | null>(null);
  const [driftDiffLoading, setDriftDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDrift, setShowDrift] = useState(false);
  const [showAuditPanel, setShowAuditPanel] = useState(false);
  const committedAttemptIdRef = useRef<string | null>(null);

  const loadCommittedAttempt = useCallback(async (runId: string, attemptId: string): Promise<void> => {
    setAttemptLoading(true);
    setAttemptError(null);
    setPrimaryDiff(null);
    setDriftDiff(null);
    setDiffError(null);
    setShowDrift(false);

    try {
      const attempt = await fetchRunAttemptDetail(runId, attemptId);
      setCommittedAttemptDetail(attempt);
    } catch (loadError) {
      setCommittedAttemptDetail(null);
      setAttemptError((loadError as Error).message);
    } finally {
      setAttemptLoading(false);
    }
  }, []);

  const loadDiff = useCallback(async (kind: "primary" | "drift"): Promise<void> => {
    if (!detail?.committed?.attemptId) {
      return;
    }

    if (kind === "primary" ? primaryDiffLoading : driftDiffLoading) {
      return;
    }

    if (kind === "primary") {
      setPrimaryDiffLoading(true);
    } else {
      setDriftDiffLoading(true);
    }
    setDiffError(null);

    try {
      const payload = await fetchRunDiff(detail.run.id, detail.committed.attemptId, kind);
      if (kind === "primary") {
        setPrimaryDiff(payload.diff);
      } else {
        setDriftDiff(payload.diff);
      }
    } catch (loadError) {
      setDiffError((loadError as Error).message);
    } finally {
      if (kind === "primary") {
        setPrimaryDiffLoading(false);
      } else {
        setDriftDiffLoading(false);
      }
    }
  }, [detail?.committed?.attemptId, detail?.run.id, driftDiffLoading, primaryDiffLoading]);

  useEffect(() => {
    let cancelled = false;
    const runId = params.id;
    const loadController = new AbortController();

    if (!runId) {
      setError("Run id is required");
      setLoading(false);
      return;
    }

    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      setDetail(null);
      setCommittedAttemptDetail(null);
      setAttemptError(null);
      setPrimaryDiff(null);
      setDriftDiff(null);
      setDiffError(null);
      setShowDrift(false);
      try {
        const payload = await fetchRunDetail(runId, { signal: loadController.signal });
        if (cancelled) {
          return;
        }

        setDetail(payload);
        if (payload.committed?.attemptId) {
          await loadCommittedAttempt(runId, payload.committed.attemptId);
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
      loadController.abort();
    };
  }, [loadCommittedAttempt, params.id]);

  const committedAttemptId = detail?.committed?.attemptId ?? null;

  useEffect(() => {
    committedAttemptIdRef.current = committedAttemptId;
  }, [committedAttemptId]);

  useEffect(() => {
    if (!detail?.run.id || !committedAttemptId) {
      setCommittedAttemptDetail(null);
      setAttemptError(null);
      return;
    }

    if (committedAttemptDetail?.attemptId === committedAttemptId) {
      return;
    }

    void loadCommittedAttempt(detail.run.id, committedAttemptId);
  }, [committedAttemptDetail?.attemptId, committedAttemptId, detail?.run.id, loadCommittedAttempt]);

  useEffect(() => {
    if (!detail?.run.id || detail.run.status !== "pending") {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    let activePollController: AbortController | null = null;

    const poll = async (): Promise<void> => {
      activePollController = new AbortController();
      try {
        const progress = await fetchRunProgress(detail.run.id, { signal: activePollController.signal });
        if (cancelled) {
          return;
        }

        const attempts = progress.attempts.map((attempt) => ({
          id: `${progress.run.id}:${attempt.attemptId}`,
          ...attempt
        }));

        setDetail((previous) => {
          if (!previous || previous.run.id !== progress.run.id) {
            return previous;
          }

          return {
            ...previous,
            run: progress.run,
            operationState: progress.operationState,
            attempts,
            committed: previous.committed && progress.run.committedAttemptId
              ? {
                  ...previous.committed,
                  attemptId: progress.run.committedAttemptId,
                  attempt:
                    attempts.find((attempt) => attempt.attemptId === progress.run.committedAttemptId) ?? previous.committed.attempt
                }
              : previous.committed
          };
        });

        if (progress.run.committedAttemptId !== committedAttemptIdRef.current) {
          setCommittedAttemptDetail(null);
          setPrimaryDiff(null);
          setDriftDiff(null);
          setDiffError(null);
          setShowDrift(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError((loadError as Error).message);
        }
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(() => {
            void poll();
          }, 5000);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      activePollController?.abort();
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [detail?.run.id, detail?.run.status]);

  if (loading) {
    return (
      <section>
        <div className="status-loading-card" role="status" aria-live="polite">
          <span className="status-loading-spinner" aria-hidden="true" />
          <div className="status-loading-copy">
            <strong>Loading run detail</strong>
            <span>SpecFlow is pulling together the latest execution history and verification results.</span>
          </div>
        </div>
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

  const verificationPass = committedAttemptDetail?.overallPass ?? detail.committed?.attempt?.overallPass ?? null;
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
  const committedHasPrimaryDiff = Boolean(committedAttemptDetail?.primaryDiffPath);
  const committedHasDriftDiff = Boolean(committedAttemptDetail?.driftDiffPath);

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
          <h2>{detail.run.id}</h2>
          <p>{detail.ticket ? <Link to={`/ticket/${detail.ticket.id}`}>{detail.ticket.title}</Link> : "No linked ticket"}</p>
        </div>
        {detail.ticket ? (
          <div className="button-row" style={{ marginBottom: 0 }}>
            <Link to={`/ticket/${detail.ticket.id}`}>Back to ticket</Link>
          </div>
        ) : null}
      </header>

      {initiative && progressModel ? (
        <div className="planning-pipeline-card">
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

          <RunReportCard title="Summary" badge={reportVerdict}>
            <div className="button-row">
              <button type="button" onClick={() => setShowAuditPanel((current) => !current)}>
                {showAuditPanel ? "Hide drift" : "Review drift"}
              </button>
            </div>

            {showAuditPanel ? <AuditPanel runId={detail.run.id} defaultScopePaths={detail.ticket?.fileTargets ?? []} /> : null}

            {attemptLoading ? (
              <div className="status-loading-card" role="status" aria-live="polite">
                <span className="status-loading-spinner" aria-hidden="true" />
                <div className="status-loading-copy">
                  <strong>Loading committed attempt</strong>
                  <span>SpecFlow is fetching the saved run summary for this attempt.</span>
                </div>
              </div>
            ) : null}
            {attemptError ? <p className="ticket-empty-note">{attemptError}</p> : null}
            <MarkdownView content={committedAttemptDetail?.agentSummary || "(no summary provided)"} />
          </RunReportCard>

          <RunReportCard title="Changes" badge={committedHasPrimaryDiff ? (primaryDiff ? "Loaded" : "Available") : "No diff"}>
            {!committedHasPrimaryDiff ? (
              <p className="ticket-empty-note">No captured changes for this run.</p>
            ) : primaryDiff ? (
              <DiffViewer title="Changes" diff={primaryDiff} />
            ) : (
              <div className="button-row">
                <button type="button" onClick={() => void loadDiff("primary")} disabled={primaryDiffLoading}>
                  {primaryDiffLoading ? (
                    <span className="btn-loading">
                      <span className="status-loading-spinner" aria-hidden="true" />
                      <span className="loading-label-pulse">Loading diff...</span>
                    </span>
                  ) : "Load diff"}
                </button>
              </div>
            )}
            {diffError ? <p className="ticket-empty-note">{diffError}</p> : null}
          </RunReportCard>

          {committedHasDriftDiff ? (
            <RunReportCard title="Out-of-scope changes" badge="Drift">
              <div className="button-row">
                <button
                  type="button"
                  onClick={() => {
                    if (showDrift) {
                      setShowDrift(false);
                      return;
                    }

                    setShowDrift(true);
                    if (!driftDiff) {
                      void loadDiff("drift");
                    }
                  }}
                >
                  {showDrift ? "Hide diff" : driftDiffLoading ? (
                    <span className="btn-loading">
                      <span className="status-loading-spinner" aria-hidden="true" />
                      <span className="loading-label-pulse">Loading drift diff...</span>
                    </span>
                  ) : "Show diff"}
                </button>
              </div>
              {showDrift && driftDiff ? <DiffViewer title="Drift diff" diff={driftDiff} /> : null}
              {showDrift && diffError ? <p className="ticket-empty-note">{diffError}</p> : null}
            </RunReportCard>
          ) : null}

          <RunReportCard
            title="Attempts"
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
          <RunReportCard title="Details">
            <div className="ticket-context-metrics">
              <div>
                <span>Verdict</span>
                <strong>{reportVerdict}</strong>
              </div>
              <div>
                <span>State</span>
                <strong>{detail.operationState ?? detail.run.status}</strong>
              </div>
              <div>
                <span>Agent</span>
                <strong>{detail.run.agentType}</strong>
              </div>
            </div>
            {detail.ticket ? <Link to={`/ticket/${detail.ticket.id}`}>Back to ticket</Link> : null}
          </RunReportCard>

          <RunReportCard title="Files">
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
