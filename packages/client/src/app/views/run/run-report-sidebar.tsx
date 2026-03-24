import { Link } from "react-router-dom";
import { RunReportCard } from "./run-report-card.js";
import type { RunViewModelReady } from "./use-run-view-model.js";

export const RunReportSidebar = ({
  model,
}: {
  model: RunViewModelReady;
}) => (
  <aside className="run-report-side">
    {model.criteriaTotal > 0 ? (
      <RunReportCard title="Verification score">
        <div className={`run-validation-score ${model.validationScoreToneClass}`}>
          <span className={`run-validation-score-value ${model.validationScoreValueClass}`}>
            {model.validationScore}%
          </span>
          <span className="run-validation-score-label">
            Match to ticket criteria
          </span>
        </div>
      </RunReportCard>
    ) : null}

    <RunReportCard title="Context">
      <dl className="run-context-list">
        {model.initiative ? (
          <div className="run-context-row">
            <dt>Project</dt>
            <dd>
              <Link to={`/initiative/${model.initiative.id}?step=tickets`}>{model.initiative.title}</Link>
            </dd>
          </div>
        ) : null}
        <div className="run-context-row">
          <dt>Ticket</dt>
          <dd>
            {model.detail.ticket ? (
              <Link to={`/ticket/${model.detail.ticket.id}`}>{model.detail.ticket.title}</Link>
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
          <strong>{model.reportVerdict}</strong>
        </div>
        <div>
          <span>State</span>
          <strong>{model.detail.operationState ?? model.detail.run.status}</strong>
        </div>
        <div>
          <span>Agent</span>
          <strong>{model.detail.run.agentType}</strong>
        </div>
        <div>
          <span>Type</span>
          <strong>{model.runTypeLabel}</strong>
        </div>
      </div>
    </RunReportCard>

    <RunReportCard title="Included files">
      <ul>
        {model.bundleFiles.length === 0 ? (
          <li>No bundled files were recorded for the committed attempt.</li>
        ) : (
          model.bundleFiles.map((entry) => <li key={entry}>{entry}</li>)
        )}
      </ul>
    </RunReportCard>
  </aside>
);
