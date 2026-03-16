# Prompt 3: Client State & React Patterns Review

You have access to the repository at https://github.com/mtmitchel/SpecFlow (main branch, commit 6dfc3ae).

You are reviewing the React client of a developer tool. It uses React 19, React Router v7, and no state management library. All state lives in a single `ArtifactsSnapshot` atom in `App.tsx`.

The app was recently refactored to extract hooks and sub-components from a 901-line god component (`TicketView`). Review for state management correctness, race conditions, and memory leaks.

## Key files to read from the repo

- `packages/client/src/App.tsx` -- root component, snapshot state
- `packages/client/src/app/hooks/use-verification-stream.ts` -- SSE EventSource
- `packages/client/src/app/hooks/use-capture-preview.ts` -- diff preview with debounce
- `packages/client/src/app/hooks/use-export-workflow.ts` -- export/copy/fix-forward
- `packages/client/src/app/hooks/use-dirty-form.ts` -- unsaved changes warning
- `packages/client/src/app/views/ticket-view.tsx` -- composes the 3 hooks above
- `packages/client/src/app/views/ticket/capture-verify-section.tsx` -- uses setters from verify hook
- `packages/client/src/app/views/ticket/verification-results-section.tsx` -- fix-forward flow
- `packages/client/src/app/views/ticket/export-section.tsx` -- export UI
- `packages/client/src/app/views/ticket/override-panel.tsx` -- override to done
- `packages/client/src/app/layout/command-palette.tsx` -- mode switching
- `packages/client/src/app/layout/palette-search-mode.tsx` -- search sub-component
- `packages/client/src/app/layout/settings-modal.tsx` -- settings form
- `packages/client/src/app/components/model-combobox.tsx` -- model picker
- `packages/client/src/types.ts` -- all client types including VerificationResult

## Critical code (inline for reference)

### use-verification-stream.ts

```typescript
export const useVerificationStream = (
  ticketId: string | undefined,
  runId: string | undefined,
  onRefresh: () => Promise<void>
) => {
  const [verifyStreamEvents, setVerifyStreamEvents] = useState<string[]>([]);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verifyState, setVerifyState] = useState<"idle" | "running" | "reconnecting">("idle");

  useEffect(() => {
    if (!ticketId) { return; }

    let isMounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let source: EventSource | null = null;

    const syncVerificationFromRunState = (attemptData: Array<{
      overallPass: boolean;
      attemptId: string;
      criteriaResults: VerificationResult["criteriaResults"];
      driftFlags: VerificationResult["driftFlags"];
    }>): void => {
      const latest = attemptData.slice()
        .sort((left, right) => left.attemptId.localeCompare(right.attemptId))
        .at(-1);
      if (!latest) { return; }
      setVerificationResult({
        overallPass: latest.overallPass,
        criteriaResults: latest.criteriaResults,
        driftFlags: latest.driftFlags
      });
    };

    const connect = (): void => {
      if (!isMounted) { return; }
      source = new EventSource(`/api/tickets/${ticketId}/verify/stream`);

      source.onopen = () => { reconnectAttempt = 0; };

      source.addEventListener("verify-token", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { chunk?: string };
          const chunk = payload.chunk;
          if (chunk) {
            setVerifyStreamEvents((current) => [...current, chunk].slice(-200));
          }
        } catch { /* ignore */ }
      });

      source.addEventListener("verify-complete", () => {
        if (!runId) { return; }
        void fetchRunState(runId).then((snapshot) => {
          syncVerificationFromRunState(snapshot.attempts);
        });
      });

      source.onerror = () => {
        source?.close();
        const backoff = Math.min(1000 * 2 ** reconnectAttempt, 10_000);
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(() => {
          setVerifyState("reconnecting");
          if (runId) {
            void fetchRunState(runId)
              .then((snapshot) => syncVerificationFromRunState(snapshot.attempts))
              .catch(() => {});
          }
          void onRefresh().finally(() => {
            setVerifyState("idle");
            connect();
          });
        }, backoff);
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimer) { clearTimeout(reconnectTimer); }
      source?.close();
    };
  }, [ticketId, runId]);

  return {
    verifyStreamEvents, verificationResult, verifyState,
    setVerifyStreamEvents, setVerificationResult, setVerifyState
  };
};
```

### use-capture-preview.ts

```typescript
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
    if (!ticketId) { return; }
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
    if (!ticketId || !runId) { return; }
    void refreshCapturePreview();
  }, [ticketId, runId, refreshCapturePreview]);

  useEffect(() => {
    if (!ticketId || !runId) { return; }
    const timer = setTimeout(() => { void refreshCapturePreview(); }, 300);
    return () => { clearTimeout(timer); };
  }, [captureScopeInput, widenedInput, ticketId, runId, refreshCapturePreview]);

  return {
    captureScopeInput, setCaptureScopeInput, widenedInput, setWidenedInput,
    capturePreviewData, selectedNoGitPaths, setSelectedNoGitPaths,
    captureSummary, setCaptureSummary, refreshCapturePreview
  };
};
```

### use-export-workflow.ts

```typescript
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

  useEffect(() => {
    setExportResult(null);
    setCopyFeedback(false);
  }, [ticketId]);

  // ... handleExport, handleReExportWithFindings, handleCopyBundle
  // (read full file in repo for complete implementation)

  return {
    agentTarget, setAgentTarget, exportResult, downloadUrl,
    copyFeedback, fixForwardReady, setFixForwardReady,
    handleExport, handleReExportWithFindings, handleCopyBundle
  };
};
```

### ticket-view.tsx -- composition

```typescript
export const TicketView = ({ tickets, runs, runAttempts, initiatives, onRefresh, onMoveTicket }) => {
  const params = useParams<{ id: string }>();
  const ticket = tickets.find((item) => item.id === params.id);
  const run = runs.find((item) => item.id === ticket?.runId);
  const attempts = runAttempts.filter((attempt) => run?.attempts.includes(attempt.attemptId));

  const verify = useVerificationStream(params.id, run?.id, onRefresh);
  const capture = useCapturePreview(params.id, run?.id, ticket?.fileTargets ?? []);
  const exportWf = useExportWorkflow(params.id, onRefresh);

  // ... passes hook returns as props to ExportSection, CaptureVerifySection,
  // VerificationResultsSection sub-components
};
```

## Analyze the following specifically

1. **Stale closures**: The `useVerificationStream` hook captures `runId` in its effect closure but `runId` comes from a derived lookup (`runs.find(r => r.id === ticket?.runId)`). If the ticket's `runId` changes (e.g., after a new export creates a new run), does the effect properly clean up the old EventSource and reconnect with the new runId? Trace the dependency array. What about `onRefresh` -- it's used inside the effect but NOT in the dependency array.

2. **Race between SSE and REST**: When `verify-complete` fires, the hook calls `fetchRunState(runId)` to get results. But the parent also calls `onRefresh()` after `captureResults()`. Can these two paths produce conflicting state updates? What if `fetchRunState` returns before `onRefresh` completes and the snapshot is stale?

3. **Effect dependency completeness**: The `useVerificationStream` effect depends on `[ticketId, runId]` but references `onRefresh` in the closure. If `onRefresh` changes identity (it's `() => Promise<void>` passed as a prop from App.tsx), will the effect use a stale version? Is this a real bug or is `onRefresh` stable? Check how it's defined in App.tsx.

4. **Memory leaks**: The capture preview hook sets up a 300ms debounce timer. If the component unmounts during the timer, does the callback fire and try to call `setCapturePreviewData` on an unmounted component? Trace the cleanup path. Note: React 19 no longer warns on setState-after-unmount, but the fetch would still fire.

5. **Prop drilling vs. hook coupling**: The `CaptureVerifySection` receives `setVerifyStreamEvents` and `setVerifyState` as props -- these are state setters from `useVerificationStream`. This creates implicit coupling. Is there a scenario where calling `setVerifyState("running")` in CaptureVerifySection conflicts with the SSE hook also calling `setVerifyState("reconnecting")` at the same moment?

6. **Export workflow state reset**: `useExportWorkflow` resets `exportResult` and `copyFeedback` when `ticketId` changes. But `fixForwardReady` is NOT reset on ticketId change. Is this intentional or a bug? What happens if you navigate from a ticket with `fixForwardReady=true` to another ticket? Also: `downloadUrl` is not revoked on ticketId change -- is this a blob URL leak?

7. **useCapturePreview double-fire**: The hook has two effects that both call `refreshCapturePreview` -- one triggers on `[ticketId, runId, refreshCapturePreview]` and another on `[captureScopeInput, widenedInput, ticketId, runId, refreshCapturePreview]`. When the component first mounts with a valid ticketId+runId, will `refreshCapturePreview` fire twice (once from each effect)? Is this a wasted API call?

8. **initialFileTargets reference stability**: `useCapturePreview` receives `initialFileTargets` as `ticket?.fileTargets ?? []`. The `?? []` creates a new array on every render when `ticket` is undefined. This doesn't affect the effect (which depends on `ticketId`), but review whether this causes unnecessary re-renders in child components.

## Output format

For each issue found, classify as:
- **BUG**: produces incorrect behavior users will see
- **RISK**: race condition that rarely manifests but is architecturally wrong
- **STYLE**: not broken but creates maintenance burden
- **FALSE POSITIVE**: initially looks wrong but is actually safe (explain why)
