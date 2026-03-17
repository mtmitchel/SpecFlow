import { useEffect, useRef, useState } from "react";
import { exportBundle, saveBundleZip } from "../../api.js";
import type { AgentTarget, VerificationResult } from "../../types.js";
import { useToast } from "../context/toast.js";
import { isDesktopRuntime } from "../../api/transport.js";

interface ExportResult {
  runId: string;
  attemptId: string;
  flatString: string;
  bundlePath: string;
}

export const useExportWorkflow = (
  ticketId: string | undefined,
  onRefresh: () => Promise<void>
) => {
  const { showError, showSuccess } = useToast();
  const [agentTarget, setAgentTarget] = useState<AgentTarget>("codex-cli");
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [fixForwardReady, setFixForwardReady] = useState(false);
  const downloadUrlRef = useRef<string | null>(null);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setExportResult(null);
    setCopyFeedback(false);
    setFixForwardReady(false);

    if (copyFeedbackTimerRef.current) {
      clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = null;
    }

    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
      setDownloadUrl(null);
    }

    return () => {
      if (copyFeedbackTimerRef.current) {
        clearTimeout(copyFeedbackTimerRef.current);
        copyFeedbackTimerRef.current = null;
      }

      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
        downloadUrlRef.current = null;
      }
    };
  }, [ticketId]);

  const handleExport = async () => {
    if (!ticketId) return;
    try {
      const exported = await exportBundle(ticketId, agentTarget);
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
      }

      const blob = new Blob([exported.flatString], { type: "text/plain" });
      const nextUrl = URL.createObjectURL(blob);
      downloadUrlRef.current = nextUrl;
      setDownloadUrl(nextUrl);
      setExportResult({
        runId: exported.runId,
        attemptId: exported.attemptId,
        flatString: exported.flatString,
        bundlePath: exported.bundlePath
      });
      showSuccess("Bundle exported");
      await onRefresh();
    } catch (err) {
      showError((err as Error).message ?? "Export failed");
    }
  };

  const handleReExportWithFindings = async (criteriaResults: VerificationResult["criteriaResults"]) => {
    if (!ticketId) return;
    setFixForwardReady(false);
    try {
      const exported = await exportBundle(ticketId, agentTarget, "quick-fix");
      const failureLines = criteriaResults
        .filter((criterion) => !criterion.pass)
        .map((criterion) => {
          const hint = criterion.remediationHint ? ` Fix: ${criterion.remediationHint}` : "";
          return `- [${criterion.severity ?? ""}] ${criterion.criterionId}: ${criterion.evidence}${hint}`;
        });

      const enrichedFlat =
        failureLines.length > 0
          ? `# Verification Failure Context\n${failureLines.join("\n")}\n\n${exported.flatString}`
          : exported.flatString;
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
      }
      const nextUrl = URL.createObjectURL(new Blob([enrichedFlat], { type: "text/plain" }));
      downloadUrlRef.current = nextUrl;
      setDownloadUrl(nextUrl);
      setExportResult({
        runId: exported.runId,
        attemptId: exported.attemptId,
        flatString: enrichedFlat,
        bundlePath: exported.bundlePath
      });
      setFixForwardReady(true);
      showSuccess("Fix-forward bundle exported");
      await onRefresh();
    } catch (err) {
      showError((err as Error).message ?? "Re-export failed");
    }
  };

  const handleCopyBundle = () => {
    if (!exportResult) return;
    void navigator.clipboard.writeText(exportResult.flatString);
    setCopyFeedback(true);
    showSuccess("Bundle copied to clipboard");

    if (copyFeedbackTimerRef.current) {
      clearTimeout(copyFeedbackTimerRef.current);
    }

    copyFeedbackTimerRef.current = setTimeout(() => {
      copyFeedbackTimerRef.current = null;
      setCopyFeedback(false);
    }, 2000);
  };

  const handleSaveZipBundle = async () => {
    if (!exportResult) {
      return;
    }

    try {
      const savedPath = await saveBundleZip(
        exportResult.runId,
        exportResult.attemptId,
        `${exportResult.runId}-${exportResult.attemptId}-bundle.zip`
      );
      if (savedPath) {
        showSuccess("ZIP bundle saved");
      }
    } catch (err) {
      showError((err as Error).message ?? "ZIP export failed");
    }
  };

  return {
    agentTarget,
    setAgentTarget,
    exportResult,
    downloadUrl,
    copyFeedback,
    fixForwardReady,
    setFixForwardReady,
    handleExport,
    handleReExportWithFindings,
    handleCopyBundle,
    handleSaveZipBundle,
    desktopRuntime: isDesktopRuntime()
  };
};
