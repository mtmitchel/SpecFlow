import { useEffect, useRef, useState } from "react";
import { exportBundle, fetchBundleText, saveBundleZip } from "../../api.js";
import type { AgentTarget, VerificationResult } from "../../types.js";
import { useToast } from "../context/toast.js";
import { isDesktopRuntime } from "../../api/transport.js";

interface ExportResult {
  runId: string;
  attemptId: string;
  bundlePath: string;
  bundleText: string | null;
  bundleTextPrefix: string | null;
}

export const useExportWorkflow = (
  ticketId: string | undefined,
  onRefresh: () => Promise<void>
) => {
  const { showError, showSuccess } = useToast();
  const [agentTarget, setAgentTarget] = useState<AgentTarget>("codex-cli");
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [fixForwardReady, setFixForwardReady] = useState(false);
  const [bundlePreviewOpen, setBundlePreviewOpen] = useState(false);
  const [bundleTextLoading, setBundleTextLoading] = useState(false);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyBundlePrefix = (content: string, prefix: string | null): string =>
    prefix ? `${prefix}\n\n${content}` : content;

  useEffect(() => {
    setExportResult(null);
    setCopyFeedback(false);
    setFixForwardReady(false);
    setBundlePreviewOpen(false);
    setBundleTextLoading(false);

    return () => {
      if (copyFeedbackTimerRef.current) {
        clearTimeout(copyFeedbackTimerRef.current);
        copyFeedbackTimerRef.current = null;
      }
    };
  }, [ticketId]);

  const ensureBundleText = async (
    current = exportResult
  ): Promise<{ content: string; rawContent: string } | null> => {
    if (!current) {
      return null;
    }

    if (current.bundleText !== null) {
      return {
        rawContent: current.bundleText,
        content: applyBundlePrefix(current.bundleText, current.bundleTextPrefix)
      };
    }

    setBundleTextLoading(true);
    try {
      const rawContent = await fetchBundleText(current.runId, current.attemptId);
      setExportResult((previous) => {
        if (!previous || previous.runId !== current.runId || previous.attemptId !== current.attemptId) {
          return previous;
        }

        return {
          ...previous,
          bundleText: rawContent
        };
      });

      return {
        rawContent,
        content: applyBundlePrefix(rawContent, current.bundleTextPrefix)
      };
    } finally {
      setBundleTextLoading(false);
    }
  };

  const downloadFlatBundle = (content: string, ticketSlug: string): void => {
    const objectUrl = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${ticketSlug}-bundle-flat.md`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const handleExport = async () => {
    if (!ticketId) return;
    try {
      const exported = await exportBundle(ticketId, agentTarget);
      setExportResult({
        runId: exported.runId,
        attemptId: exported.attemptId,
        bundlePath: exported.bundlePath,
        bundleText: null,
        bundleTextPrefix: null
      });
      setBundlePreviewOpen(false);
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

      setExportResult({
        runId: exported.runId,
        attemptId: exported.attemptId,
        bundlePath: exported.bundlePath,
        bundleText: null,
        bundleTextPrefix:
          failureLines.length > 0 ? `# Verification Failure Context\n${failureLines.join("\n")}` : null
      });
      setBundlePreviewOpen(false);
      setFixForwardReady(true);
      showSuccess("Fix-forward bundle exported");
      await onRefresh();
    } catch (err) {
      showError((err as Error).message ?? "Re-export failed");
    }
  };

  const handleCopyBundle = async () => {
    const payload = await ensureBundleText();
    if (!payload) return;
    await navigator.clipboard.writeText(payload.content);
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

  const handleToggleBundlePreview = async () => {
    if (!exportResult) {
      return;
    }

    if (bundlePreviewOpen) {
      setBundlePreviewOpen(false);
      return;
    }

    try {
      const payload = await ensureBundleText(exportResult);
      if (!payload) {
        return;
      }

      setBundlePreviewOpen(true);
    } catch (err) {
      showError((err as Error).message ?? "Failed to load bundle");
    }
  };

  const handleDownloadBundle = async () => {
    if (!exportResult || !ticketId) {
      return;
    }

    try {
      const payload = await ensureBundleText(exportResult);
      if (!payload) {
        return;
      }

      downloadFlatBundle(payload.content, ticketId);
      showSuccess("Flat bundle downloaded");
    } catch (err) {
      showError((err as Error).message ?? "Flat bundle download failed");
    }
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
    bundlePreview:
      exportResult && exportResult.bundleText !== null
        ? applyBundlePrefix(exportResult.bundleText, exportResult.bundleTextPrefix)
        : null,
    bundlePreviewOpen,
    bundleTextLoading,
    copyFeedback,
    fixForwardReady,
    setFixForwardReady,
    handleExport,
    handleReExportWithFindings,
    handleCopyBundle,
    handleToggleBundlePreview,
    handleDownloadBundle,
    handleSaveZipBundle,
    desktopRuntime: isDesktopRuntime()
  };
};
