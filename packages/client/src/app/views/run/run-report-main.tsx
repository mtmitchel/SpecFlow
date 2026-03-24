import { Link } from "react-router-dom";
import { CheckpointGateBanner } from "../../components/checkpoint-gate-banner.js";
import { DiffViewer } from "../../components/diff-viewer.js";
import { MarkdownView } from "../../components/markdown-view.js";
import { formatDateTime } from "../../utils/date-format.js";
import { RunReportCard } from "./run-report-card.js";
import { formatSeverityLabel, type RunViewModelReady } from "./use-run-view-model.js";

export const RunReportMain = ({
  model,
}: {
  model: RunViewModelReady;
}) => (
  <div className="run-report-main">
    {model.detail.operationState === "abandoned" ||
    model.detail.operationState === "superseded" ||
    model.detail.operationState === "failed" ? (
      <CheckpointGateBanner
        title="Run ended early"
        body={`This run ended ${model.detail.operationState}. Start the next run from the ticket so the work stays attached to the same ticket.`}
        action={model.detail.ticket ? <Link to={`/ticket/${model.detail.ticket.id}`}>Open ticket</Link> : null}
      />
    ) : null}

    <RunReportCard title="Summary" badge={model.reportVerdict}>
      <div className="button-row">
        <Link to={`/run/${model.detail.run.id}/review`}>Review changes</Link>
      </div>

      {model.attemptLoading ? (
        <div className="status-loading-card" role="status" aria-live="polite">
          <span className="status-loading-spinner" aria-hidden="true" />
          <div className="status-loading-copy">
            <strong>Loading saved run...</strong>
            <span>Pulling together the committed summary for this attempt.</span>
          </div>
        </div>
      ) : null}
      {model.attemptError ? <p className="ticket-empty-note">{model.attemptError}</p> : null}
      <MarkdownView content={model.committedAttemptDetail?.agentSummary || "(no summary provided)"} />
    </RunReportCard>

    {model.criteriaTotal > 0 ? (
      <RunReportCard
        title="Verification details"
        badge={`${model.criteriaPassed}/${model.criteriaTotal} passed`}
      >
        <div className="run-criteria-log">
          {model.criteriaResults.map((criterion) => (
            <div key={criterion.criterionId} className="run-criteria-log-entry">
              <span className="run-criteria-log-time">{model.criteriaLogTimestamp}</span>
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

    <RunReportCard title="Changes" badge={model.committedHasPrimaryDiff ? (model.primaryDiff ? "Loaded" : "Available") : "No changes"}>
      {!model.committedHasPrimaryDiff ? (
        <p className="ticket-empty-note">No captured changes for this run.</p>
      ) : model.primaryDiff ? (
        <DiffViewer title="Changes" diff={model.primaryDiff} />
      ) : (
        <div className="button-row">
          <button type="button" onClick={() => void model.loadPrimaryDiff()} disabled={model.primaryDiffLoading}>
            {model.primaryDiffLoading ? (
              <span className="btn-loading">
                <span className="status-loading-spinner" aria-hidden="true" />
                <span className="loading-label-pulse">Loading diff...</span>
              </span>
            ) : "Show changes"}
          </button>
        </div>
      )}
      {model.diffError ? <p className="ticket-empty-note">{model.diffError}</p> : null}
    </RunReportCard>

    {model.committedHasDriftDiff ? (
      <RunReportCard title="Out-of-scope changes" badge="Drift">
        <div className="button-row">
          <button type="button" onClick={model.toggleDrift}>
            {model.showDrift ? "Hide drift" : model.driftDiffLoading ? (
              <span className="btn-loading">
                <span className="status-loading-spinner" aria-hidden="true" />
                <span className="loading-label-pulse">Loading drift diff...</span>
              </span>
            ) : "Show drift"}
          </button>
        </div>
        {model.showDrift && model.driftDiff ? <DiffViewer title="Drift diff" diff={model.driftDiff} /> : null}
        {model.showDrift && model.diffError ? <p className="ticket-empty-note">{model.diffError}</p> : null}
      </RunReportCard>
    ) : null}

    <RunReportCard
      title="Attempts"
      badge={`${model.detail.attempts.length} attempt${model.detail.attempts.length === 1 ? "" : "s"}`}
    >
      <ul className="planning-ticket-list">
        {model.detail.attempts.length === 0 ? (
          <li>
            <span>No attempts recorded.</span>
          </li>
        ) : (
          model.detail.attempts.map((attempt) => (
            <li key={attempt.id}>
              <span>
                {attempt.attemptId} · {attempt.overallPass ? "pass" : "fail"}
                {attempt.overrideReason ? ` · override: ${attempt.overrideReason}` : ""}
              </span>
              <span>{formatDateTime(attempt.createdAt)}</span>
            </li>
          ))
        )}
      </ul>
    </RunReportCard>
  </div>
);
