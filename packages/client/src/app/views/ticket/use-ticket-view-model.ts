import { createElement, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Link, useParams } from "react-router-dom";
import { getTicketStatusTransitionGate } from "@specflow/shared-contracts";
import { fetchOperationStatus, fetchRunAttemptDetail } from "../../../api.js";
import type {
  Initiative,
  OperationState,
  PlanningReviewArtifact,
  Run,
  RunAttempt,
  RunAttemptDetail,
  Ticket,
  TicketStatus,
} from "../../../types.js";
import { useCapturePreview } from "../../hooks/use-capture-preview.js";
import { useExportWorkflow } from "../../hooks/use-export-workflow.js";
import { useVerificationStream } from "../../hooks/use-verification-stream.js";
import { getAvailableStatusOptions } from "../../constants/status-columns.js";
import { useToast } from "../../context/toast.js";
import { findPhaseWarning } from "../../utils/phase-warning.js";
import { applyInitiativeUpdate, type ApplySnapshotUpdate } from "../../utils/snapshot-updates.js";
import { usePersistInitiativeResumeTicket } from "../use-persist-initiative-resume-ticket.js";
import type {
  ExecutionStageState,
  TicketAnchorStep,
  TicketCriterionStatus,
  TicketPreflightIssue,
  TicketStageSummaryItem,
} from "./ticket-detail-sections.js";
import type { WorkflowPhase } from "./workflow.js";

interface TicketCaptureState {
  captureScopeInput: string;
  setCaptureScopeInput: (value: string) => void;
  widenedInput: string;
  setWidenedInput: (value: string) => void;
  capturePreviewData: {
    source: "git" | "snapshot";
    defaultScope: string[];
    changedPaths: string[];
    primaryDiff: string;
    driftDiff: string | null;
  } | null;
  selectedNoGitPaths: string[];
  setSelectedNoGitPaths: (value: string[]) => void;
  captureSummary: string;
  setCaptureSummary: (value: string) => void;
  refreshCapturePreview: () => void;
}

interface TicketExportWorkflowState {
  agentTarget: "claude-code" | "codex-cli" | "opencode" | "generic";
  setAgentTarget: (target: "claude-code" | "codex-cli" | "opencode" | "generic") => void;
  exportResult: { runId: string; attemptId: string; bundlePath: string; bundleText: string | null; bundleTextPrefix: string | null } | null;
  activeExportResult: { runId: string; attemptId: string; bundlePath: string; bundleText: string | null; bundleTextPrefix: string | null } | null;
  bundlePreview: string | null;
  bundlePreviewOpen: boolean;
  bundleTextLoading: boolean;
  copyFeedback: boolean;
  handleExport: () => Promise<void>;
  handleReExportWithFindings: (criteriaResults: import("../../../types.js").VerificationResult["criteriaResults"]) => Promise<void>;
  handleCopyBundle: () => Promise<void>;
  handleToggleBundlePreview: () => Promise<void>;
  handleDownloadBundle: () => Promise<void>;
  handleSaveZipBundle: () => Promise<void>;
}

interface TicketVerificationStreamState {
  verifyStreamEvents: string[];
  verificationResult: import("../../../types.js").VerificationResult | null;
  verifyState: "idle" | "running" | "reconnecting";
  setVerifyStreamEvents: Dispatch<SetStateAction<string[]>>;
  setVerificationResult: Dispatch<SetStateAction<import("../../../types.js").VerificationResult | null>>;
  setVerifyState: Dispatch<SetStateAction<"idle" | "running" | "reconnecting">>;
}

interface TicketViewModelLoaded {
  ticket: Ticket;
  initiative: Initiative | null;
  statusOptions: Array<{ value: string; label: string }>;
  statusUpdating: boolean;
  criterionStates: Record<string, TicketCriterionStatus>;
  anchorSteps: TicketAnchorStep[];
  visibleBlockingIssues: TicketPreflightIssue[];
  visibleNoticeIssues: TicketPreflightIssue[];
  focusStage: "blocked" | "handoff" | "verification";
  workflowPhase: WorkflowPhase;
  exportWorkflow: TicketExportWorkflowState;
  capture: TicketCaptureState;
  verify: TicketVerificationStreamState;
  handoffSummaryItems: TicketStageSummaryItem[];
  verificationPrepSummaryItems: TicketStageSummaryItem[];
  verificationSummaryItems: TicketStageSummaryItem[];
  verificationPassed: boolean;
  verificationResult: import("../../../types.js").VerificationResult | null;
  latestAttempt: RunAttempt | null;
  attempts: RunAttempt[];
  run: Run | undefined;
  nextTicketId: string | null;
  headerContextLabel: string;
  startStageState: ExecutionStageState;
  verificationStageState: ExecutionStageState;
  hasReturnedWork: boolean;
  handleStatusChange: (status: string) => Promise<void>;
  handleAcceptVerifiedWork: () => Promise<void>;
}

interface TicketViewModelNotFound {
  ticket: null;
}

type TicketViewModel = TicketViewModelLoaded | TicketViewModelNotFound;

export const COVERAGE_GATE_MESSAGE = "Run the coverage check before you start this ticket.";

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

export const useTicketViewModel = ({
  tickets,
  runs,
  runAttempts,
  initiatives,
  planningReviews,
  onRefresh,
  onApplySnapshotUpdate,
  onMoveTicket,
}: {
  tickets: Ticket[];
  runs: Run[];
  runAttempts: RunAttempt[];
  initiatives: Initiative[];
  planningReviews: PlanningReviewArtifact[];
  onRefresh: () => Promise<void>;
  onApplySnapshotUpdate: ApplySnapshotUpdate;
  onMoveTicket: (ticketId: string, status: TicketStatus) => Promise<void>;
}): TicketViewModel => {
  const params = useParams<{ id: string }>();
  const { showError } = useToast();
  const [operationState, setOperationState] = useState<OperationState | null>(null);
  const [committedAttemptDetail, setCommittedAttemptDetail] = useState<RunAttemptDetail | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const ticket = tickets.find((item) => item.id === params.id);
  const run = runs.find((item) => item.id === ticket?.runId);
  const attempts = runAttempts
    .filter((attempt) => run?.attempts.includes(attempt.attemptId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const latestAttempt = attempts[0] ?? null;
  const ticketStatusMap = new Map(
    tickets.map((candidate) => [candidate.id, { status: candidate.status }] as const),
  );
  const reviewStatusMap = new Map(
    planningReviews.map((review) => [review.id, { status: review.status }] as const),
  );
  const statusOptions = ticket
    ? getAvailableStatusOptions(ticket, ticketStatusMap, reviewStatusMap).map((column) => ({
        value: column.key,
        label: column.label,
      }))
    : [];

  const verify = useVerificationStream(params.id, run?.id, onRefresh);
  const capture = useCapturePreview(params.id, run?.id, ticket?.fileTargets ?? []);
  const exportWorkflow = useExportWorkflow(
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

    void fetchRunAttemptDetail(run.id, run.committedAttemptId)
      .then((attempt) => {
        if (!cancelled) {
          setCommittedAttemptDetail(attempt);
        }
      })
      .catch((error) => {
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
    onInitiativeUpdated: (updatedInitiative) => {
      onApplySnapshotUpdate((current) => applyInitiativeUpdate(current, updatedInitiative));
    },
    showError,
  });

  if (!ticket) {
    return { ticket: null };
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
  const blockerTickets = (ticket.blockedBy ?? [])
    .map((id) => tickets.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Ticket => Boolean(candidate));
  const hasUnfinishedBlockers = blockerTickets.some((candidate) => candidate.status !== "done");
  const coverageReview =
    ticket.initiativeId
      ? planningReviews.find((item) => item.id === `${ticket.initiativeId}:ticket-coverage-review`) ?? null
      : null;
  const coverageBlocked = Boolean(
    ticket.initiativeId && (!coverageReview || (coverageReview.status !== "passed" && coverageReview.status !== "overridden"))
  );
  const nextTicketId = getNextTicketId(initiative, tickets, ticket.id);
  const hasStartedWork = Boolean(exportWorkflow.activeExportResult || run);
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
          action: createElement(
            Link,
            { to: `/initiative/${initiative.id}?step=tickets` },
            "Open tickets"
          )
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
    const transitionGate = getTicketStatusTransitionGate(
      ticket,
      nextStatus,
      reviewStatusMap,
      ticketStatusMap,
    );
    if (!transitionGate.allowed) {
      showError(transitionGate.message);
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

  return {
    ticket,
    initiative,
    statusOptions,
    statusUpdating,
    criterionStates,
    anchorSteps,
    visibleBlockingIssues,
    visibleNoticeIssues,
    focusStage,
    workflowPhase,
    exportWorkflow,
    capture,
    verify,
    handoffSummaryItems,
    verificationPrepSummaryItems,
    verificationSummaryItems,
    verificationPassed,
    verificationResult,
    latestAttempt,
    attempts,
    run,
    nextTicketId,
    headerContextLabel,
    startStageState,
    verificationStageState,
    hasReturnedWork,
    handleStatusChange,
    handleAcceptVerifiedWork,
  };
};
