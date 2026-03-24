import { Link } from "react-router-dom";
import type {
  Initiative,
  PlanningReviewArtifact,
  Run,
  RunAttempt,
  Ticket,
  TicketCoverageArtifact,
  TicketStatus,
} from "../../types.js";
import {
  TicketAnchorCard,
  TicketBlockersCard,
  TicketBriefCard,
} from "./ticket/ticket-detail-sections.js";
import { TicketHandoffPanel } from "./ticket/ticket-handoff-panel.js";
import { TicketVerificationPanel } from "./ticket/ticket-verification-panel.js";
import { COVERAGE_GATE_MESSAGE, useTicketViewModel } from "./ticket/use-ticket-view-model.js";
import { noopApplySnapshotUpdate, type ApplySnapshotUpdate } from "../utils/snapshot-updates.js";

export const TicketView = ({
  tickets,
  runs,
  runAttempts,
  initiatives,
  planningReviews,
  ticketCoverageArtifacts: _ticketCoverageArtifacts,
  onRefresh,
  onApplySnapshotUpdate = noopApplySnapshotUpdate,
  onMoveTicket,
}: {
  tickets: Ticket[];
  runs: Run[];
  runAttempts: RunAttempt[];
  initiatives: Initiative[];
  planningReviews: PlanningReviewArtifact[];
  ticketCoverageArtifacts: TicketCoverageArtifact[];
  onRefresh: () => Promise<void>;
  onApplySnapshotUpdate?: ApplySnapshotUpdate;
  onMoveTicket: (ticketId: string, status: TicketStatus) => Promise<void>;
}) => {
  const viewModel = useTicketViewModel({
    tickets,
    runs,
    runAttempts,
    initiatives,
    planningReviews,
    onRefresh,
    onApplySnapshotUpdate,
    onMoveTicket,
  });

  if (viewModel.ticket === null) {
    return (
      <section>
        <h2>Ticket not found</h2>
      </section>
    );
  }

  const ticket = viewModel.ticket;

  return (
    <section className="ticket-journey">
      <header className="ticket-journey-header">
        <div className="ticket-journey-title">
          <h2 className="ticket-visually-hidden">{ticket.title}</h2>
          <p className="ticket-journey-context">{viewModel.headerContextLabel}</p>
        </div>
        <div className="ticket-journey-header-actions">
          {viewModel.initiative ? (
            <Link to={`/initiative/${viewModel.initiative.id}?step=tickets`}>Back to tickets</Link>
          ) : null}
        </div>
      </header>

      <div className="ticket-content-card">
        <div className="ticket-workbench">
            <TicketBriefCard
              ticket={ticket}
              criterionStates={viewModel.criterionStates}
              status={ticket.status}
              statusOptions={viewModel.statusOptions}
              onStatusChange={(value) => {
                void viewModel.handleStatusChange(value);
              }}
              statusUpdating={viewModel.statusUpdating}
          />

          <div className="ticket-workbench-main">
            <TicketAnchorCard steps={viewModel.anchorSteps} />

            {viewModel.visibleBlockingIssues.length > 0 ? (
              <TicketBlockersCard issues={viewModel.visibleBlockingIssues} />
            ) : null}

            {viewModel.focusStage === "handoff" ? (
              <TicketHandoffPanel
                workflowPhase={viewModel.workflowPhase}
                stageState={viewModel.startStageState}
                noticeIssues={viewModel.visibleNoticeIssues}
                summaryItems={viewModel.handoffSummaryItems}
                exportWorkflow={viewModel.exportWorkflow}
                refreshCapturePreview={viewModel.capture.refreshCapturePreview}
              />
            ) : null}

            {viewModel.focusStage === "verification" ? (
              <TicketVerificationPanel
                verificationPassed={viewModel.verificationPassed}
                ticketStatus={ticket.status}
                stageState={viewModel.verificationStageState}
                noticeIssues={viewModel.visibleNoticeIssues}
                summaryItems={viewModel.verificationSummaryItems}
                prepSummaryItems={viewModel.verificationPrepSummaryItems}
                verificationResult={viewModel.verificationResult}
                latestAttempt={viewModel.latestAttempt}
                hasReturnedWork={viewModel.hasReturnedWork}
                ticketId={ticket.id}
                runId={viewModel.run?.id ?? null}
                attempts={viewModel.attempts}
                exportWorkflow={viewModel.exportWorkflow}
                capture={viewModel.capture}
                verify={viewModel.verify}
                onAccept={viewModel.handleAcceptVerifiedWork}
                acceptPending={viewModel.statusUpdating}
                onRefresh={onRefresh}
                nextTicketId={viewModel.nextTicketId}
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export { COVERAGE_GATE_MESSAGE };
