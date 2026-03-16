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
import { REVIEW_KIND_LABELS } from "../../utils/initiative-workflow.js";
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
  const firstTicket = initiativeTickets[0] ?? null;
  const grouped = groupReviewFindings(ticketCoverageReview?.findings ?? []);
  const blockers = grouped.blocker.length + grouped["traceability-gap"].length;
  const warnings = grouped.warning.length;
  const reviewBusy =
    busyAction === `review-${TICKET_COVERAGE_REVIEW_KIND}` ||
    busyAction === `override-${TICKET_COVERAGE_REVIEW_KIND}`;
  const showOverrideForm = reviewOverrideKind === TICKET_COVERAGE_REVIEW_KIND;

  return (
    <>
      <div className="button-row">
        <button
          type="button"
          className="btn-primary"
          disabled={busyAction !== null || initiative.workflow.steps.tickets.status === "complete"}
          onClick={() => void onGenerateTickets()}
        >
          {busyAction === "generate-tickets"
            ? "Creating..."
            : initiative.workflow.steps.tickets.status === "stale"
              ? "Refresh tickets"
              : "Create tickets"}
        </button>
        {firstTicket ? (
          <button type="button" onClick={() => onOpenFirstTicket(firstTicket.id)}>
            Open first ticket
          </button>
        ) : null}
      </div>

      {ticketCoverageReview || ticketCoverageArtifact ? (
        <PlanningReviewCard
          title={REVIEW_KIND_LABELS[TICKET_COVERAGE_REVIEW_KIND]}
          status={ticketCoverageReview?.status ?? "stale"}
          meta={
            <>
              {ticketCoverageArtifact
                ? `${coveredCoverageCount} covered · ${uncoveredCoverageItems.length} uncovered`
                : "Coverage will appear after tickets are created."}
              {ticketCoverageReview
                ? ` · ${blockers} blocker${blockers === 1 ? "" : "s"} · ${warnings} warning${warnings === 1 ? "" : "s"}`
                : ""}
            </>
          }
          summary={ticketCoverageReview?.summary}
          findings={grouped}
          reviewBusy={reviewBusy}
          primaryActionLabel="Run coverage check"
          primaryActionBusyLabel="Checking..."
          onPrimaryAction={() => onRunReview(TICKET_COVERAGE_REVIEW_KIND)}
          primaryActionDisabled={initiative.phases.length === 0}
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
          overridePlaceholder="Document why you are accepting this coverage risk."
          onChangeOverrideReason={onChangeReviewOverrideReason}
          onConfirmOverride={() => onConfirmOverride(TICKET_COVERAGE_REVIEW_KIND)}
          overrideActionLabel="Override coverage blockers"
          cancelOverrideLabel="Cancel override"
          overrideConfirmLabel="Confirm override"
          overrideBusyLabel="Overriding..."
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
              ? "Resolve the coverage check before starting execution for these tickets."
              : null
          }
        />
      ) : null}

      {initiative.phases.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No tickets yet. Create tickets after the tech spec is ready.</p>
      ) : null}

      {initiative.phases
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((phase) => {
          const phaseTickets = initiativeTickets.filter((ticket) => ticket.phaseId === phase.id);
          return (
            <div key={phase.id} className="phase-block">
              <PhaseNameEditor name={phase.name} onCommit={(nextName) => onCommitPhaseName(phase.id, nextName)} />
              <ul>
                {phaseTickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link to={`/ticket/${ticket.id}`}>{ticket.title}</Link> · {ticket.status} · covers{" "}
                    {ticket.coverageItemIds.length} spec item{ticket.coverageItemIds.length === 1 ? "" : "s"}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

      {linkedRuns.length > 0 ? (
        <>
          <h3>Recent runs</h3>
          <ul>
            {linkedRuns.map((run) => (
              <li key={run.id}>
                <Link to={`/run/${run.id}`}>{run.id}</Link> · {run.status}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
};
