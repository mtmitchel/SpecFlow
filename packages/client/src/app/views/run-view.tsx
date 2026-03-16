import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchRunDetail } from "../../api.js";
import type { RunDetail } from "../../types.js";
import { DiffViewer } from "../components/diff-viewer.js";
import { MarkdownView } from "../components/markdown-view.js";
import { AuditPanel } from "../components/audit-panel.js";

export const RunView = () => {
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

  return (
    <section>
      <header className="section-header">
        <h2>{detail.run.id}</h2>
        <p>
          {detail.ticket ? <Link to={`/ticket/${detail.ticket.id}`}>{detail.ticket.title}</Link> : "No linked ticket"} ·{" "}
          {detail.run.agentType} · {detail.run.type}
        </p>
      </header>

      {detail.operationState === "abandoned" ||
      detail.operationState === "superseded" ||
      detail.operationState === "failed" ? (
        <div className="status-banner warn">
          This run ended {detail.operationState}. Start a new run from{" "}
          {detail.ticket ? <Link to={`/ticket/${detail.ticket.id}`}>ticket actions</Link> : "the linked ticket"}.
          {detail.ticket ? (
            <span>
              {" "}
              <Link to={`/ticket/${detail.ticket.id}`}>Open ticket</Link>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="panel">
        <div className="button-row">
          <strong>Verification:</strong>{" "}
          {verificationPass === null ? "Not run yet" : verificationPass ? "Passed" : "Failed"}
          {detail.ticket ? <Link to={`/ticket/${detail.ticket.id}`}>Open ticket</Link> : null}
          <button type="button" onClick={() => setShowAuditPanel((current) => !current)}>
            {showAuditPanel ? "Hide drift review" : "Review drift"}
          </button>
        </div>

        {showAuditPanel ? <AuditPanel runId={detail.run.id} defaultScopePaths={detail.ticket?.fileTargets ?? []} /> : null}

        <h3>Included files</h3>
        <ul>
          {bundleFiles.length === 0 ? <li>No bundled files were recorded for the committed attempt.</li> : bundleFiles.map((entry) => <li key={entry}>{entry}</li>)}
        </ul>

        <h3>Run summary</h3>
        <MarkdownView content={detail.committed?.attempt?.agentSummary || "(no summary provided)"} />

        {detail.committed?.primaryDiff ? <DiffViewer title="Changes" diff={detail.committed.primaryDiff} /> : <p>No captured changes for this run.</p>}

        {detail.committed?.driftDiff ? (
          <div className="panel">
            <div className="button-row">
              <strong>Out-of-scope changes</strong>
              <button type="button" onClick={() => setShowDrift((current) => !current)}>
                {showDrift ? "Hide diff" : "Show diff"}
              </button>
            </div>
            {showDrift ? <DiffViewer title="Drift diff" diff={detail.committed.driftDiff} /> : null}
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
