import type { ReactNode } from "react";
import type { Ticket, TicketStatus } from "../../../types.js";
import { CustomSelect } from "../../components/custom-select.js";

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

const getTabItemClass = (state: ExecutionStageState): string => {
  if (state === "active" || state === "checkpoint") {
    return "ticket-tab-item ticket-tab-item-active";
  }

  if (state === "complete") {
    return "ticket-tab-item ticket-tab-item-done";
  }

  return "ticket-tab-item";
};

export const TicketAnchorCard = ({
  contextLabel: _contextLabel,
  phaseName: _phaseName,
  ticketStatusLabel: _ticketStatusLabel,
  verificationLabel: _verificationLabel,
  fileTargetsCount: _fileTargetsCount,
  steps,
  validTransitions,
  moveToStatus,
  onMoveToStatusChange,
  onUpdateStatus,
}: TicketAnchorCardProps) => (
  <section className="ticket-anchor-card">
    <div className="ticket-tab-bar" role="tablist" aria-label="Ticket execution path">
      {steps.map((step) => (
        <button
          key={step.label}
          type="button"
          role="tab"
          className={getTabItemClass(step.state)}
          disabled={step.state === "future"}
          aria-selected={step.state === "active" || step.state === "checkpoint"}
        >
          {step.label}
        </button>
      ))}
    </div>

    {validTransitions.length > 0 ? (
      <div className="ticket-status-strip">
        <div className="ticket-status-toolbar">
          <CustomSelect
            options={validTransitions.map((column) => ({ value: column.key, label: column.label }))}
            value={moveToStatus}
            onChange={(val) => onMoveToStatusChange(val as TicketStatus | "")}
            placeholder="Move ticket to"
            aria-label="Move ticket to"
          />
          <button type="button" disabled={!moveToStatus} onClick={() => void onUpdateStatus()}>
            Update status
          </button>
        </div>
      </div>
    ) : null}
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
  state: _state,
  badgeLabel: _badgeLabel,
  children = null,
}: TicketFocusCardProps) => (
  <section className="ticket-focus-card">
    <div className="ticket-focus-header">
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
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
  groupedCoveredItems: _groupedCoveredItems,
}: TicketBriefCardProps) => {
  const displayTargets = getDisplayFileTargets(ticket.fileTargets);

  return (
    <section className="ticket-brief-card">
        <div className="ticket-brief-grid">
          <section className="ticket-flat-section">
            <h3>Brief</h3>
            <h4>Why this matters</h4>
            <p className="ticket-brief-copy">
              {ticket.description || `${ticket.title} is the next piece of work for this plan.`}
            </p>
          </section>

          <section className="ticket-flat-section">
            <h3>Requirements</h3>
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

          <section className="ticket-flat-section">
            <h3>Resources</h3>
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

        </div>
    </section>
  );
};
