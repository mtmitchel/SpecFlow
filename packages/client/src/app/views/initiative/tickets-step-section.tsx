import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type {
  Initiative,
  PlanningReviewArtifact,
  PlanningReviewKind,
  Run,
  Ticket,
  TicketCoverageArtifact,
  TicketCoverageItem
} from "../../../types.js";
import {
  groupReviewFindings,
  isResolvedReview,
  TICKET_COVERAGE_REVIEW_KIND
} from "./shared.js";
import { PlanningReviewCard } from "./planning-review-card.js";

const PhaseNameEditor = ({
  name,
  onCommit
}: {
  name: string;
  onCommit: (nextName: string) => void;
}) => {
  const [localName, setLocalName] = useState(name);

  useEffect(() => {
    setLocalName(name);
  }, [name]);

  return (
    <input
      className="phase-name-input"
      value={localName}
      onChange={(event) => setLocalName(event.target.value)}
      onBlur={() => {
        if (localName !== name) {
          onCommit(localName);
        }
      }}
    />
  );
};

interface TicketsStepSectionProps {
  initiative: Initiative;
  initiativeTickets: Ticket[];
  linkedRuns: Run[];
  ticketCoverageArtifact: TicketCoverageArtifact | null;
  ticketCoverageReview: PlanningReviewArtifact | undefined;
  uncoveredCoverageItems: TicketCoverageItem[];
  coveredCoverageCount: number;
  busyAction: string | null;
  reviewOverrideKind: PlanningReviewKind | null;
  reviewOverrideReason: string;
  onGenerateTickets: () => void | Promise<void>;
  onOpenFirstTicket: (ticketId: string) => void;
  onRunReview: (kind: PlanningReviewKind) => void | Promise<void>;
  onSetReviewOverride: (kind: PlanningReviewKind, reason: string) => void;
  onClearReviewOverride: () => void;
  onChangeReviewOverrideReason: (reason: string) => void;
  onConfirmOverride: (kind: PlanningReviewKind) => void | Promise<void>;
  onCommitPhaseName: (phaseId: string, nextName: string) => void;
}

export const TicketsStepSection = ({
  initiative,
  initiativeTickets,
  linkedRuns,
  ticketCoverageArtifact,
  ticketCoverageReview,
  uncoveredCoverageItems,
  coveredCoverageCount,
  busyAction,
  reviewOverrideKind,
  reviewOverrideReason,
  onGenerateTickets,
  onOpenFirstTicket,
  onRunReview,
  onSetReviewOverride,
  onClearReviewOverride,
  onChangeReviewOverrideReason,
  onConfirmOverride,
  onCommitPhaseName
}: TicketsStepSectionProps) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const firstTicket = initiativeTickets[0] ?? null;
  const grouped = groupReviewFindings(ticketCoverageReview?.findings ?? []);
  const blockers = grouped.blocker.length + grouped["traceability-gap"].length;
  const warnings = grouped.warning.length;
  const reviewBusy =
    busyAction === `review-${TICKET_COVERAGE_REVIEW_KIND}` ||
    busyAction === `override-${TICKET_COVERAGE_REVIEW_KIND}`;
  const showOverrideForm = reviewOverrideKind === TICKET_COVERAGE_REVIEW_KIND;

  return (
    <div className="planning-main-column">
      <div className="planning-section-card">
        <div className="planning-section-header">
          <div>
            <h4 className="heading-reset">Ticket plan</h4>
            <p className="text-muted-sm" style={{ margin: "0.25rem 0 0" }}>
              Generate tickets when the plan is ready to turn into work.
            </p>
          </div>
          <div className="button-row planning-view-toggle">
            <button
              type="button"
              className="btn-primary"
              disabled={busyAction !== null || initiative.workflow.steps.tickets.status === "complete"}
              onClick={() => void onGenerateTickets()}
            >
              {busyAction === "generate-tickets"
                ? (
                  <span className="btn-loading">
                    <span className="status-loading-spinner" aria-hidden="true" />
                    <span className="loading-label-pulse">Generating tickets...</span>
                  </span>
                )
                : initiative.workflow.steps.tickets.status === "stale"
                  ? "Refresh tickets"
                  : "Generate tickets"}
            </button>
            {firstTicket ? (
              <button type="button" onClick={() => onOpenFirstTicket(firstTicket.id)}>
                Open first ticket
              </button>
            ) : null}
          </div>
        </div>

        {initiative.phases.length === 0 ? (
          <p className="text-muted-sm" style={{ margin: 0 }}>
            No tickets yet.
          </p>
        ) : null}
      </div>

      {ticketCoverageReview || ticketCoverageArtifact ? (
        <PlanningReviewCard
          title="Coverage"
          status={ticketCoverageReview?.status ?? "stale"}
          meta={
            <>
              {ticketCoverageArtifact
                ? `${coveredCoverageCount} covered · ${uncoveredCoverageItems.length} uncovered`
                : "Coverage appears after ticket generation."}
              {ticketCoverageReview
                ? ` · ${blockers} blocker${blockers === 1 ? "" : "s"} · ${warnings} warning${warnings === 1 ? "" : "s"}`
                : ""}
            </>
          }
          summary={ticketCoverageReview?.summary}
          findings={grouped}
          reviewBusy={reviewBusy}
          primaryActionLabel="Check coverage"
          primaryActionBusyLabel="Checking..."
          onPrimaryAction={() => onRunReview(TICKET_COVERAGE_REVIEW_KIND)}
          primaryActionDisabled={initiative.phases.length === 0}
          detailsOpen={detailsOpen}
          onToggleDetails={() => setDetailsOpen((current) => !current)}
          showOverrideAction={ticketCoverageReview?.status === "blocked"}
          showOverrideForm={showOverrideForm}
          onToggleOverride={() => {
            if (showOverrideForm) {
              onClearReviewOverride();
              return;
            }

            onSetReviewOverride(TICKET_COVERAGE_REVIEW_KIND, ticketCoverageReview?.overrideReason ?? "");
          }}
          overrideReason={showOverrideForm ? reviewOverrideReason : ticketCoverageReview?.overrideReason}
          overridePlaceholder="Add a short reason for moving ahead anyway."
          onChangeOverrideReason={onChangeReviewOverrideReason}
          onConfirmOverride={() => onConfirmOverride(TICKET_COVERAGE_REVIEW_KIND)}
          overrideActionLabel="Continue with risk"
          cancelOverrideLabel="Keep blocking"
          overrideConfirmLabel="Continue with risk"
          overrideBusyLabel="Saving..."
          extraContent={
            uncoveredCoverageItems.length > 0 ? (
              <div>
                <span className="qa-label">Uncovered spec items</span>
                <ul style={{ margin: "0.35rem 0 0" }}>
                  {uncoveredCoverageItems.map((item) => (
                    <li key={item.id}>
                      {item.sourceStep} · {item.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null
          }
          footerMessage={
            ticketCoverageReview && !isResolvedReview(ticketCoverageReview)
              ? "Fix these gaps before you run the tickets."
              : null
          }
        />
      ) : null}

      {initiative.phases
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((phase) => {
          const phaseTickets = initiativeTickets.filter((ticket) => ticket.phaseId === phase.id);
          return (
            <div key={phase.id} className="phase-block">
              <div className="planning-section-header">
                <PhaseNameEditor name={phase.name} onCommit={(nextName) => onCommitPhaseName(phase.id, nextName)} />
                <span className="planning-phase-count">
                  {phaseTickets.length} ticket{phaseTickets.length === 1 ? "" : "s"}
                </span>
              </div>
              {phaseTickets.length === 0 ? (
                <p className="text-muted-sm" style={{ margin: 0 }}>No tickets yet.</p>
              ) : (
                <ul className="planning-ticket-list">
                  {phaseTickets.map((ticket) => (
                    <li key={ticket.id}>
                      <Link to={`/ticket/${ticket.id}`}>{ticket.title}</Link>
                      <span>
                        {ticket.status} · covers {ticket.coverageItemIds.length} spec item
                        {ticket.coverageItemIds.length === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

      {linkedRuns.length > 0 ? (
        <div className="planning-section-card">
          <h4 className="heading-reset">Linked runs</h4>
          <ul className="planning-ticket-list">
            {linkedRuns.map((run) => (
              <li key={run.id}>
                <Link to={`/run/${run.id}`}>{run.id}</Link>
                <span>{run.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};
