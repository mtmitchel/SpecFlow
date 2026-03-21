import { useCallback, useEffect, useRef, useState } from "react";
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
  const activePreviewControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setCapturePreviewData(null);
    setSelectedNoGitPaths([]);
    setCaptureSummary("");
    setWidenedInput("");
    setCaptureScopeInput(initialFileTargets.length > 0 ? initialFileTargets.join(", ") : "");
  }, [initialFileTargets, ticketId]);

  const fetchPreview = useCallback((
    tid: string,
    scope: string,
    widened: string,
    signal: AbortSignal
  ): void => {
    void capturePreview(tid, {
      scopePaths: parseScopeCsv(scope),
      widenedScopePaths: parseScopeCsv(widened),
      diffSource: { mode: "auto" }
    }, { signal }).then((preview) => {
      if (signal.aborted) return;

      setCapturePreviewData(preview);

      if (!scope.trim() && preview.defaultScope.length > 0) {
        setCaptureScopeInput(preview.defaultScope.join(", "));
      }
    }).catch((err) => {
      if (signal.aborted) return;
      showError((err as Error).message ?? "We couldn't load the change preview.");
    });
  }, [showError]);

  const replaceActivePreviewController = useCallback((controller: AbortController): void => {
    activePreviewControllerRef.current?.abort();
    activePreviewControllerRef.current = controller;
  }, []);

  useEffect(() => {
    if (!ticketId || !runId) return;

    const controller = new AbortController();
    replaceActivePreviewController(controller);
    fetchPreview(ticketId, scopeRef.current, widenedRef.current, controller.signal);

    return () => {
      if (activePreviewControllerRef.current === controller) {
        activePreviewControllerRef.current = null;
      }
      controller.abort();
    };
  }, [fetchPreview, replaceActivePreviewController, runId, ticketId]);

  useEffect(() => {
    if (!ticketId || !runId) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      replaceActivePreviewController(controller);
      fetchPreview(ticketId, captureScopeInput, widenedInput, controller.signal);
    }, 300);

    return () => {
      clearTimeout(timer);
      if (activePreviewControllerRef.current === controller) {
        activePreviewControllerRef.current = null;
      }
      controller.abort();
    };
  }, [captureScopeInput, fetchPreview, replaceActivePreviewController, runId, ticketId, widenedInput]);

  const refreshCapturePreview = (): void => {
    if (!ticketId) return;
    const controller = new AbortController();
    replaceActivePreviewController(controller);
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
