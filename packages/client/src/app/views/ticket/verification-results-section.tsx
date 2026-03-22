import { Link } from "react-router-dom";
import type { RunAttempt, TicketStatus, VerificationResult } from "../../../types.js";
import { WorkflowSection } from "../../components/workflow-section.js";
import { OverridePanel } from "./override-panel.js";

const HelpTip = ({ text }: { text: string }) => (
  <span className="help-tip" data-tip={text}>?</span>
);

const formatSeverityLabel = (value?: string): string => {
  if (!value) {
    return "";
  }

  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
};

interface VerificationResultsSectionProps {
  ticketId: string;
  runId: string | null;
  ticketStatus: TicketStatus;
  verificationResult: VerificationResult;
  attempts: RunAttempt[];
  handleReExportWithFindings: (criteriaResults: VerificationResult["criteriaResults"]) => Promise<void>;
  handleAccept: () => Promise<void>;
  acceptPending: boolean;
  onRefresh: () => Promise<void>;
  nextTicketId?: string | null;
  chrome?: "section" | "plain";
}

export const VerificationResultsSection = ({
  ticketId,
  runId,
  ticketStatus,
  verificationResult,
  attempts,
  handleReExportWithFindings,
  handleAccept,
  acceptPending,
  onRefresh,
  nextTicketId = null,
  chrome = "section"
}: VerificationResultsSectionProps) => {
  const failedCriteria = verificationResult.criteriaResults.filter((criterion) => !criterion.pass);
  const passedCriteria = verificationResult.criteriaResults.filter((criterion) => criterion.pass);
  const primaryDrift = verificationResult.driftFlags.filter((flag) => flag.type !== "widened-scope-drift");
  const widenedDrift = verificationResult.driftFlags.filter((flag) => flag.type === "widened-scope-drift");
  const runHref = runId ? `/run/${runId}` : null;
  const reviewHref = runId ? `/run/${runId}/review` : null;
  const ticketAccepted = verificationResult.overallPass && ticketStatus === "done";

  const content = (
    <>
      {verificationResult.overallPass ? (
        <>
          <div className="ticket-outcome-summary ticket-outcome-summary-pass">
            <strong>{ticketAccepted ? "Ticket marked done." : "This run matches the plan."}</strong>
            <p>
              {ticketAccepted
                ? `SpecFlow marked this ticket done after attempt ${attempts.length || 1}.`
                : "SpecFlow found no blocking issues. Accept this run to close the ticket."}
            </p>
          </div>
          <div className="button-row">
            {ticketAccepted ? (
              nextTicketId ? (
                <Link to={`/ticket/${nextTicketId}`} className="btn-primary">
                  Open next ticket
                </Link>
              ) : null
            ) : (
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleAccept()}
                disabled={acceptPending}
              >
                {acceptPending ? "Accepting..." : "Accept"}
              </button>
            )}
            {runHref ? <Link to={runHref}>View run report</Link> : null}
            {reviewHref ? <Link to={reviewHref}>Review changes</Link> : null}
          </div>
          <details className="ticket-secondary-disclosure">
            <summary>Details</summary>
            <div className="ticket-secondary-content">
              <ul className="ticket-plan-list">
                {verificationResult.criteriaResults.map((criterion) => (
                  <li key={criterion.criterionId}>
                    <span className={`severity-badge severity-${criterion.severity ?? "minor"}`}>
                      {formatSeverityLabel(criterion.severity)}
                    </span>
                    {" "}{criterion.criterionId} · {criterion.evidence}
                  </li>
                ))}
              </ul>
              <h4>Other changes in the main files</h4>
              <ul className="ticket-plan-list">
                {primaryDrift.length === 0
                  ? <li className="text-muted">None</li>
                  : primaryDrift.map((flag) => (
                    <li key={`${flag.type}-${flag.file}`}>
                      {flag.severity ? (
                        <span className={`severity-badge severity-${flag.severity}`}>{formatSeverityLabel(flag.severity)}</span>
                      ) : null}
                      {" "}{flag.type} · {flag.file} · {flag.description}
                    </li>
                  ))}
              </ul>
            </div>
          </details>
        </>
      ) : (
        <>
          <div className="ticket-outcome-summary ticket-outcome-summary-warn">
            <strong>Verification found issues.</strong>
            <p>
              SpecFlow found must-have failures or unexpected changes. Export a fix bundle and rerun the agent.
            </p>
          </div>

          <div className="button-row">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleReExportWithFindings(verificationResult.criteriaResults)}
            >
              Export fix bundle
            </button>
            {runHref ? <Link to={runHref}>View run report</Link> : null}
            {reviewHref ? <Link to={reviewHref}>Review changes</Link> : null}
          </div>

          <details className="ticket-secondary-disclosure">
            <summary>Details</summary>
            <div className="ticket-secondary-content">
              <div className="ticket-outcome-group">
                <h4>Must-haves to fix</h4>
                <ul className="ticket-plan-list">
                  {failedCriteria.map((criterion) => (
                    <li key={criterion.criterionId}>
                      <span className={`severity-badge severity-${criterion.severity ?? "minor"}`}>
                        {formatSeverityLabel(criterion.severity)}
                      </span>
                      {" "}{criterion.criterionId} · {criterion.evidence}
                      {criterion.remediationHint ? (
                        <div className="remediation-hint">{criterion.remediationHint}</div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="ticket-outcome-group">
                <h4>Other changes in the main files</h4>
                <ul className="ticket-plan-list">
                  {primaryDrift.length === 0
                    ? <li className="text-muted">None</li>
                    : primaryDrift.map((flag) => (
                      <li key={`${flag.type}-${flag.file}`}>
                        {flag.severity ? (
                          <span className={`severity-badge severity-${flag.severity}`}>{formatSeverityLabel(flag.severity)}</span>
                        ) : null}
                        {" "}{flag.type} · {flag.file} · {flag.description}
                      </li>
                    ))}
                </ul>
              </div>

              <div className="ticket-outcome-group">
                <h4>
                  Also changed outside the main files
                  <HelpTip text="Files outside the main scope are checked for unexpected changes, but they are not scored against the acceptance criteria." />
                </h4>
                <ul className="ticket-plan-list">
                  {widenedDrift.length === 0
                    ? <li className="text-muted">None</li>
                    : widenedDrift.map((flag) => <li key={`${flag.type}-${flag.file}`}>{flag.file} · {flag.description}</li>)}
                </ul>
              </div>

              {passedCriteria.length > 0 ? (
                <div className="ticket-outcome-group">
                  <h4>Passed checks</h4>
                  <ul className="ticket-plan-list">
                    {passedCriteria.map((criterion) => (
                      <li key={criterion.criterionId}>
                        <span className={`severity-badge severity-${criterion.severity ?? "minor"}`}>
                          {formatSeverityLabel(criterion.severity)}
                        </span>
                        {" "}{criterion.criterionId} · {criterion.evidence}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </details>

          <OverridePanel ticketId={ticketId} onRefresh={onRefresh} />
        </>
      )}
    </>
  );

  if (chrome === "plain") {
    return content;
  }

  return (
    <WorkflowSection
      title="Verification"
      badge={verificationResult.overallPass ? "pass" : "fail"}
      defaultOpen
    >
      {content}
    </WorkflowSection>
  );
};
