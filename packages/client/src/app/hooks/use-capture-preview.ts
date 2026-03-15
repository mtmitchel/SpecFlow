import { useCallback, useEffect, useState } from "react";
import { capturePreview } from "../../api.js";
import { useToast } from "../context/toast.js";
import { parseScopeCsv } from "../utils/scope-paths.js";

interface CapturePreviewData {
  source: "git" | "snapshot";
  defaultScope: string[];
  changedPaths: string[];
  primaryDiff: string;
  driftDiff: string | null;
}

export const useCapturePreview = (
  ticketId: string | undefined,
  runId: string | undefined,
  initialFileTargets: string[]
) => {
  const { showError } = useToast();
  const [captureScopeInput, setCaptureScopeInput] = useState("");
  const [widenedInput, setWidenedInput] = useState("");
  const [capturePreviewData, setCapturePreviewData] = useState<CapturePreviewData | null>(null);
  const [selectedNoGitPaths, setSelectedNoGitPaths] = useState<string[]>([]);
  const [captureSummary, setCaptureSummary] = useState("");

  useEffect(() => {
    if (initialFileTargets.length > 0) {
      setCaptureScopeInput(initialFileTargets.join(", "));
    }
  }, [ticketId]);

  const refreshCapturePreview = useCallback(async (): Promise<void> => {
    if (!ticketId) {
      return;
    }

    try {
      const preview = await capturePreview(ticketId, {
        scopePaths: parseScopeCsv(captureScopeInput),
        widenedScopePaths: parseScopeCsv(widenedInput),
        diffSource: { mode: "auto" }
      });

      setCapturePreviewData(preview);

      if (!captureScopeInput.trim() && preview.defaultScope.length > 0) {
        setCaptureScopeInput(preview.defaultScope.join(", "));
      }
    } catch (err) {
      showError((err as Error).message ?? "Failed to load diff preview");
    }
  }, [ticketId, captureScopeInput, widenedInput, showError]);

  useEffect(() => {
    if (!ticketId || !runId) {
      return;
    }

    void refreshCapturePreview();
  }, [ticketId, runId, refreshCapturePreview]);

  useEffect(() => {
    if (!ticketId || !runId) {
      return;
    }

    const timer = setTimeout(() => {
      void refreshCapturePreview();
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [captureScopeInput, widenedInput, ticketId, runId, refreshCapturePreview]);

  return {
    captureScopeInput,
    setCaptureScopeInput,
    widenedInput,
    setWidenedInput,
    capturePreviewData,
    selectedNoGitPaths,
    setSelectedNoGitPaths,
    captureSummary,
    setCaptureSummary,
    refreshCapturePreview
  };
};
