import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchRunAttemptDetail,
  fetchRunDetail,
  fetchRunDiff,
  fetchRunProgress
} from "../../api.js";
import type {
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
import { useToast } from "../context/toast.js";
import { usePersistInitiativeResumeTicket } from "./use-persist-initiative-resume-ticket.js";

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

const getValidationScoreToneClass = (score: number): string =>
  score >= 80 ? "score-pass-bg" : score >= 50 ? "score-partial-bg" : "score-fail-bg";

const getValidationScoreValueClass = (score: number): string =>
  score >= 80 ? "score-pass" : score >= 50 ? "score-partial" : "score-fail";

const formatLogTimestamp = (value: string): string =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const formatSeverityLabel = (
  pass: boolean,
  severity?: string,
): string => {
  const value = severity ?? (pass ? "pass" : "fail");
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
};

export const RunView = ({
  initiatives,
  tickets: _tickets,
  planningReviews: _planningReviews,
  runs: _runs,
  ticketCoverageArtifacts: _ticketCoverageArtifacts,
  onRefresh,
}: {
  initiatives: Initiative[];
  tickets: Ticket[];
  planningReviews: PlanningReviewArtifact[];
  runs: Run[];
  ticketCoverageArtifacts: TicketCoverageArtifact[];
  onRefresh: () => Promise<void>;
}) => {
  const params = useParams<{ id: string }>();
  const { showError } = useToast();
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

  const initiative = detail?.ticket?.initiativeId ? initiatives.find((item) => item.id === detail.ticket?.initiativeId) ?? null : null;
  usePersistInitiativeResumeTicket({
    initiativeId: initiative?.id ?? null,
    resumeTicketId: detail?.ticket?.initiativeId ? detail.ticket.id : null,
    currentResumeTicketId: initiative?.workflow.resumeTicketId,
    onRefresh,
    showError,
  });

  if (loading) {
    return (
      <section>
        <div className="status-loading-card" role="status" aria-live="polite">
          <span className="status-loading-spinner" aria-hidden="true" />
          <div className="status-loading-copy">
            <strong>Loading run...</strong>
            <span>Pulling together the latest summary, verification result, and included files.</span>
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

  const criteriaResults = committedAttemptDetail?.criteriaResults ?? [];
  const criteriaPassed = criteriaResults.filter((c) => c.pass).length;
  const criteriaTotal = criteriaResults.length;
  const validationScore = criteriaTotal > 0 ? Math.round((criteriaPassed / criteriaTotal) * 100) : 0;
  const validationScoreToneClass = getValidationScoreToneClass(validationScore);
  const validationScoreValueClass = getValidationScoreValueClass(validationScore);
  const criteriaLogTimestamp = formatLogTimestamp(committedAttemptDetail?.createdAt ?? detail.run.createdAt);

  const verificationPass = committedAttemptDetail?.overallPass ?? detail.committed?.attempt?.overallPass ?? null;
  const bundleFiles = [
    ...(detail.committed?.bundleManifest?.requiredFiles ?? []),
    ...(detail.committed?.bundleManifest?.contextFiles ?? [])
  ];
  const runTypeLabel = detail.run.type === "audit" ? "Audit report" : "Run report";
  const reportVerdict = verificationPass === null ? "No verdict yet" : verificationPass ? "Pass" : "Fail";
  const committedHasPrimaryDiff = Boolean(committedAttemptDetail?.primaryDiffPath);
  const committedHasDriftDiff = Boolean(committedAttemptDetail?.driftDiffPath);

  return (
    <section className="ticket-journey">
      <header className="section-header ticket-journey-header">
        <div>
          <h2>{detail.run.id}</h2>
          <p>{runTypeLabel}</p>
        </div>
        {detail.ticket ? (
          <div className="button-row" style={{ marginBottom: 0 }}>
            <Link to={`/ticket/${detail.ticket.id}`}>Open ticket</Link>
          </div>
        ) : null}
      </header>

      <div className="run-report-shell">
        <div className="run-report-main">
          {detail.operationState === "abandoned" ||
          detail.operationState === "superseded" ||
          detail.operationState === "failed" ? (
            <div className="checkpoint-gate-banner">
              <div className="checkpoint-gate-copy">
                <strong>Run ended early</strong>
                <span>
                  This run ended {detail.operationState}. Start the next run from the ticket so the work stays attached to the same ticket.
                </span>
              </div>
              {detail.ticket ? <Link to={`/ticket/${detail.ticket.id}`}>Open ticket</Link> : null}
            </div>
          ) : null}

          <RunReportCard title="Summary" badge={reportVerdict}>
            <div className="button-row">
              <button type="button" onClick={() => setShowAuditPanel((current) => !current)}>
                {showAuditPanel ? "Hide review" : "Review changes"}
              </button>
            </div>

            {showAuditPanel ? <AuditPanel runId={detail.run.id} defaultScopePaths={detail.ticket?.fileTargets ?? []} /> : null}

            {attemptLoading ? (
              <div className="status-loading-card" role="status" aria-live="polite">
                <span className="status-loading-spinner" aria-hidden="true" />
                <div className="status-loading-copy">
                  <strong>Loading saved run...</strong>
                  <span>Pulling together the committed summary for this attempt.</span>
                </div>
              </div>
            ) : null}
            {attemptError ? <p className="ticket-empty-note">{attemptError}</p> : null}
            <MarkdownView content={committedAttemptDetail?.agentSummary || "(no summary provided)"} />
          </RunReportCard>

          {criteriaTotal > 0 ? (
            <RunReportCard
              title="Verification log"
              badge={`${criteriaPassed}/${criteriaTotal} passed`}
            >
              <div className="run-criteria-log">
                {criteriaResults.map((criterion) => (
                  <div key={criterion.criterionId} className="run-criteria-log-entry">
                    <span className="run-criteria-log-time">{criteriaLogTimestamp}</span>
                    <span
                      className={`run-criteria-log-icon ${
                        criterion.pass ? "run-criteria-log-icon-pass" : "run-criteria-log-icon-fail"
                      }`}
                      aria-hidden="true"
                    >
                      {criterion.pass ? "✓" : "×"}
                    </span>
                    <span
                      className={`run-criteria-log-level ${
                        criterion.pass
                          ? "run-criteria-log-level-pass"
                          : `run-criteria-log-level-${criterion.severity ?? "fail"}`
                      }`}
                    >
                      {formatSeverityLabel(criterion.pass, criterion.severity)}
                    </span>
                    <div className="run-criteria-log-copy">
                      <strong>{criterion.criterionId}</strong>
                      <span>{criterion.evidence}</span>
                      {!criterion.pass && criterion.remediationHint ? (
                        <span className="run-criteria-log-remediation">
                          {criterion.remediationHint}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </RunReportCard>
          ) : null}

          <RunReportCard title="Changes" badge={committedHasPrimaryDiff ? (primaryDiff ? "Loaded" : "Available") : "No changes"}>
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
                  ) : "Show changes"}
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
                  {showDrift ? "Hide drift" : driftDiffLoading ? (
                    <span className="btn-loading">
                      <span className="status-loading-spinner" aria-hidden="true" />
                      <span className="loading-label-pulse">Loading drift diff...</span>
                    </span>
                  ) : "Show drift"}
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
          {criteriaTotal > 0 ? (
            <RunReportCard title="Validation score">
              <div className={`run-validation-score ${validationScoreToneClass}`}>
                <span className={`run-validation-score-value ${validationScoreValueClass}`}>
                  {validationScore}%
                </span>
                <span className="run-validation-score-label">
                  Match to ticket criteria
                </span>
              </div>
            </RunReportCard>
          ) : null}

          <RunReportCard title="Context">
            <dl className="run-context-list">
              {initiative ? (
                <div className="run-context-row">
                  <dt>Project</dt>
                  <dd>
                    <Link to={`/initiative/${initiative.id}?step=tickets`}>{initiative.title}</Link>
                  </dd>
                </div>
              ) : null}
              <div className="run-context-row">
                <dt>Ticket</dt>
                <dd>
                  {detail.ticket ? (
                    <Link to={`/ticket/${detail.ticket.id}`}>{detail.ticket.title}</Link>
                  ) : (
                    "Standalone run"
                  )}
                </dd>
              </div>
            </dl>
          </RunReportCard>

          <RunReportCard title="Details">
            <div className="run-details-grid">
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
              <div>
                <span>Type</span>
                <strong>{runTypeLabel}</strong>
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
