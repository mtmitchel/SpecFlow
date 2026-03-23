import { useEffect, useRef, useState } from "react";
import { exportBundle, fetchBundleText, saveBundleZip } from "../../api.js";
import type { AgentTarget, VerificationResult } from "../../types.js";
import { useToast } from "../context/toast.js";

interface ExportResult {
  runId: string;
  attemptId: string;
  bundlePath: string;
  bundleText: string | null;
  bundleTextPrefix: string | null;
}

export const useExportWorkflow = (
  ticketId: string | undefined,
  onRefresh: () => Promise<void>,
  existingBundleAttempt?: { runId: string; attemptId: string } | null
) => {
  const { showError, showSuccess } = useToast();
  const [agentTarget, setAgentTarget] = useState<AgentTarget>("codex-cli");
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [bundlePreviewOpen, setBundlePreviewOpen] = useState(false);
  const [bundleTextLoading, setBundleTextLoading] = useState(false);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyBundlePrefix = (content: string, prefix: string | null): string =>
    prefix ? `${prefix}\n\n${content}` : content;

  const getActiveExportResult = (): ExportResult | null =>
    exportResult ??
    (existingBundleAttempt
      ? {
          runId: existingBundleAttempt.runId,
          attemptId: existingBundleAttempt.attemptId,
          bundlePath: "",
          bundleText: null,
          bundleTextPrefix: null
        }
      : null);

  useEffect(() => {
    setExportResult(null);
    setCopyFeedback(false);
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
    current = getActiveExportResult()
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
        if (!previous) {
          return {
            ...current,
            bundleText: rawContent
          };
        }

        if (previous.runId !== current.runId || previous.attemptId !== current.attemptId) {
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
      showSuccess("Bundle created.");
      await onRefresh();
    } catch (err) {
      showError((err as Error).message ?? "We couldn't create the bundle.");
    }
  };

  const handleReExportWithFindings = async (criteriaResults: VerificationResult["criteriaResults"]) => {
    if (!ticketId) return;
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
      showSuccess("Fix bundle created.");
      await onRefresh();
    } catch (err) {
      showError((err as Error).message ?? "We couldn't create the fix bundle.");
    }
  };

  const handleCopyBundle = async () => {
    const payload = await ensureBundleText();
    if (!payload) return;
    await navigator.clipboard.writeText(payload.content);
    setCopyFeedback(true);
    showSuccess("Bundle copied.");

    if (copyFeedbackTimerRef.current) {
      clearTimeout(copyFeedbackTimerRef.current);
    }

    copyFeedbackTimerRef.current = setTimeout(() => {
      copyFeedbackTimerRef.current = null;
      setCopyFeedback(false);
    }, 2000);
  };

  const handleToggleBundlePreview = async () => {
    const currentResult = getActiveExportResult();
    if (!currentResult) {
      return;
    }

    if (bundlePreviewOpen) {
      setBundlePreviewOpen(false);
      return;
    }

    try {
      const payload = await ensureBundleText(currentResult);
      if (!payload) {
        return;
      }

      setBundlePreviewOpen(true);
    } catch (err) {
      showError((err as Error).message ?? "We couldn't load the bundle.");
    }
  };

  const handleDownloadBundle = async () => {
    const currentResult = getActiveExportResult();
    if (!currentResult || !ticketId) {
      return;
    }

    try {
      const payload = await ensureBundleText(currentResult);
      if (!payload) {
        return;
      }

      downloadFlatBundle(payload.content, ticketId);
      showSuccess("Markdown bundle downloaded.");
    } catch (err) {
      showError((err as Error).message ?? "We couldn't download the Markdown bundle.");
    }
  };

  const handleSaveZipBundle = async () => {
    const currentResult = getActiveExportResult();
    if (!currentResult) {
      return;
    }

    try {
      const saved = await saveBundleZip(
        currentResult.runId,
        currentResult.attemptId,
        `${currentResult.runId}-${currentResult.attemptId}-bundle.zip`
      );
      if (saved) {
        showSuccess("ZIP bundle saved.");
      }
    } catch (err) {
      showError((err as Error).message ?? "We couldn't save the ZIP bundle.");
    }
  };

  const activeExportResult = getActiveExportResult();

  return {
    agentTarget,
    setAgentTarget,
    exportResult,
    activeExportResult,
    bundlePreview:
      activeExportResult && activeExportResult.bundleText !== null
        ? applyBundlePrefix(activeExportResult.bundleText, activeExportResult.bundleTextPrefix)
        : null,
    bundlePreviewOpen,
    bundleTextLoading,
    copyFeedback,
    handleExport,
    handleReExportWithFindings,
    handleCopyBundle,
    handleToggleBundlePreview,
    handleDownloadBundle,
    handleSaveZipBundle
  };
};
