import { useEffect, useRef, useState } from "react";
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

  const scopeRef = useRef(captureScopeInput);
  scopeRef.current = captureScopeInput;
  const widenedRef = useRef(widenedInput);
  widenedRef.current = widenedInput;

  useEffect(() => {
    setCapturePreviewData(null);
    setSelectedNoGitPaths([]);
    setCaptureSummary("");
    setWidenedInput("");
    setCaptureScopeInput(initialFileTargets.length > 0 ? initialFileTargets.join(", ") : "");
  }, [ticketId]);

  const fetchPreview = (
    tid: string,
    scope: string,
    widened: string,
    signal: AbortSignal
  ): void => {
    void capturePreview(tid, {
      scopePaths: parseScopeCsv(scope),
      widenedScopePaths: parseScopeCsv(widened),
      diffSource: { mode: "auto" }
    }).then((preview) => {
      if (signal.aborted) return;

      setCapturePreviewData(preview);

      if (!scope.trim() && preview.defaultScope.length > 0) {
        setCaptureScopeInput(preview.defaultScope.join(", "));
      }
    }).catch((err) => {
      if (signal.aborted) return;
      showError((err as Error).message ?? "Failed to load diff preview");
    });
  };

  useEffect(() => {
    if (!ticketId || !runId) return;

    const controller = new AbortController();
    fetchPreview(ticketId, scopeRef.current, widenedRef.current, controller.signal);

    return () => { controller.abort(); };
  }, [ticketId, runId]);

  useEffect(() => {
    if (!ticketId || !runId) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchPreview(ticketId, captureScopeInput, widenedInput, controller.signal);
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [captureScopeInput, widenedInput, ticketId, runId]);

  const refreshCapturePreview = (): void => {
    if (!ticketId) return;
    const controller = new AbortController();
    fetchPreview(ticketId, scopeRef.current, widenedRef.current, controller.signal);
  };

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
