import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchOperationStatus, fetchRunAttemptDetail } from "../../api.js";
import type {
  Initiative,
  PlanningReviewArtifact,
  Run,
  RunAttempt,
  RunAttemptDetail,
  Ticket,
  TicketCoverageArtifact,
  TicketStatus,
} from "../../types.js";
import { useToast } from "../context/toast.js";
import { statusColumns } from "../constants/status-columns.js";
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
  type TicketCriterionStatus,
  type TicketPreflightIssue,
  type TicketStageSummaryItem,
  type TicketAnchorStep,
  type ExecutionStageState,
} from "./ticket/ticket-detail-sections.js";
import { VerificationResultsSection } from "./ticket/verification-results-section.js";
import type { WorkflowPhase } from "./ticket/workflow.js";
import { usePersistInitiativeResumeTicket } from "./use-persist-initiative-resume-ticket.js";

const COVERAGE_GATE_MESSAGE = "Run the coverage check before you start this ticket.";

const formatAgentTarget = (value: string): string => {
  if (value === "claude-code") {
    return "Claude Code";
  }

  if (value === "codex-cli") {
    return "Codex CLI";
  }

  if (value === "opencode") {
    return "OpenCode";
  }

  return "Generic";
};

const getNextTicketId = (
  initiative: Initiative | null,
  tickets: Ticket[],
  currentTicketId: string,
): string | null => {
  if (!initiative) {
    return null;
  }

  const orderedTickets = initiative.ticketIds
    .map((id) => tickets.find((ticket) => ticket.id === id))
    .filter((ticket): ticket is Ticket => Boolean(ticket));
  const currentIndex = orderedTickets.findIndex((ticket) => ticket.id === currentTicketId);
  const remainingTickets = orderedTickets.slice(currentIndex + 1);
  const nextInOrder = remainingTickets.find((ticket) => ticket.status !== "done");

  if (nextInOrder) {
    return nextInOrder.id;
  }

  return orderedTickets.find((ticket) => ticket.id !== currentTicketId && ticket.status !== "done")?.id ?? null;
};

export const TicketView = ({
  tickets,
  runs,
  runAttempts,
  initiatives,
  planningReviews,
  ticketCoverageArtifacts: _ticketCoverageArtifacts,
  onRefresh,
  onMoveTicket,
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
  const [committedAttemptDetail, setCommittedAttemptDetail] = useState<RunAttemptDetail | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const ticket = tickets.find((item) => item.id === params.id);
  const run = runs.find((item) => item.id === ticket?.runId);
  const attempts = runAttempts
    .filter((attempt) => run?.attempts.includes(attempt.attemptId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const latestAttempt = attempts[0] ?? null;

  const verify = useVerificationStream(params.id, run?.id, onRefresh);
  const capture = useCapturePreview(params.id, run?.id, ticket?.fileTargets ?? []);
  const exportWf = useExportWorkflow(
    params.id,
    onRefresh,
    ticket?.status === "in-progress" && run?.committedAttemptId
      ? { runId: run.id, attemptId: run.committedAttemptId }
      : null,
  );

  useEffect(() => {
    if (!run?.activeOperationId) {
      setOperationState(null);
      return;
    }

    void fetchOperationStatus(run.activeOperationId).then((status) => {
      setOperationState(status?.state ?? null);
    });
  }, [run?.activeOperationId]);

  useEffect(() => {
    if (!run?.id || !run.committedAttemptId) {
      setCommittedAttemptDetail(null);
      return;
    }

    let cancelled = false;

    void fetchRunAttemptDetail(run.id, run.committedAttemptId).then((attempt) => {
      if (!cancelled) {
        setCommittedAttemptDetail(attempt);
      }
    }).catch((error) => {
      if (cancelled) {
        return;
      }

      setCommittedAttemptDetail(null);
      showError((error as Error).message ?? "We couldn't load the latest verification detail.");
    });

    return () => {
      cancelled = true;
    };
  }, [run?.committedAttemptId, run?.id, showError]);

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
  const verificationResult = verify.verificationResult ?? (
    committedAttemptDetail
      ? {
          overallPass: committedAttemptDetail.overallPass,
          criteriaResults: committedAttemptDetail.criteriaResults,
          driftFlags: committedAttemptDetail.driftFlags,
        }
      : null
  );
  const phaseWarning = findPhaseWarning(ticket, initiatives, tickets);
  const blockerTickets = (ticket.blockedBy ?? []).map((id) => tickets.find((t) => t.id === id)).filter(Boolean) as typeof tickets;
  const hasUnfinishedBlockers = blockerTickets.some((t) => t.status !== "done");
  const coverageReview =
    ticket.initiativeId
      ? planningReviews.find((item) => item.id === `${ticket.initiativeId}:ticket-coverage-review`) ?? null
      : null;
  const coverageBlocked = Boolean(
    ticket.initiativeId && (!coverageReview || (coverageReview.status !== "passed" && coverageReview.status !== "overridden"))
  );
  const nextTicketId = getNextTicketId(initiative, tickets, ticket.id);
  const hasStartedWork = Boolean(exportWf.activeExportResult || run);
  const hasVerificationResult = Boolean(verificationResult || latestAttempt);
  const statusResetsExecutionWorkspace = ticket.status === "backlog" || ticket.status === "ready";
  const capturePreview = capture.capturePreviewData;
  const hasReturnedWork = Boolean(
    capturePreview && (
      capturePreview.changedPaths.length > 0 ||
      capturePreview.primaryDiff.trim().length > 0 ||
      (capturePreview.driftDiff?.trim().length ?? 0) > 0
    )
  );
  const reviewChangedFiles = capturePreview?.changedPaths.length
    ? capturePreview.changedPaths.length
    : (capturePreview?.defaultScope.length ?? 0);
  const reviewHasDrift = Boolean(capturePreview?.driftDiff && capturePreview.driftDiff.trim().length > 0);
  const criterionStates = ticket.acceptanceCriteria.reduce<Record<string, TicketCriterionStatus>>((acc, criterion) => {
    acc[criterion.id] = "pending";
    return acc;
  }, {});
  for (const criterion of verificationResult?.criteriaResults ?? []) {
    criterionStates[criterion.criterionId] = criterion.pass ? "pass" : "fail";
  }
  const verificationPassed = verificationResult?.overallPass ?? latestAttempt?.overallPass ?? false;

  const workflowPhase: WorkflowPhase =
    hasVerificationResult
      ? "verify"
      : hasStartedWork
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
    : statusResetsExecutionWorkspace
      ? "active"
    : hasStartedWork
      ? "complete"
      : "active";
  const verificationStageState: ExecutionStageState = visibleBlockingIssues.length > 0
    ? "future"
    : statusResetsExecutionWorkspace
      ? "future"
    : hasReturnedWork && !hasVerificationResult
      ? "active"
    : verificationResult
      ? verificationResult.overallPass
        ? "complete"
        : "checkpoint"
      : latestAttempt
        ? latestAttempt.overallPass
          ? "complete"
          : "checkpoint"
        : "future";
  const focusStage = visibleBlockingIssues.length > 0
    ? "blocked"
    : statusResetsExecutionWorkspace
      ? "handoff"
    : !hasStartedWork || (!hasReturnedWork && !hasVerificationResult)
      ? "handoff"
      : "verification";
  const anchorSteps: TicketAnchorStep[] = [
    {
      label: "Handoff",
      state: startStageState,
    },
    {
      label: "Verification",
      state: verificationStageState,
    },
  ];
  const handoffSummaryItems: TicketStageSummaryItem[] = [
    {
      label: "Agent",
      value: formatAgentTarget(exportWf.agentTarget),
    },
    {
      label: "Scope",
      value: `${ticket.fileTargets.length} scoped`,
    },
  ];
  const verificationPrepSummaryItems: TicketStageSummaryItem[] = [
    {
      label: "Changed files",
      value: reviewChangedFiles === 0 ? "No main-scope changes" : `${reviewChangedFiles} in scope`,
    },
    {
      label: "Unexpected changes",
      value: reviewHasDrift ? "Detected" : "None detected",
      tone: reviewHasDrift ? "warn" : "success",
    },
  ];
  const verificationSummaryItems: TicketStageSummaryItem[] = verificationResult
      ? [
          {
            label: "Verdict",
            value: verificationResult.overallPass ? "Pass" : "Needs fixes",
            tone: verificationResult.overallPass ? "success" : "warn",
          },
          {
            label: "Changed files",
            value: reviewChangedFiles === 0 ? "Captured on the run" : `${reviewChangedFiles} in scope`,
          },
          {
            label: "Unexpected changes",
            value: verificationResult.driftFlags.length === 0 ? "None detected" : `${verificationResult.driftFlags.length} flagged`,
            tone: verificationResult.driftFlags.length > 0 ? "warn" : "success",
          },
        ]
    : latestAttempt
      ? [
          {
            label: "Verdict",
            value: latestAttempt.overallPass ? "Pass" : "Fail",
            tone: latestAttempt.overallPass ? "success" : "warn",
          },
          {
            label: "Changed files",
            value: "Captured on the run",
          },
        ]
      : [
          {
            label: "Changed files",
            value: "Waiting for return",
          },
        ];

  const handleStatusChange = async (status: string): Promise<void> => {
    const nextStatus = status as TicketStatus;
    if (nextStatus === ticket.status) {
      return;
    }

    setStatusUpdating(true);
    try {
      await onMoveTicket(ticket.id, nextStatus);
    } finally {
      setStatusUpdating(false);
    }
  };
  const handleAcceptVerifiedWork = async (): Promise<void> => {
    if (ticket.status === "done") {
      return;
    }

    await handleStatusChange("done");
  };
  const headerContextLabel = phase
    ? `Brief / ${phase.name}`
    : initiative
      ? `Brief / ${initiative.title}`
      : "Quick task";

  return (
    <section className="ticket-journey">
      <header className="ticket-journey-header">
        <div className="ticket-journey-title">
          <h2 className="ticket-visually-hidden">{ticket.title}</h2>
          <p className="ticket-journey-context">{headerContextLabel}</p>
        </div>
        <div className="ticket-journey-header-actions">
          {initiative ? (
            <Link to={`/initiative/${initiative.id}?step=tickets`}>Back to tickets</Link>
          ) : null}
        </div>
      </header>

      <div className="ticket-content-card">
        <div className="ticket-workbench">
          <TicketBriefCard
            ticket={ticket}
            criterionStates={criterionStates}
            status={ticket.status}
            statusOptions={statusColumns.map((column) => ({ value: column.key, label: column.label }))}
            onStatusChange={(value) => {
              void handleStatusChange(value);
            }}
            statusUpdating={statusUpdating}
          />

          <div className="ticket-workbench-main">
            <TicketAnchorCard steps={anchorSteps} />

            {visibleBlockingIssues.length > 0 ? (
              <TicketBlockersCard issues={visibleBlockingIssues} />
            ) : null}

            {focusStage === "handoff" ? (
              <TicketFocusCard
                title="Handoff"
                body={
                  exportWf.activeExportResult
                    ? "Bundle ready. Run the agent outside SpecFlow and check back here when the work lands."
                    : "Choose an agent, create the bundle, and run the work outside SpecFlow."
                }
                state={startStageState}
                variant="handoff"
                issues={visibleNoticeIssues}
                summaryItems={handoffSummaryItems}
                actions={
                  exportWf.activeExportResult ? (
                    <button type="button" className="inline-action" onClick={() => void capture.refreshCapturePreview()}>
                      Check for return
                    </button>
                  ) : null
                }
              >
                {exportWf.activeExportResult ? (
                  <ExportSection
                    workflowPhase={workflowPhase}
                    agentTarget={exportWf.agentTarget}
                    setAgentTarget={exportWf.setAgentTarget}
                    exportResult={exportWf.activeExportResult}
                    bundlePreview={exportWf.bundlePreview}
                    bundlePreviewOpen={exportWf.bundlePreviewOpen}
                    bundleTextLoading={exportWf.bundleTextLoading}
                    copyFeedback={exportWf.copyFeedback}
                    handleExport={exportWf.handleExport}
                    handleCopyBundle={exportWf.handleCopyBundle}
                    handleToggleBundlePreview={exportWf.handleToggleBundlePreview}
                    handleDownloadBundle={exportWf.handleDownloadBundle}
                    handleSaveZipBundle={exportWf.handleSaveZipBundle}
                    chrome="plain"
                    showIntro={false}
                    showCreateControls={false}
                    collapseUtilities
                    utilityMenuLabel="Bundle tools"
                  />
                ) : (
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
                    chrome="plain"
                    showIntro={false}
                  />
                )}
              </TicketFocusCard>
            ) : null}

            {focusStage === "verification" ? (
              <TicketFocusCard
                title="Verification"
                body={
                  verificationPassed
                    ? ticket.status === "done"
                      ? "SpecFlow checked this run and the ticket is complete."
                      : "SpecFlow checked this run and found no blocking issues."
                    : hasVerificationResult
                      ? "SpecFlow checked the return against this ticket and found issues that need another pass."
                      : "SpecFlow is checking the returned work against this ticket now."
                }
                state={verificationStageState}
                variant="verification"
                issues={visibleNoticeIssues}
                summaryItems={hasVerificationResult ? verificationSummaryItems : verificationPrepSummaryItems}
              >
                {verificationResult ? (
                  <VerificationResultsSection
                    ticketId={ticket.id}
                    runId={run?.id ?? null}
                    ticketStatus={ticket.status}
                    verificationResult={verificationResult}
                    attempts={attempts}
                    handleReExportWithFindings={exportWf.handleReExportWithFindings}
                    handleAccept={handleAcceptVerifiedWork}
                    acceptPending={statusUpdating}
                    onRefresh={onRefresh}
                    nextTicketId={nextTicketId}
                    chrome="plain"
                  />
                ) : hasReturnedWork ? (
                  <CaptureVerifySection
                    ticketId={ticket.id}
                    runId={run?.id ?? null}
                    captureScopeInput={capture.captureScopeInput}
                    widenedInput={capture.widenedInput}
                    capturePreviewData={capture.capturePreviewData}
                    selectedNoGitPaths={capture.selectedNoGitPaths}
                    captureSummary={capture.captureSummary}
                    refreshCapturePreview={capture.refreshCapturePreview}
                    verifyState={verify.verifyState}
                    setVerifyStreamEvents={verify.setVerifyStreamEvents}
                    setVerifyState={verify.setVerifyState}
                    setVerificationResult={verify.setVerificationResult}
                    onRefresh={onRefresh}
                    chrome="plain"
                    showIntro={false}
                  />
                ) : latestAttempt ? (
                  <p className="ticket-empty-note">
                    The latest verification is recorded on the run. Open the run report to review the saved result.
                  </p>
                ) : (
                  <p className="ticket-empty-note">
                    No returned work is ready yet. Finish the handoff and come back when the work lands.
                  </p>
                )}
              </TicketFocusCard>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export { COVERAGE_GATE_MESSAGE };
