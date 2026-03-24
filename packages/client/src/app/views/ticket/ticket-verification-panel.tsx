import type { RunAttempt, TicketStatus, VerificationResult } from "../../../types.js";
import { CaptureVerifySection } from "./capture-verify-section.js";
import {
  TicketFocusCard,
  type ExecutionStageState,
  type TicketPreflightIssue,
  type TicketStageSummaryItem,
} from "./ticket-detail-sections.js";
import { VerificationResultsSection } from "./verification-results-section.js";

interface TicketVerificationPanelProps {
  verificationPassed: boolean;
  ticketStatus: TicketStatus;
  stageState: ExecutionStageState;
  noticeIssues: TicketPreflightIssue[];
  summaryItems: TicketStageSummaryItem[];
  prepSummaryItems: TicketStageSummaryItem[];
  verificationResult: VerificationResult | null;
  latestAttempt: {
    overallPass: boolean;
  } | null;
  hasReturnedWork: boolean;
  ticketId: string;
  runId: string | null;
  attempts: RunAttempt[];
  exportWorkflow: {
    handleReExportWithFindings?: (criteriaResults: VerificationResult["criteriaResults"]) => Promise<void>;
  };
  capture: {
    captureScopeInput?: string;
    widenedInput?: string;
    capturePreviewData?: {
      source: "git" | "snapshot";
      defaultScope: string[];
      changedPaths: string[];
      primaryDiff: string;
      driftDiff: string | null;
    } | null;
    selectedNoGitPaths?: string[];
    captureSummary?: string;
    refreshCapturePreview: () => void;
  };
  verify: {
    verifyState: "idle" | "running" | "reconnecting";
    setVerifyStreamEvents?: (fn: (prev: string[]) => string[]) => void;
    setVerifyState?: (state: "idle" | "running" | "reconnecting") => void;
    setVerificationResult?: (result: VerificationResult | null) => void;
  };
  onAccept: () => Promise<void>;
  acceptPending: boolean;
  onRefresh: () => Promise<void>;
  nextTicketId: string | null;
}

export const TicketVerificationPanel = ({
  verificationPassed,
  ticketStatus,
  stageState,
  noticeIssues,
  summaryItems,
  prepSummaryItems,
  verificationResult,
  latestAttempt,
  hasReturnedWork,
  ticketId,
  runId,
  attempts,
  exportWorkflow,
  capture,
  verify,
  onAccept,
  acceptPending,
  onRefresh,
  nextTicketId,
}: TicketVerificationPanelProps) => (
  <TicketFocusCard
    title="Verification"
    body={
      verificationPassed
        ? ticketStatus === "done"
          ? "SpecFlow checked this run and the ticket is complete."
          : "SpecFlow checked this run and found no blocking issues."
        : verificationResult
          ? "SpecFlow checked the return against this ticket and found issues that need another pass."
          : "SpecFlow is checking the returned work against this ticket now."
    }
    state={stageState}
    variant="verification"
    issues={noticeIssues}
    summaryItems={verificationResult ? summaryItems : prepSummaryItems}
  >
    {verificationResult ? (
      <VerificationResultsSection
        ticketId={ticketId}
        runId={runId}
        ticketStatus={ticketStatus}
        verificationResult={verificationResult}
        attempts={attempts}
        handleReExportWithFindings={exportWorkflow.handleReExportWithFindings ?? (async () => undefined)}
        handleAccept={onAccept}
        acceptPending={acceptPending}
        onRefresh={onRefresh}
        nextTicketId={nextTicketId}
        chrome="plain"
      />
    ) : hasReturnedWork ? (
      <CaptureVerifySection
        ticketId={ticketId}
        runId={runId}
        captureScopeInput={capture.captureScopeInput ?? ""}
        widenedInput={capture.widenedInput ?? ""}
        capturePreviewData={capture.capturePreviewData ?? null}
        selectedNoGitPaths={capture.selectedNoGitPaths ?? []}
        captureSummary={capture.captureSummary ?? ""}
        refreshCapturePreview={capture.refreshCapturePreview}
        verifyState={verify.verifyState}
        setVerifyStreamEvents={verify.setVerifyStreamEvents ?? (() => undefined)}
        setVerifyState={verify.setVerifyState ?? (() => undefined)}
        setVerificationResult={verify.setVerificationResult ?? (() => undefined)}
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
);
