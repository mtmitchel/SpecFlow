import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { VerificationResult } from "../../../types.js";
import { captureResults } from "../../../api.js";
import { WorkflowSection } from "../../components/workflow-section.js";
import { useToast } from "../../context/toast.js";
import type { TransportEvent } from "../../../api/transport.js";
import { parseScopeCsv } from "../../utils/scope-paths.js";

interface CaptureVerifySectionProps {
  ticketId: string;
  runId?: string | null;
  captureScopeInput: string;
  widenedInput: string;
  capturePreviewData: {
    source: "git" | "snapshot";
    defaultScope: string[];
    changedPaths: string[];
    primaryDiff: string;
    driftDiff: string | null;
  } | null;
  selectedNoGitPaths: string[];
  captureSummary: string;
  refreshCapturePreview: () => void;
  verifyState: "idle" | "running" | "reconnecting";
  setVerifyStreamEvents: (fn: (prev: string[]) => string[]) => void;
  setVerifyState: (state: "idle" | "running" | "reconnecting") => void;
  setVerificationResult: (result: VerificationResult | null) => void;
  onRefresh: () => Promise<void>;
  chrome?: "section" | "plain";
  showIntro?: boolean;
}

export const CaptureVerifySection = ({
  ticketId,
  runId = null,
  captureScopeInput,
  widenedInput,
  capturePreviewData,
  selectedNoGitPaths,
  captureSummary,
  refreshCapturePreview,
  verifyState,
  setVerifyStreamEvents,
  setVerifyState,
  setVerificationResult,
  onRefresh,
  chrome = "section",
  showIntro = true,
}: CaptureVerifySectionProps) => {
  const { showError } = useToast();
  const [autoVerifyError, setAutoVerifyError] = useState<string | null>(null);
  const autoVerificationKeyRef = useRef<string | null>(null);
  const changedPaths = capturePreviewData?.changedPaths ?? [];
  const hasReturnedWork = Boolean(
    capturePreviewData && (
      changedPaths.length > 0 ||
      capturePreviewData.primaryDiff.trim().length > 0 ||
      (capturePreviewData.driftDiff?.trim().length ?? 0) > 0
    )
  );
  const verificationTriggerKey = capturePreviewData
    ? `${ticketId}:${capturePreviewData.source}:${changedPaths.join("|")}:${capturePreviewData.primaryDiff.length}:${capturePreviewData.driftDiff?.length ?? 0}`
    : null;

  useEffect(() => {
    setAutoVerifyError(null);
  }, [capturePreviewData?.primaryDiff, capturePreviewData?.driftDiff]);

  const startVerification = useCallback(async (mode: "auto" | "manual" = "manual") => {
    setVerifyState("running");
    setVerifyStreamEvents(() => []);
    setAutoVerifyError(null);

    try {
      const widenedScopePaths = parseScopeCsv(widenedInput);
      const scopePaths =
        capturePreviewData?.source === "snapshot" && selectedNoGitPaths.length > 0
          ? selectedNoGitPaths
          : parseScopeCsv(captureScopeInput);

      const result = await captureResults(
        ticketId,
        captureSummary,
        scopePaths,
        widenedScopePaths,
        (event: TransportEvent) => {
          if (event.event !== "verify-token") {
            return;
          }

          const chunk = (event.payload as { chunk?: string }).chunk;
          if (chunk) {
            setVerifyStreamEvents((current) => [...current, chunk].slice(-200));
          }
        },
      );

      setVerificationResult(result);
      await onRefresh();
    } catch (err) {
      const message = (err as Error).message ?? "We couldn't verify the work.";
      setAutoVerifyError(message);
      if (mode === "manual") {
        autoVerificationKeyRef.current = null;
      }
      showError(message);
    } finally {
      setVerifyState("idle");
    }
  }, [
    capturePreviewData?.source,
    captureScopeInput,
    captureSummary,
    onRefresh,
    selectedNoGitPaths,
    setVerificationResult,
    setVerifyState,
    setVerifyStreamEvents,
    showError,
    ticketId,
    widenedInput,
  ]);

  useEffect(() => {
    if (!verificationTriggerKey || !hasReturnedWork || verifyState === "running") {
      return;
    }

    if (autoVerificationKeyRef.current === verificationTriggerKey) {
      return;
    }

    autoVerificationKeyRef.current = verificationTriggerKey;
    void startVerification("auto");
  }, [hasReturnedWork, startVerification, verificationTriggerKey, verifyState]);

  const secondaryActions =
    runId || autoVerifyError
      ? (
          <div className="button-row">
            {autoVerifyError ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  autoVerificationKeyRef.current = null;
                  void startVerification("manual");
                }}
              >
                Retry verification
              </button>
            ) : null}
            {runId ? <Link to={`/run/${runId}/review`}>Review changes</Link> : null}
            {runId ? <Link to={`/run/${runId}`}>View run report</Link> : null}
          </div>
        )
      : null;

  const content = (
    <>
      {showIntro ? (
        <p className="text-muted-sm" style={{ margin: 0 }}>
          SpecFlow is checking the returned work against this ticket.
        </p>
      ) : null}

      {capturePreviewData ? (
        <div className={`ticket-outcome-summary ${autoVerifyError ? "ticket-outcome-summary-warn" : ""}`}>
          <strong>
            {verifyState === "running"
              ? "Checking returned work."
              : autoVerifyError
                ? "Verification couldn't finish."
                : "Verification is starting."}
          </strong>
          <p>
            {verifyState === "running"
              ? "SpecFlow is comparing the returned work against the ticket's must-haves and checking for unexpected changes."
              : autoVerifyError
                ? autoVerifyError
                : "Returned work was detected. The verdict will appear here as soon as the check finishes."}
          </p>
        </div>
      ) : (
        <p className="ticket-empty-note">Preparing the verification context for this ticket.</p>
      )}

      {verifyState !== "running" ? (
        <div className="button-row">
          <button type="button" onClick={() => void refreshCapturePreview()}>
            Check again
          </button>
        </div>
      ) : null}

      {secondaryActions}
    </>
  );

  if (chrome === "plain") {
    return content;
  }

  return (
    <WorkflowSection title="Verification" defaultOpen>
      {content}
    </WorkflowSection>
  );
};
