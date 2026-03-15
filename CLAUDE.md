# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
npm install                # install all workspaces
npm run build              # build client (Vite) then server (tsc) -- order matters
npm run check              # type-check both packages (tsc --noEmit); no build output
npm test                   # run backend Vitest suite (packages/app only)
npm run ui                 # build + start local server with UI

# Client dev server with hot-reload (does NOT start the backend)
npm run -w @specflow/client dev

# Single test file (run from packages/app/)
npx vitest run test/artifact-store.test.ts

# Single test by name pattern (run from packages/app/)
npx vitest run -t "pattern"

# Watch mode (run from packages/app/)
npx vitest

# Type-check only (no emit)
npx tsc -p packages/app/tsconfig.json --noEmit
npx tsc -p packages/client/tsconfig.json --noEmit

# Direct CLI (after build)
node packages/app/dist/cli.js ui --no-open
node packages/app/dist/cli.js export-bundle --ticket <ticket-id> --agent codex-cli
node packages/app/dist/cli.js verify --ticket <ticket-id>
```

There is no linter or formatter configured. Style is enforced by `.editorconfig` (UTF-8, LF, final newline, trim trailing whitespace).

## Architecture

Monorepo with two npm workspaces:

- **packages/app** -- Fastify v5 backend + Commander.js CLI. Compiles with `tsc` to `dist/`. Uses `"type": "module"` with **NodeNext** module resolution (imports must use `.js` extensions even for `.ts` source).
- **packages/client** -- React 19 + React Router v7 + Vite 7. Uses **Bundler** module resolution with `noEmit: true`; Vite handles bundling. Built output served as static files by the Fastify server. No `.js` extensions needed in imports.

### Data layer

All data is flat YAML/JSON files on disk under `specflow/` (gitignored runtime directory). There is no database.

- `ArtifactStore` (packages/app/src/store/artifact-store.ts) loads everything into memory at startup, serves reads from in-memory Maps, and writes atomically (tmp + rename). Concurrent `reloadFromDisk()` calls are serialized (coalesced) via a `reloadInFlight` guard to prevent interleaved map mutations.
- Staged commit model: long operations write to `runs/<id>/_tmp/<op-id>/` first, then `commitRunOperation()` moves files to their final location. Write locks prevent concurrent ops on the same run. The file watcher is suppressed for the entire commit critical section (cp + manifest write + upsertRun + reload).
- chokidar watches `specflow/` for external edits and triggers debounced `reloadFromDisk()`.

### Server structure

`createSpecFlowServer()` (packages/app/src/server/create-server.ts) is the composition root. It wires together:
- `ArtifactStore` -- data access
- `PlannerService` -- LLM-powered spec/plan generation
- `BundleGenerator` -- export bundles for AI agents
- `VerifierService` + `DiffEngine` -- acceptance verification against diffs
- Route files in `src/server/routes/` (one file per domain; run routes are split into `run-query-routes.ts` and `run-audit-routes.ts`)

SSE streaming uses raw Fastify response hijacking (`reply.hijack()` + writing to `reply.raw`), not a plugin.

### Client structure

Single state atom pattern: `AppInner` in App.tsx holds an `ArtifactsSnapshot` (config, initiatives, tickets, runs, runAttempts, specs). No Redux/Zustand. Mutations do targeted `setSnapshot` updates; `refreshArtifacts()` does a full reload.

API layer: thin wrappers over `fetch` in `src/api/`. `http.ts` provides `requestJson<T>()` and throws `ApiError` with status and structured message on non-2xx.

Pages use `useToast()` for error display. Root wraps: `<ErrorBoundary><ToastProvider><AppInner/></ToastProvider></ErrorBoundary>`.

Reusable hooks in `src/app/hooks/`: `useDirtyForm` (unsaved changes warning for spec/initiative editing), `useVerificationStream` (SSE EventSource with reconnection), `useCapturePreview` (diff preview with debounced refresh), `useExportWorkflow` (export/copy/fix-forward state), `useTreeNavigation` (keyboard nav for navigator tree).

`TicketView` is decomposed into sub-components in `src/app/views/ticket/`: `ExportSection`, `CaptureVerifySection`, `VerificationResultsSection`, `OverridePanel`. Shared presentation components `WorkflowSection` and `WorkflowStepper` live in `src/app/components/`.

`CommandPalette` delegates to mode sub-components: `PaletteSearchMode`, `PaletteQuickTaskMode`, `PaletteGithubImportMode` in `src/app/layout/`. `SettingsModal` delegates model picking to `ModelCombobox` in `src/app/components/`.

Shared utility `parseScopeCsv` in `src/app/utils/scope-paths.ts` is used by ticket-view, audit-panel, and capture/verify components.

### LLM integration

`HttpLlmClient` (packages/app/src/llm/client.ts) supports Anthropic, OpenAI, and OpenRouter with real SSE streaming. Provider-specific SSE parsing is handled by `parseStreamingSse()` in `packages/app/src/llm/sse-parser.ts` with `ANTHROPIC_SSE_CONFIG` and `OPENAI_SSE_CONFIG` config objects. Provider is selected at runtime from `specflow/config.yaml`; API keys come from `.env` vars or the config's `apiKey` field. The server never returns raw keys in responses (redacted to `hasApiKey: boolean`).

### Store internals

`ArtifactStore` delegates to extracted helpers in `store/internal/`: `artifact-writer.ts` handles writing staged operation artifacts, `spec-utils.ts` maps spec types to filenames, and `watcher.ts` encapsulates the chokidar watcher with debounced reload queue logic.

## Key Conventions

- **Entity IDs**: format `prefix-{8 hex chars}` (e.g. `ticket-aabbccdd`, `run-aabb1122`). Validated by `isValidEntityId()` in `packages/app/src/server/validation.ts`.
- **Input validation**: all route params/inputs must use helpers from `validation.ts` (`isValidEntityId`, `isContainedPath`, `isValidGitRef`, `sanitizeSseEventName`). No ad-hoc checks.
- **Ticket entities** require `blockedBy: string[]` and `blocks: string[]` fields. Older YAML files are normalized to empty arrays in `loadTickets`. Always include both when creating Ticket literals.
- **React components**: do NOT annotate return types with `: JSX.Element` (removed in `@types/react@19`). Use `ConfigSavePayload` for writes, `Config` for reads. `AgentTarget` is the shared agent selection type.
- **File names**: kebab-case.
- **Ellipsis in UI copy**: never use `...` (ellipsis) in static copy such as placeholders, labels, or empty-state messages. Ellipsis is reserved exclusively for loading/progress states (e.g. "Creating", "Importing"). Placeholder text should read naturally without trailing dots (e.g. `"Search tickets"` not `"Search tickets..."`).
- **Code quality**: if you encounter errors or failing tests in areas you touch, fix them even if you didn't introduce them. Run `npm run check`, `npm test`, and `npm run build` before considering work complete.

## Test Infrastructure

Tests live in `packages/app/test/`. The server test fixture (`test/helpers/server-fixture.ts`) creates a temp directory with the full `specflow/` layout, seeds entities, instantiates a real server with a mocked `fetchImpl`, and provides `cleanup()` for teardown. LLM streaming tests mock SSE with `ReadableStream` in the standard SSE wire format.

## AGENTS.md

`AGENTS.md` at the repo root contains full coding guidelines, source layout maps, and security rules. The server also reads it at runtime (via `repoInstructionFile` in config) and injects it into planner and verifier prompts. Consult it for detailed source layout, commit conventions, and the GitHub issue workflow.
