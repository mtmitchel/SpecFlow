# Prompt 3: Client State & React Patterns Review

You are reviewing the current repository checkout for SpecFlow.

You are reviewing the React client of a developer tool. It uses React 19, React Router v7, transport adapters for desktop and legacy web mode, and no client-side state management library beyond the root `ArtifactsSnapshot` state in `App.tsx`.

Review for state management correctness, race conditions, memory leaks, and cleanup issues across the desktop bridge, transport adapter, and the retained legacy SSE fallback paths.

## Key files to read from the repo

- `packages/client/src/App.tsx` -- root component, snapshot state
- `packages/client/src/api/transport.ts` -- desktop-vs-web transport adapter
- `packages/client/src/app/hooks/use-verification-stream.ts` -- desktop-aware verification state plus retained legacy SSE fallback
- `packages/client/src/app/hooks/use-capture-preview.ts` -- diff preview with debounce
- `packages/client/src/app/hooks/use-export-workflow.ts` -- export/copy/fix-forward/native save
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
- `packages/tauri/src-tauri/src/lib.rs` -- desktop-side pending request registry and event forwarding

## Review focus

Read the current repository files instead of relying on stale inline snippets. The migration changed the client/runtime split in ways that matter for this review:

- `useVerificationStream` is now desktop-aware. Desktop mode reads final verification state from the refreshed run snapshot, while legacy web mode still owns the retained SSE fallback.
- `App.tsx` subscribes to desktop `artifacts-changed` events through the Tauri bridge and must clean up correctly even if the async listener resolves after unmount.
- `useExportWorkflow` now manages clipboard state, blob URL lifecycle, and native desktop ZIP save in one hook.
- `packages/tauri/src-tauri/src/lib.rs` owns the pending-request registry and forwards request-scoped sidecar events back to the client.
- `ticket-view.tsx` still composes the capture, export, and verification hooks together, so cross-hook state races remain important.

## Analyze the following specifically

1. **Stale closures**: `useVerificationStream` still depends on a derived `runId` and an `onRefresh` callback that comes from `App.tsx`. If the ticket's `runId` changes after export or verification, does the hook tear down the previous legacy SSE connection cleanly and avoid reconnecting stale work? Is every callback in scope aligned with the current `ticketId`, `runId`, and mounted state?

2. **Race between request-scoped progress and snapshot refresh**: Verification completion can surface through direct run-state fetches, parent `onRefresh()` calls, and desktop artifact-change notifications. Can those paths race and produce stale or conflicting verification UI state?

3. **Effect dependency completeness**: Review `App.tsx`, `useVerificationStream`, `useCapturePreview`, and `useExportWorkflow` for callbacks used in effects without corresponding dependencies. Distinguish real bugs from intentionally stable callbacks.

4. **Memory leaks**: Check timer cleanup, blob URL revocation, async event listener teardown, legacy `EventSource` teardown, and desktop pending-request cleanup. React 19 no longer warns on every setState-after-unmount path, so verify the cleanup explicitly.

5. **Prop drilling vs. hook coupling**: `CaptureVerifySection` still receives verification setters from `useVerificationStream`. Can the section drive `verifyState` into a value that conflicts with the hook’s own legacy reconnect logic or desktop completion flow?

6. **Export workflow state reset**: Validate that `useExportWorkflow` fully resets ticket-scoped state on ticket changes, including fix-forward readiness, clipboard feedback timers, and blob URLs. Confirm that the native save path does not leave stale state behind when users switch tickets mid-flow.

7. **useCapturePreview double-fire**: The hook still has an immediate refresh path and a debounced refresh path. Does a fresh ticket/run mount trigger duplicate preview fetches, and if so is that acceptable or a wasteful race?

8. **Reference stability**: Review array/object literals flowing into hooks and child components, including `ticket?.fileTargets ?? []`, transport event handlers, and Tauri listener callbacks. Identify cases where unnecessary identity churn causes avoidable work or stale cleanup behavior.

## Output format

For each issue found, classify as:
- **BUG**: produces incorrect behavior users will see
- **RISK**: race condition that rarely manifests but is architecturally wrong
- **STYLE**: not broken but creates maintenance burden
- **FALSE POSITIVE**: initially looks wrong but is actually safe (explain why)
