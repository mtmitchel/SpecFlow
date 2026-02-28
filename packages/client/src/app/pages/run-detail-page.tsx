import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchRunDetail } from "../../api";
import type { RunDetail } from "../../types";
import { DiffViewer } from "../components/diff-viewer";
import { MarkdownView } from "../components/markdown-view";
import { AuditPanel } from "./audit-panel";

export const RunDetailPage = (): JSX.Element => {
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
