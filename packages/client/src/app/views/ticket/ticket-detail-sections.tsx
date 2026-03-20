import type { ReactNode } from "react";
import type { Ticket, TicketStatus } from "../../../types.js";
import { INITIATIVE_WORKFLOW_LABELS } from "../../utils/initiative-workflow.js";
import { WorkflowSection } from "../../components/workflow-section.js";

export interface TicketPreflightIssue {
  tone: "warn";
  title: string;
  body: string;
  action: ReactNode | null;
}

export type ExecutionStageState = "active" | "complete" | "future" | "checkpoint";

export interface TicketAnchorStep {
  label: string;
  summary: string;
  state: ExecutionStageState;
}

const getStageBadgeLabel = (state: ExecutionStageState): string => {
  if (state === "active") {
    return "Up next";
  }

  if (state === "checkpoint") {
    return "Needs work";
  }

  if (state === "complete") {
    return "Done";
  }

  return "Waiting";
};

const renderIssueList = (issues: TicketPreflightIssue[]) => (
  <div className="ticket-issues-list">
    {issues.map((issue) => (
      <div key={issue.title} className={`ticket-issue ticket-issue-${issue.tone}`}>
        <strong>{issue.title}</strong>
        <span>{issue.body}</span>
        {issue.action}
      </div>
    ))}
  </div>
);

const toBriefCriterionText = (text: string): string => {
  const stripped = text.replace(/\s*\([^)]*\)\s*\.?$/, "").replace(/\s+/g, " ").trim();
  if (!stripped) {
    return text;
  }

  return /[.!?]$/.test(stripped) ? stripped : `${stripped}.`;
};

const getDisplayFileTargets = (targets: string[]): string[] => {
  const basenames = new Map<string, number>();

  for (const target of targets) {
    const basename = target.split("/").filter(Boolean).pop() ?? target;
    basenames.set(basename, (basenames.get(basename) ?? 0) + 1);
  }

  return targets.map((target) => {
    const basename = target.split("/").filter(Boolean).pop() ?? target;
    return (basenames.get(basename) ?? 0) > 1 ? target : basename;
  });
};

interface TicketAnchorCardProps {
  contextLabel: string;
  phaseName: string;
  ticketStatusLabel: string;
  verificationLabel: string;
  fileTargetsCount: number;
  steps: TicketAnchorStep[];
  validTransitions: Array<{ key: TicketStatus; label: string }>;
  moveToStatus: TicketStatus | "";
  onMoveToStatusChange: (nextStatus: TicketStatus | "") => void;
  onUpdateStatus: () => Promise<void>;
}

export const TicketAnchorCard = ({
  contextLabel,
  phaseName,
  ticketStatusLabel,
  verificationLabel,
  fileTargetsCount,
  steps,
  validTransitions,
  moveToStatus,
  onMoveToStatusChange,
  onUpdateStatus,
}: TicketAnchorCardProps) => (
  <section className="ticket-anchor-card">
    <div className="ticket-anchor-top">
      <div className="ticket-anchor-context">
        <span className="ticket-context-chip">{contextLabel}</span>
        <span className="ticket-context-chip ticket-context-chip-strong">{phaseName}</span>
      </div>
      <span className="ticket-anchor-label">Execution path</span>
    </div>

    <ol className="ticket-stepper" aria-label="Ticket execution path">
      {steps.map((step, index) => (
        <li key={step.label} className={`ticket-stepper-item ticket-stepper-item-${step.state}`}>
          <span className="ticket-stepper-index" aria-hidden="true">
            {index + 1}
          </span>
          <div className="ticket-stepper-copy">
            <strong>{step.label}</strong>
            <p>{step.summary}</p>
          </div>
          <span className={`ticket-stage-badge ticket-stage-badge-${step.state}`}>
            {getStageBadgeLabel(step.state)}
          </span>
        </li>
      ))}
    </ol>

    <div className="ticket-status-strip">
      <div className="ticket-status-pills">
        <div className="ticket-status-pill">
          <span>Status</span>
          <strong>{ticketStatusLabel}</strong>
        </div>
        <div className="ticket-status-pill">
          <span>Verification</span>
          <strong>{verificationLabel}</strong>
        </div>
        <div className="ticket-status-pill">
          <span>Files in scope</span>
          <strong>{fileTargetsCount}</strong>
        </div>
      </div>

      {validTransitions.length > 0 ? (
        <div className="ticket-status-toolbar">
          <select value={moveToStatus} onChange={(event) => onMoveToStatusChange(event.target.value as TicketStatus | "")}>
            <option value="" disabled>
              Move ticket to
            </option>
            {validTransitions.map((column) => (
              <option key={column.key} value={column.key}>
                {column.label}
              </option>
            ))}
          </select>
          <button type="button" disabled={!moveToStatus} onClick={() => void onUpdateStatus()}>
            Update status
          </button>
        </div>
      ) : null}
    </div>
  </section>
);

interface TicketIssuesCardProps {
  title: string;
  issues: TicketPreflightIssue[];
}

export const TicketIssuesCard = ({
  title,
  issues,
}: TicketIssuesCardProps) => (
  <section className="ticket-issues-card">
    <h3>{title}</h3>
    {renderIssueList(issues)}
  </section>
);

interface TicketFocusCardProps {
  title: string;
  body: string;
  state: ExecutionStageState;
  badgeLabel?: string;
  children?: ReactNode;
}

export const TicketFocusCard = ({
  title,
  body,
  state,
  badgeLabel,
  children = null,
}: TicketFocusCardProps) => (
  <section className={`ticket-focus-card ticket-focus-card-${state}`}>
    <div className="ticket-focus-header">
      <div>
        <span className="ticket-focus-eyebrow">Current step</span>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <span className={`ticket-stage-badge ticket-stage-badge-${state}`}>
        {badgeLabel ?? getStageBadgeLabel(state)}
      </span>
    </div>
    {children ? <div className="ticket-focus-body">{children}</div> : null}
  </section>
);

interface TicketBlockersCardProps {
  issues: TicketPreflightIssue[];
}

export const TicketBlockersCard = ({ issues }: TicketBlockersCardProps) => (
  <TicketFocusCard
    title="Clear blockers"
    body="This ticket is not ready to start yet. Resolve these blockers, then come back here to begin the work."
    state="future"
    badgeLabel="Not ready"
  >
    {renderIssueList(issues)}
  </TicketFocusCard>
);

interface TicketBriefCardProps {
  ticket: Ticket;
  groupedCoveredItems: Record<string, Array<{ id: string; text: string }>>;
}

export const TicketBriefCard = ({
  ticket,
  groupedCoveredItems,
}: TicketBriefCardProps) => {
  const supportEntries = Object.entries(groupedCoveredItems);
  const displayTargets = getDisplayFileTargets(ticket.fileTargets);
  const supportCount = supportEntries.reduce((count, [, items]) => count + items.length, 0);

  return (
    <section className="ticket-brief-card">
      <WorkflowSection title="What this ticket needs to deliver">
        <div className="ticket-brief-grid">
          <section className="ticket-brief-section">
            <h4>Why this matters</h4>
            <p className="ticket-brief-copy">
              {ticket.description || `${ticket.title} is the next piece of work for this plan.`}
            </p>
          </section>

          <section className="ticket-brief-section">
            <h4>Done looks like</h4>
            {ticket.acceptanceCriteria.length === 0 ? (
              <p className="ticket-empty-note">No must-haves are listed yet.</p>
            ) : (
              <ul className="ticket-plan-list">
                {ticket.acceptanceCriteria.map((criterion) => (
                  <li key={criterion.id}>{toBriefCriterionText(criterion.text)}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="ticket-brief-section">
            <h4>Likely files</h4>
            {displayTargets.length === 0 ? (
              <p className="ticket-empty-note">No likely files are listed yet.</p>
            ) : (
              <ul className="ticket-brief-files">
                {displayTargets.map((target) => (
                  <li key={target} className="ticket-brief-file-item">
                    <code>{target}</code>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ticket-brief-section">
            <h4>Supports</h4>
            {supportEntries.length === 0 ? (
              <p className="ticket-empty-note">No linked plan commitments yet.</p>
            ) : (
              <>
                <p className="ticket-brief-copy">
                  This ticket supports {supportCount} planned {supportCount === 1 ? "commitment" : "commitments"} from the initiative.
                </p>
                <div className="ticket-support-tags">
                  {supportEntries.map(([step, items]) => (
                    <span key={step} className="ticket-support-tag">
                      {(INITIATIVE_WORKFLOW_LABELS[step as keyof typeof INITIATIVE_WORKFLOW_LABELS] ?? step)} · {items.length}
                    </span>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>

        <details className="ticket-brief-details">
          <summary>Open implementation details</summary>
          <div className="ticket-brief-detail-grid">
            <section className="ticket-plan-section">
              <h4>Exact acceptance criteria</h4>
              {ticket.acceptanceCriteria.length === 0 ? (
                <p className="ticket-empty-note">No acceptance criteria yet.</p>
              ) : (
                <ul className="ticket-plan-list">
                  {ticket.acceptanceCriteria.map((criterion) => (
                    <li key={criterion.id}>{criterion.text}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className="ticket-plan-section">
              <h4>Implementation plan</h4>
              {ticket.implementationPlan ? (
                <pre className="ticket-plan-copy">{ticket.implementationPlan}</pre>
              ) : (
                <p className="ticket-empty-note">No implementation plan yet.</p>
              )}
            </section>

            <section className="ticket-plan-section">
              <h4>Exact files in scope</h4>
              {ticket.fileTargets.length === 0 ? (
                <p className="ticket-empty-note">No files in scope yet.</p>
              ) : (
                <ul className="ticket-plan-files">
                  {ticket.fileTargets.map((target) => (
                    <li key={target} className="ticket-plan-file-item">
                      <code>{target}</code>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="ticket-plan-section">
              <h4>Source plan details</h4>
              {supportEntries.length === 0 ? (
                <p className="ticket-empty-note">No linked spec items yet.</p>
              ) : (
                supportEntries.map(([step, items]) => (
                  <div key={step} className="ticket-context-group">
                    <span className="qa-label">
                      {INITIATIVE_WORKFLOW_LABELS[step as keyof typeof INITIATIVE_WORKFLOW_LABELS] ?? step}
                    </span>
                    <ul className="ticket-plan-list">
                      {items.map((item) => (
                        <li key={item.id}>{item.text}</li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </section>
          </div>
        </details>
      </WorkflowSection>
    </section>
  );
};
