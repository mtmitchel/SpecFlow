import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchOperationStatus } from "../../api.js";
import type {
  Initiative,
  PlanningReviewArtifact,
  Run,
  RunAttempt,
  Ticket,
  TicketCoverageArtifact,
  TicketStatus
} from "../../types.js";
import { useToast } from "../context/toast.js";
import { canTransition, statusColumns } from "../constants/status-columns.js";
import { findPhaseWarning } from "../utils/phase-warning.js";
import { useVerificationStream } from "../hooks/use-verification-stream.js";
import { useCapturePreview } from "../hooks/use-capture-preview.js";
import { useExportWorkflow } from "../hooks/use-export-workflow.js";
import { ExportSection } from "./ticket/export-section.js";
import { CaptureVerifySection } from "./ticket/capture-verify-section.js";
import {
  TicketAnchorCard,
  TicketBlockersCard,
  TicketBriefCard,
  TicketFocusCard,
  TicketIssuesCard,
  type TicketPreflightIssue,
  type TicketAnchorStep,
  type ExecutionStageState,
} from "./ticket/ticket-detail-sections.js";
import { VerificationResultsSection } from "./ticket/verification-results-section.js";
import type { WorkflowPhase } from "./ticket/workflow.js";
import { usePersistInitiativeResumeTicket } from "./use-persist-initiative-resume-ticket.js";

const COVERAGE_GATE_MESSAGE = "Run the coverage check before you start this ticket.";

const getVerificationLabel = (
  verificationResult: ReturnType<typeof useVerificationStream>["verificationResult"],
  latestAttempt: RunAttempt | null,
): string => {
  if (verificationResult) {
    return verificationResult.overallPass ? "Passed" : "Needs work";
  }

  if (!latestAttempt) {
    return "Not run";
  }

  return latestAttempt.overallPass ? "Passed" : "Needs work";
};

export const TicketView = ({
  tickets,
  runs,
  runAttempts,
  initiatives,
  planningReviews,
  ticketCoverageArtifacts,
  onRefresh,
  onMoveTicket
}: {
  tickets: Ticket[];
  runs: Run[];
  runAttempts: RunAttempt[];
  initiatives: Initiative[];
  planningReviews: PlanningReviewArtifact[];
  ticketCoverageArtifacts: TicketCoverageArtifact[];
  onRefresh: () => Promise<void>;
  onMoveTicket: (ticketId: string, status: TicketStatus) => Promise<void>;
}) => {
  const params = useParams<{ id: string }>();
  const { showError } = useToast();
  const [operationState, setOperationState] = useState<string | null>(null);
  const [moveToStatus, setMoveToStatus] = useState<TicketStatus | "">("");

  const ticket = tickets.find((item) => item.id === params.id);
  const run = runs.find((item) => item.id === ticket?.runId);
  const attempts = runAttempts
    .filter((attempt) => run?.attempts.includes(attempt.attemptId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const latestAttempt = attempts[0] ?? null;

  const prevTicketId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (params.id !== prevTicketId.current) {
      prevTicketId.current = params.id;
      setMoveToStatus("");
    }
  }, [params.id]);

  const verify = useVerificationStream(params.id, run?.id, onRefresh);
  const capture = useCapturePreview(params.id, run?.id, ticket?.fileTargets ?? []);
  const exportWf = useExportWorkflow(params.id, onRefresh);

  useEffect(() => {
    if (!run?.activeOperationId) {
      setOperationState(null);
      return;
    }

    void fetchOperationStatus(run.activeOperationId).then((status) => {
      setOperationState(status?.state ?? null);
    });
  }, [run?.activeOperationId]);

  const initiative = ticket?.initiativeId ? initiatives.find((item) => item.id === ticket.initiativeId) ?? null : null;
  usePersistInitiativeResumeTicket({
    initiativeId: initiative?.id ?? null,
    resumeTicketId: ticket?.initiativeId ? ticket.id : null,
    currentResumeTicketId: initiative?.workflow.resumeTicketId,
    onRefresh,
    showError,
  });

  if (!ticket) {
    return (
      <section>
        <h2>Ticket not found</h2>
      </section>
    );
  }

  const phase = initiative?.phases.find((item) => item.id === ticket.phaseId) ?? null;
  const ticketStatusLabel =
    statusColumns.find((column) => column.key === ticket.status)?.label ?? ticket.status;
  const phaseWarning = findPhaseWarning(ticket, initiatives, tickets);
  const blockerTickets = (ticket.blockedBy ?? []).map((id) => tickets.find((t) => t.id === id)).filter(Boolean) as typeof tickets;
  const hasUnfinishedBlockers = blockerTickets.some((t) => t.status !== "done");
  const coverageReview =
    ticket.initiativeId
      ? planningReviews.find((item) => item.id === `${ticket.initiativeId}:ticket-coverage-review`) ?? null
      : null;
  const coverageArtifact =
    ticket.initiativeId
      ? ticketCoverageArtifacts.find((item) => item.initiativeId === ticket.initiativeId) ?? null
      : null;
  const coveredItems = coverageArtifact
    ? coverageArtifact.items.filter((item) => ticket.coverageItemIds.includes(item.id))
    : [];
  const groupedCoveredItems = coveredItems.reduce<Record<string, typeof coveredItems>>((acc, item) => {
    const key = item.sourceStep;
    acc[key] = [...(acc[key] ?? []), item];
    return acc;
  }, {});
  const coverageBlocked = Boolean(
    ticket.initiativeId && (!coverageReview || (coverageReview.status !== "passed" && coverageReview.status !== "overridden"))
  );
  const validTransitions = statusColumns.filter((col) => canTransition(ticket.status, col.key));

  const workflowPhase: WorkflowPhase =
    ticket.status === "done"
      ? "done"
      : verify.verificationResult
        ? "verify"
        : exportWf.exportResult || run
          ? "agent"
          : "export";

  const blockingIssues = [
    coverageBlocked && initiative
      ? {
          tone: "warn" as const,
          title: "Coverage",
          body: COVERAGE_GATE_MESSAGE,
          action: <Link to={`/initiative/${initiative.id}?step=tickets`}>Open tickets</Link>
        }
      : null,
    hasUnfinishedBlockers
      ? {
          tone: "warn" as const,
          title: "Blocked by",
          body: blockerTickets.map((blocker) => `${blocker.title} (${blocker.status})`).join(", "),
          action: null
        }
      : null,
  ] as Array<TicketPreflightIssue | null>;
  const noticeIssues = [
    phaseWarning.hasWarning
      ? {
          tone: "warn" as const,
          title: "Phase warning",
          body: phaseWarning.message,
          action: null
        }
      : null,
    operationState === "abandoned" || operationState === "superseded" || operationState === "failed"
      ? {
          tone: "warn" as const,
          title: "Last run ended early",
          body: `The last execution ended ${operationState}. Export a fresh bundle before you continue.`,
          action: null
        }
      : null,
    verify.verifyState === "reconnecting"
      ? {
          tone: "warn" as const,
          title: "Verification reconnecting",
          body: "The verification stream is reconnecting. Results will refresh automatically.",
          action: null
        }
      : null
  ] as Array<TicketPreflightIssue | null>;
  const visibleBlockingIssues = blockingIssues.filter((issue): issue is TicketPreflightIssue => issue !== null);
  const visibleNoticeIssues = noticeIssues.filter((issue): issue is TicketPreflightIssue => issue !== null);
  const startStageState: ExecutionStageState = visibleBlockingIssues.length > 0
    ? "future"
    : exportWf.exportResult || run
      ? "complete"
      : "active";
  const captureStageState: ExecutionStageState = visibleBlockingIssues.length > 0
    ? "future"
    : workflowPhase === "verify" || workflowPhase === "done"
      ? "complete"
      : exportWf.exportResult || run
        ? "active"
        : "future";
  const finishStageState: ExecutionStageState = visibleBlockingIssues.length > 0
    ? "future"
    : verify.verificationResult
      ? verify.verificationResult.overallPass
        ? "active"
        : "checkpoint"
      : latestAttempt
        ? latestAttempt.overallPass
          ? "active"
          : "checkpoint"
        : "future";
  const focusStage = visibleBlockingIssues.length > 0
    ? "blocked"
    : startStageState === "active"
      ? "start"
      : captureStageState === "active"
        ? "verify"
        : "close";
  const anchorSteps: TicketAnchorStep[] = [
    {
      label: "Start work",
      state: startStageState,
      summary: visibleBlockingIssues.length > 0
        ? "Opens after the blockers are cleared."
        : run
          ? `Bundle ready for ${run.agentType}.`
          : "Create the handoff bundle.",
    },
    {
      label: "Verify work",
      state: captureStageState,
      summary: captureStageState === "complete"
        ? "Checked against the ticket."
        : exportWf.exportResult || run
          ? "Refresh the changes when the work lands."
          : "Opens after work starts.",
    },
    {
      label: "Close ticket",
      state: finishStageState,
      summary: finishStageState === "future"
        ? "Opens after verification."
        : ticket.status === "done"
          ? "This ticket is done."
          : finishStageState === "checkpoint"
            ? "Decide what needs another pass."
            : "Ready to wrap up.",
    },
  ];

  return (
    <section className="ticket-journey">
      <header className="section-header ticket-journey-header">
        <div>
          <h2>{ticket.title}</h2>
        </div>
        <div className="button-row" style={{ marginBottom: 0 }}>
          {run ? <Link to={`/run/${run.id}`}>Open latest run</Link> : null}
          {initiative ? (
            <Link to={`/initiative/${initiative.id}?step=tickets`}>Back to tickets</Link>
          ) : null}
        </div>
      </header>

      <TicketAnchorCard
        contextLabel={initiative ? "Tickets" : "Quick task"}
        phaseName={phase?.name ?? "Quick task"}
        ticketStatusLabel={ticketStatusLabel}
        verificationLabel={getVerificationLabel(verify.verificationResult, latestAttempt)}
        fileTargetsCount={ticket.fileTargets.length}
        steps={anchorSteps}
        validTransitions={validTransitions}
        moveToStatus={moveToStatus}
        onMoveToStatusChange={setMoveToStatus}
        onUpdateStatus={async () => {
          if (!moveToStatus) {
            return;
          }

          try {
            await onMoveTicket(ticket.id, moveToStatus);
            setMoveToStatus("");
          } catch (error) {
            showError((error as Error).message ?? "We couldn't update the ticket status.");
          }
        }}
      />

      {visibleBlockingIssues.length > 0 ? (
        <TicketBlockersCard issues={visibleBlockingIssues} />
      ) : null}

      {visibleNoticeIssues.length > 0 ? (
        <TicketIssuesCard title="Heads up" issues={visibleNoticeIssues} />
      ) : null}

      {focusStage === "start" ? (
        <TicketFocusCard
          title="Start work"
          body="Create the handoff bundle, run your coding agent outside SpecFlow, and come back here when the work lands."
          state={startStageState}
        >
          <ExportSection
            workflowPhase={workflowPhase}
            agentTarget={exportWf.agentTarget}
            setAgentTarget={exportWf.setAgentTarget}
            exportResult={exportWf.exportResult}
            bundlePreview={exportWf.bundlePreview}
            bundlePreviewOpen={exportWf.bundlePreviewOpen}
            bundleTextLoading={exportWf.bundleTextLoading}
            copyFeedback={exportWf.copyFeedback}
            handleExport={exportWf.handleExport}
            handleCopyBundle={exportWf.handleCopyBundle}
            handleToggleBundlePreview={exportWf.handleToggleBundlePreview}
            handleDownloadBundle={exportWf.handleDownloadBundle}
            handleSaveZipBundle={exportWf.handleSaveZipBundle}
            desktopRuntime={exportWf.desktopRuntime}
            chrome="plain"
            showIntro={false}
          />
        </TicketFocusCard>
      ) : null}

      {focusStage === "verify" ? (
        <TicketFocusCard
          title="Verify work"
          body="Refresh the captured changes, check the main files, and verify the result against what this ticket needs to deliver."
          state={captureStageState}
        >
          {exportWf.exportResult ? (
            <ExportSection
              workflowPhase={workflowPhase}
              agentTarget={exportWf.agentTarget}
              setAgentTarget={exportWf.setAgentTarget}
              exportResult={exportWf.exportResult}
              bundlePreview={exportWf.bundlePreview}
              bundlePreviewOpen={exportWf.bundlePreviewOpen}
              bundleTextLoading={exportWf.bundleTextLoading}
              copyFeedback={exportWf.copyFeedback}
              handleExport={exportWf.handleExport}
              handleCopyBundle={exportWf.handleCopyBundle}
              handleToggleBundlePreview={exportWf.handleToggleBundlePreview}
              handleDownloadBundle={exportWf.handleDownloadBundle}
              handleSaveZipBundle={exportWf.handleSaveZipBundle}
              desktopRuntime={exportWf.desktopRuntime}
              chrome="plain"
              showIntro={false}
              showCreateControls={false}
            />
          ) : null}
          <CaptureVerifySection
            ticketId={ticket.id}
            workflowPhase={workflowPhase}
            captureScopeInput={capture.captureScopeInput}
            setCaptureScopeInput={capture.setCaptureScopeInput}
            widenedInput={capture.widenedInput}
            setWidenedInput={capture.setWidenedInput}
            capturePreviewData={capture.capturePreviewData}
            selectedNoGitPaths={capture.selectedNoGitPaths}
            setSelectedNoGitPaths={capture.setSelectedNoGitPaths}
            captureSummary={capture.captureSummary}
            setCaptureSummary={capture.setCaptureSummary}
            refreshCapturePreview={capture.refreshCapturePreview}
            verifyStreamEvents={verify.verifyStreamEvents}
            verifyState={verify.verifyState}
            setVerifyStreamEvents={verify.setVerifyStreamEvents}
            setVerifyState={verify.setVerifyState}
            setVerificationResult={verify.setVerificationResult}
            onRefresh={onRefresh}
            chrome="plain"
            showIntro={false}
          />
        </TicketFocusCard>
      ) : null}

      {focusStage === "close" ? (
        <TicketFocusCard
          title="Close ticket"
          body="Use the verification result to decide whether this ticket is done or whether it needs another pass."
          state={finishStageState}
        >
          {verify.verificationResult ? (
            <VerificationResultsSection
              ticketId={ticket.id}
              verificationResult={verify.verificationResult}
              attempts={attempts}
              fixForwardReady={exportWf.fixForwardReady}
              setFixForwardReady={exportWf.setFixForwardReady}
              handleReExportWithFindings={exportWf.handleReExportWithFindings}
              captureScopeInput={capture.captureScopeInput}
              widenedInput={capture.widenedInput}
              captureSummary={capture.captureSummary}
              setVerifyState={verify.setVerifyState}
              setVerifyStreamEvents={verify.setVerifyStreamEvents}
              setVerificationResult={verify.setVerificationResult}
              onRefresh={onRefresh}
              chrome="plain"
            />
          ) : latestAttempt ? (
            <p className="ticket-empty-note">
              The latest verification is recorded on the run. Open the latest run to review the full result.
            </p>
          ) : (
            <p className="ticket-empty-note">
              No verification result yet. Start the work, then come back here to verify and close the ticket.
            </p>
          )}
        </TicketFocusCard>
      ) : null}

      <TicketBriefCard ticket={ticket} groupedCoveredItems={groupedCoveredItems} />
    </section>
  );
};

export { COVERAGE_GATE_MESSAGE };
