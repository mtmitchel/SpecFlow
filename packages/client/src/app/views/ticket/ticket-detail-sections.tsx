import type { ReactNode } from "react";
import type { Ticket } from "../../../types.js";
import { CustomSelect } from "../../components/custom-select.js";

export interface TicketPreflightIssue {
  tone: "warn";
  title: string;
  body: string;
  action: ReactNode | null;
}

export type ExecutionStageState = "active" | "complete" | "future" | "checkpoint";
export type TicketCriterionStatus = "pending" | "pass" | "fail";
export type TicketStageVariant = "default" | "handoff" | "review" | "verification";

export interface TicketAnchorStep {
  label: string;
  state: ExecutionStageState;
}

export interface TicketStageSummaryItem {
  label: string;
  value: string;
  tone?: "default" | "success" | "warn";
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
  steps: TicketAnchorStep[];
}

const getStepItemClass = (state: ExecutionStageState): string => {
  if (state === "active" || state === "checkpoint") {
    return "ticket-stepper-item ticket-stepper-item-active";
  }

  if (state === "complete") {
    return "ticket-stepper-item ticket-stepper-item-done";
  }

  return "ticket-stepper-item";
};

const getStageStateLabel = (state: ExecutionStageState): string => {
  if (state === "active") {
    return "Active";
  }

  if (state === "complete") {
    return "Complete";
  }

  if (state === "checkpoint") {
    return "Needs attention";
  }

  return "Pending";
};

export const TicketAnchorCard = ({
  steps,
}: TicketAnchorCardProps) => (
  <section className="ticket-anchor-card">
    <p className="ticket-anchor-label">Agent workbench</p>
    <ol className="ticket-stepper" aria-label="Ticket stages">
      {steps.map((step) => (
        <li key={step.label} className={getStepItemClass(step.state)}>
          <div className="ticket-stepper-heading">
            <strong>{step.label}</strong>
            <span className={`ticket-stepper-state ticket-stepper-state-${step.state}`}>
              {getStageStateLabel(step.state)}
            </span>
          </div>
        </li>
      ))}
    </ol>
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
  variant?: TicketStageVariant;
  issues?: TicketPreflightIssue[];
  summaryItems?: TicketStageSummaryItem[];
  actions?: ReactNode;
  children?: ReactNode;
}

export const TicketFocusCard = ({
  title,
  body,
  state: _state,
  badgeLabel: _badgeLabel,
  variant = "default",
  issues = [],
  summaryItems = [],
  actions = null,
  children = null,
}: TicketFocusCardProps) => (
  <section className={`ticket-focus-card ticket-focus-card-${variant}`}>
    <div className="ticket-focus-header">
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      {actions}
    </div>
    {issues.length > 0 ? renderIssueList(issues) : null}
    {summaryItems.length > 0 ? (
      <dl className="ticket-stage-summary">
        {summaryItems.map((item) => (
          <div
            key={`${item.label}-${item.value}`}
            className={`ticket-stage-summary-item ticket-stage-summary-item-${item.tone ?? "default"}`}
          >
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    ) : null}
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
  criterionStates: Record<string, TicketCriterionStatus>;
  status: string;
  statusOptions: Array<{ value: string; label: string }>;
  onStatusChange: (value: string) => void;
  statusUpdating: boolean;
}

const getCriterionStatusLabel = (status: TicketCriterionStatus): string => {
  if (status === "pass") {
    return "Passed";
  }

  if (status === "fail") {
    return "Failed";
  }

  return "Not checked";
};

const TicketBriefSection = ({
  title,
  variant = "default",
  children,
}: {
  title: string;
  variant?: "default" | "checklist";
  children: ReactNode;
}) => (
  <details className={`ticket-brief-section ticket-brief-section-${variant}`} open>
    <summary>{title}</summary>
    <div className="ticket-brief-section-body">{children}</div>
  </details>
);

const getCriterionStatusSymbol = (status: TicketCriterionStatus): string => {
  if (status === "pass") {
    return "✓";
  }

  if (status === "fail") {
    return "×";
  }

  return "";
};

export const TicketBriefCard = ({
  ticket,
  criterionStates,
  status,
  statusOptions,
  onStatusChange,
  statusUpdating,
}: TicketBriefCardProps) => {
  const displayTargets = getDisplayFileTargets(ticket.fileTargets);
  const hasBackground = ticket.description.trim() && ticket.description.trim() !== ticket.title.trim();
  const hasImplementationPlan = ticket.implementationPlan.trim().length > 0;

  return (
    <aside className="ticket-brief-card">
      <div className="ticket-brief-grid">
        <div className="ticket-brief-status-row">
          <span className="ticket-anchor-label">Status</span>
          <CustomSelect
            options={statusOptions}
            value={status}
            onChange={onStatusChange}
            disabled={statusUpdating}
            aria-label="Ticket status"
          />
        </div>

        <TicketBriefSection title="Task">
          <div className="ticket-brief-detail-grid">
            <p className="ticket-brief-copy ticket-task-title">{ticket.title}</p>
            {hasImplementationPlan ? (
              <section className="ticket-plan-section">
                <h4>Implementation notes</h4>
                <p className="ticket-brief-copy">{ticket.implementationPlan}</p>
              </section>
            ) : null}
          </div>
        </TicketBriefSection>

        {hasBackground ? (
          <TicketBriefSection title="Goal">
            <div className="ticket-brief-detail-grid">
              <p className="ticket-brief-copy">{ticket.description}</p>
            </div>
          </TicketBriefSection>
        ) : null}

        <TicketBriefSection title="Done means" variant="checklist">
          {ticket.acceptanceCriteria.length === 0 ? (
            <p className="ticket-empty-note">No must-haves are listed yet.</p>
          ) : (
            <ul className="ticket-criteria-list">
              {ticket.acceptanceCriteria.map((criterion) => {
                const status = criterionStates[criterion.id] ?? "pending";

                return (
                  <li
                    key={criterion.id}
                    className={`ticket-criterion-item ticket-criterion-item-${status}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`ticket-criterion-marker ticket-criterion-marker-${status}`}
                      title={getCriterionStatusLabel(status)}
                    >
                      {getCriterionStatusSymbol(status)}
                    </span>
                    <span className="ticket-criterion-copy">{toBriefCriterionText(criterion.text)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </TicketBriefSection>

        <TicketBriefSection title="Main files">
          {displayTargets.length === 0 ? (
            <p className="ticket-empty-note">No likely files are listed yet.</p>
          ) : (
            <div className="ticket-context-file-tree-shell">
              <ul className="ticket-context-file-list">
                {displayTargets.map((target, index) => (
                  <li
                    key={target}
                    className={`ticket-context-file-item ${index === displayTargets.length - 1 ? "ticket-context-file-item-last" : ""}`}
                  >
                    <code>{target}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TicketBriefSection>

      </div>
    </aside>
  );
};
