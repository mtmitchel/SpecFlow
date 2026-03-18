# AGENTS.md - SpecFlow Repository

This file is the operating standard for every coding agent working in this repository. Read it before touching any file. Follow it without exception.

## 1. Prime Directive

Ship production-grade work. Finish the task completely. Do not return half-finished changes, stub implementations, placeholder comments, or temporary workarounds unless the user explicitly asks for them.

Prefer root-cause fixes over symptom patches. If a bug is structural, fix the structure.

When in doubt, choose the smallest change that fully resolves the root cause and keeps the design coherent. Do not default to a narrow patch when the defect crosses a shared boundary, and do not widen scope without a concrete structural reason.

## 2. Project Overview

SpecFlow is a local-first, spec-driven development orchestrator for solo builders and small teams using AI coding agents. It turns raw intent into planning artifacts, ordered ticket breakdowns, and agent-ready bundles, then verifies that the agent's output satisfies the original plan.

SpecFlow is now desktop-first. The primary runtime is a Tauri v2 desktop shell backed by a persistent Node sidecar. A legacy Fastify + browser runtime remains available only as an explicit fallback and compatibility path.

The repository is an npm workspace with three packages:

| Package | Contents | Runtime |
| --- | --- | --- |
| `packages/app` | Node business logic, shared runtime handlers, CLI, sidecar, and legacy Fastify runtime | Node.js |
| `packages/client` | React + Vite UI with desktop and legacy-web transport adapters | Browser / Tauri webview |
| `packages/tauri` | Tauri v2 desktop shell and Rust bridge | Rust + Tauri |

Core runtime and docs live together in the workspace:

- `docs/`: product and technical planning artifacts
- `README.md` and `docs/README.md`: setup and docs entry points
- `specflow/`: runtime data (`config.yaml`, `initiatives/`, `tickets/`, `runs/`, `decisions/`)

### Required startup reading

Before making changes, read the docs that match the area you are about to touch. The minimum startup order is:

1. [`README.md`](README.md) for setup, commands, and runtime expectations
2. [`docs/runtime-modes.md`](docs/runtime-modes.md) for desktop-first versus legacy web behavior
3. [`docs/architecture.md`](docs/architecture.md) before changing sidecar, transport, CLI, Fastify, store, planner, verifier, or bundle behavior
4. [`docs/workflows.md`](docs/workflows.md) before changing planning, execution, verification, or audit UX/flow behavior

Use [`docs/README.md`](docs/README.md) as the index for additional domain docs. If a change touches product language or review expectations, read the relevant file under `docs/` before editing code.

## 3. Repository Layout

### `packages/app`

```text
src/
  bundle/           bundle generation and agent-specific renderers
    internal/       helpers: agents-md, context-files, manifest, operations, snapshot
  cli/              Commander.js entry point and command modules (ui, export-bundle, verify)
    commands/
  config/           env key resolution
  io/               file I/O: agents-md (secure loader), atomic-write, paths, yaml
  llm/              LLM provider client, error types, SSE stream parser
  planner/          spec + plan generation service, workflow contract, execution gates
    internal/       helpers: context, error-shaping, plan-job, review-job, spec-artifacts, ticket-factory, validators
  runtime/          transport-agnostic runtime factory, handler layer, shared sidecar contract
    handlers/       one file per domain: runtime, providers, initiatives, tickets, runs, audit, operations, import
  server/           Fastify legacy web runtime
    audit/          drift audit logic (findings, report-store, types)
    routes/         one file per domain: import, initiative, operation, provider, run-query, run-audit, runtime, ticket
    sse/            legacy SSE session management
    validation.ts   security validators
    zip/            legacy HTTP ZIP streaming
  sidecar/          sidecar JSON-RPC dispatcher and runtime helpers
  store/            in-memory artifact store with staged commits
    internal/       helpers: artifact-writer, cleanup, fs-utils, loaders, operations, planning-artifact-validation, recovery, reload, spec-utils, watcher
    types.ts        PreparedOperationArtifacts interface (shared between store and operations)
  types/            core entity types (Initiative, Ticket, Run, Config, etc.)
  verify/           verification and diff engine
    diff/           git-strategy, snapshot-strategy, patch-utils, path-utils, types
    internal/       helpers: agents-md, config, criteria, operations, prompt
```

### `packages/client`

```text
src/
  api/              one module per domain: artifacts, audit, http, import, initiatives, runs, settings, sse, tickets, transport
  styles/           modular CSS entrypoint + concern-based stylesheets (base, navigator, workspace, shared-ui, feedback/settings, command-palette, entry-flows, planning-shell, pipeline, planning-intake, planning-reviews, overview, ticket-execution, run-report)
  app/
    components/     shared UI: audit-panel, checkpoint-gate-banner, diff-viewer, markdown-view, model-combobox, phase-transition-banner, pipeline, workflow-section
    constants/      status-columns (status transition rules, canTransition helper)
    context/        toast (error notification context and useToast hook)
    hooks/          use-capture-preview, use-dirty-form, use-export-workflow, use-tree-navigation, use-verification-stream
    layout/         workspace-shell, icon-rail, navigator, navigator-tree, command-palette (+ palette-search-mode, palette-quick-task-mode, palette-github-import-mode), settings-modal
    utils/          initiative-progress, phase-warning, scope-paths, specs
    views/          detail-workspace, overview-panel, initiative-view, initiative-route-view, initiative-creator, initiative-handoff-view, spec-view, ticket-view, run-view
      initiative/   planning workspace sections, review cards, shared state/controller hook
      ticket/       export-section, capture-verify-section, verification-results-section, override-panel
  api.ts            consolidated re-export of all API modules
  App.tsx           root component, ArtifactsSnapshot state, refreshArtifacts callback
  types.ts          all client-facing types including AgentTarget, Config, ConfigSavePayload
```

### `packages/tauri`

```text
src-tauri/
  src/              Rust bridge, sidecar lifecycle, pending request registry, Tauri commands
  capabilities/     Tauri capability declarations
  icons/            desktop app icons
  tauri.conf.json   packaged desktop config
  tauri.dev.conf.json
                   dev-only overlay that disables packaged-sidecar requirements
```

## 4. Commands

Use these canonical commands. Do not invent variations.

```bash
npm install          # install all workspaces
npm run setup:git-hooks
npm run check        # type-check both packages (tsc --noEmit) and run the UI dedupe gate
npm test             # run all Vitest suites (backend + client)
npm run dev          # alias for the desktop-first Tauri dev loop
npm run tauri dev    # explicit desktop-first dev loop
npm run dev:web      # legacy Fastify + browser dev path
npm run ui           # launch from source; uses an existing desktop binary if present, otherwise falls back to legacy web
npm run ui:web       # start the legacy Fastify/browser runtime from source
npm run package:desktop  # explicit desktop packaging only; not part of development
git status -sb       # quick working tree check
```

Direct CLI examples during development:

- `tsx packages/app/src/cli.ts ui --no-open`
- `tsx packages/app/src/cli.ts ui --legacy-web --no-open`
- `tsx packages/app/src/cli.ts export-bundle --ticket <ticket-id> --agent codex-cli`
- `tsx packages/app/src/cli.ts verify --ticket <ticket-id>`

For normal development tasks, run `npm run check && npm test` before considering the task complete. Run desktop packaging only when the user explicitly asks for packaging or release validation. Do not report success without real command output. Do not invent results.

## 5. Code Quality Standards

### 5a. Finish the task

Do not stop at the first passing state. Verify the full acceptance criteria. If tests or type checks are broken in areas you touched, fix them even if you did not introduce the breakage.

### 5b. Fix root causes

If a bug has a structural cause such as a wrong data model, missing validation, or incorrect ownership of state, fix the structure. Do not hide the symptom with a guard clause.

### 5c. Design scope: durable but bounded

Optimize for the cleanest long-term design justified by the current task, not the smallest diff.

Before implementing, inspect the shared type surface, ownership boundaries, and workflow contracts touched by the change. If the root cause crosses one of those boundaries, fix the boundary instead of patching downstream symptoms.

Do not introduce new abstractions, generic helpers, or future-facing extensibility unless they remove current duplication, restore clear ownership, or are required to make the current behavior correct.

### 5d. File size: 600 LOC hard limit

If a file you are editing or creating reaches or exceeds 600 lines of code, stop and propose a refactor plan before adding more code. Describe what the file is doing, how it should be split, and what each new module would own. Do not keep adding code to a file that already needs to be broken up.

### 5e. No hacks or short-term bandaids

Do not introduce:

- magic constants without named exports
- `// @ts-ignore` or `as any` without a documented reason in a comment directly above the line
- disabled lint rules without a documented reason
- workarounds that defer the real fix
- comments such as "temporary" or "fix later"

If a proper fix requires more context than you have, say so explicitly. Do not ship the hack.

### 5f. No ceremony

Do not create:

- new scripts, runners, or wrapper files to manage existing tooling
- process documents, ADRs, or tracking files unless explicitly requested
- abstraction layers whose only purpose is to exist

Build or fix the thing itself.

### 5g. No silent error suppression

Do not swallow errors. Every error path must either surface to the caller, log with enough context to diagnose, or both.

## 6. TypeScript and Coding Conventions

- Follow `.editorconfig`: UTF-8, LF, final newline, trimmed trailing whitespace.
- Use explicit interfaces for shared entities and API payloads. Do not use anonymous object types for anything that crosses a module boundary.
- Shared TypeScript types between packages live in `packages/app/src/types/` and are imported via path aliases. Do not duplicate type definitions across packages.
- Markdown docs should use concise sections with clear scope boundaries.
- File names use kebab-case unless framework conventions require otherwise.
- Do not annotate React component return types with `: JSX.Element`. TypeScript infers them correctly and the global `JSX` namespace was removed in `@types/react@19`.
- Use `ConfigSavePayload` from `types.ts` when sending config to `PUT /api/config`. Use `Config` for reading.
- `AgentTarget` is the canonical type for agent selection (`"claude-code" | "codex-cli" | "opencode" | "generic"`). Import it from `../types` rather than re-declaring it locally.

## 7. CSS Design System

All visual tokens live in `packages/client/src/styles/base.css`. Use tokens instead of hardcoded values.

- Border radius: `--radius-xs` (6px), `--radius-sm` (4px), `--radius-md` (8px), `--radius-lg` (12px), `--radius-pill` (999px)
- Typography: `--font-caption` (0.75rem), `--font-sm` (0.82rem), `--font-body-sm` (0.88rem)
- Shadows: `--shadow-md`, `--shadow-lg`, `--shadow-drawer`
- Disabled states: opacity `0.5`, `cursor: not-allowed`, `pointer-events: none`; shared rule in `shared-ui.css` covers `.inline-action`, `.btn-primary`, `.btn-destructive`, `.btn-danger-subtle`, `.btn-success`, `.settings-form button`
- Hover opacity: always `0.85`
- Button padding: compact `0.3rem 0.6rem`, standard `0.45rem 0.75rem`
- Input padding: `0.4rem 0.6rem`
- Transitions: list explicit properties such as `background`, `border-color`, `opacity`; never use `transition: all`
- Utility classes in `shared-ui.css`: `.text-muted-sm`, `.text-muted-caption`, `.heading-reset`, `.textarea-sm/md/lg`; prefer these over inline `style` props

## 8. No Duplicate UI

Never ship duplicated UI meaning. Do not repeat the same action, state, or explanation in adjacent controls, cards, banners, drawers, or helper text. Treat near-duplicates as defects, not copy tweaks. If two labels or blocks mean the same thing, keep one.

Do not render the same option twice in a choice set, including fallback options such as `Other`.

`npm run check` includes a hard UI dedupe gate. Fix failures. Do not bypass them.

## 9. Architecture Constraints

### Artifact store staged commit model

All mutations to `specflow/` follow the staged commit model:

1. Build the full output in a temp attempt directory.
2. Validate and write a temp manifest.
3. Atomically commit by updating the authoritative pointer in `run.yaml`.
4. Refresh in-memory maps from committed files.

Never write directly to committed artifact paths. Never skip the temp-rename pattern for single-file writes. Writes are serialized with a per-run lock. Concurrent operations against the same run must be rejected with a retryable conflict error.

### LLM calls go through the backend runtime

The UI never calls provider APIs directly. Planner, Verifier, and Audit operations go through backend-owned handlers, reached either through the Tauri sidecar bridge in desktop mode or Fastify adapters in legacy web mode. Provider keys are read from `.env`. Do not pass API keys through client payloads.

### CLI prefers server delegation

The CLI probes `/api/runtime/status` before executing mutating commands. If the server is running, the CLI delegates to server APIs. If the server is reachable but the protocol check fails, mutating commands fail closed. Do not implement local fallback for protocol mismatches.

### Workflow contract and execution gates

Step order, review kinds, labels, and prerequisite review rules are defined in `packages/app/src/planner/workflow-contract.ts`. Initiative-linked execution gating is centralized in `packages/app/src/planner/execution-gates.ts`. Do not duplicate or diverge from those rules in route handlers or UI logic.

### Streaming and reconnection

Desktop mode uses request-scoped sidecar notifications routed through the Tauri bridge. Legacy web mode still uses SSE where explicitly supported. Reconnection remains non-resumable with snapshot refresh: on disconnect, the client reconnects and fetches the latest persisted state instead of replaying buffered events. Do not implement event replay buffers.

## 10. Input Validation, Security, and Data Contracts

### Input validation

All server-side input validation lives in `packages/app/src/server/validation.ts`. Use these helpers instead of ad-hoc checks:

- `isValidEntityId(id)` validates entity ID format (`prefix-{8 hex chars}`)
- `isContainedPath(root, target)` prevents directory traversal
- `isValidGitRef(ref)` validates git branch and commit refs
- `sanitizeSseEventName(event)` strips unsafe chars from SSE event names

When adding routes that accept entity IDs or file paths, validate before constructing filesystem paths or passing values to git commands.

### API key handling

The server redacts `apiKey` from all API responses. Clients receive `hasApiKey: boolean` instead. The raw key is only ever sent from client to server on `PUT /api/config` via `ConfigSavePayload`. Never include the raw key in any API response, log line, or error message.

### Secrets

Never commit secrets or provider API keys.

- Keep provider keys in `.env`: `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- Keep `specflow/config.yaml` non-secret: `provider`, `model`, `host`, `port`, `repoInstructionFile`
- `.env.example` may be committed; `.env` must remain ignored

### GitHub issue import

`POST /api/import/github-issue` fetches a GitHub issue and feeds it through the triage pipeline. It reads `GITHUB_PERSONAL_ACCESS_TOKEN` or `GITHUB_TOKEN` from the environment at request time. No GitHub credentials are stored in the artifact store or returned in API responses.

### Ticket dependency fields

`Ticket` carries two required arrays: `blockedBy: string[]` and `blocks: string[]`. Older YAML files that lack these fields are normalized to empty arrays in `packages/app/src/store/internal/loaders.ts`. When adding literals that satisfy `Ticket`, always include both fields.

## 11. Testing Standards

Backend tests use Vitest under `packages/app/test` and are split by domain:

- `artifact-store.test.ts`: store semantics, staged commits, reload serialization, orphan cleanup, file watcher
- `atomic-write.test.ts`: atomic temp-rename writes
- `bundle-generator.test.ts`: bundle generation, agent renderers, manifest versioning
- `llm-client.test.ts`: LLM streaming and error handling
- `planner.test.ts`: spec generation, JSON parsing, job orchestration
- `validation.test.ts`: input validation helpers, including entity IDs, path containment, git refs, and SSE event names
- `verifier.test.ts`: verification pass/fail logic and drift flags
- `server/audit-routes.test.ts`: drift audit endpoints
- `server/initiative-routes.test.ts`: initiative CRUD and spec generation
- `server/provider-routes.test.ts`: model discovery and provider configuration
- `server/run-routes.test.ts`: run detail and bundle ZIP download
- `server/runtime-status.test.ts`: server health and capability probes
- `server/ticket-routes.test.ts`: ticket CRUD, export, capture, and SSE

Client tests use Vitest and React Testing Library under `packages/client/src/**/*.test.tsx`. Current high-value coverage includes:

- `app/views/initiative-creator.test.tsx`
- `app/views/initiative-view.test.tsx`
- `app/views/overview-panel.test.tsx`
- `app/views/initiative/tickets-step-section.test.tsx`
- `app/views/ticket-view.test.tsx`
- `app/views/run-view.test.tsx`

Add or adjust tests when modifying server routes, verifier or diff logic, bundle generation, artifact store semantics, or client behavior with meaningful UI state. If behavior changes and tests do not exist, add them.

Do not mock behavior you can test directly. Do not write tests that only assert that a mock was called.

## 12. Refactor Triggers

Propose a refactor instead of silently continuing when any of the following are true:

- a file reaches 600 LOC
- a function exceeds roughly 60 lines and handles more than one concern
- a module imports from more than 8 other internal modules
- a route handler contains business logic that belongs in a service layer
- a component manages both data fetching and complex render logic in the same file

When proposing a refactor, name the file, the problem, the proposed split, and the new module names with their responsibilities. Wait for confirmation before executing if the refactor would touch more than 3 files.

## 13. Stop Rules

Stop and report rather than continuing when:

- you have made three attempts to fix the same failing test or type error and it is still failing
- a fix requires a non-trivial change in a file you were not given context for
- you are about to make a destructive filesystem or git operation that was not explicitly requested
- you cannot determine whether a change is safe without running the app end to end and you do not have that capability

Do not spiral on repeated failed variants of the same fix. Report what you tried, what failed, and what you believe the root cause is.

## 14. Reporting Standards

When reporting completed work, include:

- what changed: the exact files modified, with a one-line description of each
- scope rationale: one sentence explaining why the chosen fix scope matched the actual root cause
- test results: the real output of `npm run check && npm test`
- packaging status: the real output of `npm run package:desktop` when packaging was explicitly requested or performed
- what is not done: anything from the acceptance criteria that remains incomplete
- known risks: anything uncertain or likely to need follow-up

Every substantive assistant response must end with a `Next steps` section.

- That section must name one recommended action, written in imperative language.
- It must say who should do it if that is not obvious.
- It must explain why that action is the correct immediate move.
- Do not end with vague closures such as a grade, status note, finding list, or phrases like `if you want` / `we could also`.
- Do not use option dumps. The close must present one concrete recommendation, not a loose list of possible next actions.

Do not omit failures. Do not say "tests pass" without real output. Do not say "should work."

## 15. Commit and PR Guidelines

Use concise imperative commit subjects, for example:

- `Implement run audit actions and run detail endpoints`
- `Fix coverage-gate banner rendering on stale initiatives`
- `Refactor artifact-store into writer and loader modules`

PRs must include:

- what changed and why
- linked issue(s), for example `#8`
- docs updates in `README.md`, `docs/README.md`, or design docs when applicable
- screenshots or GIFs for user-visible UI changes

## 16. GitHub Issue Process (Required on This Machine)

Use the local MCP wrapper as the only GitHub MCP entrypoint:

- MCP server name: `github`
- backing command: `/home/mason/bin/mcp-github-server`

Run this auth gate before any GitHub read or write:

```bash
~/bin/mcp-github-server --auth-check
```

Exit `0` means proceed. Non-zero means stop and fix auth first.

Optional checks:

- `~/bin/mcp-github-server --preflight`
- `~/bin/mcp-github-server --health-check`
- `~/bin/mcp-github-server --clear-cache`
- `~/bin/mcp-github-server --force-refresh`

Auth model:

- token source of truth: Bitwarden Secrets Manager (`bws`)
- runtime cache: kernel keyring (`keyctl`), key `github-mcp-token`, TTL 24h
- the wrapper exports `GITHUB_PERSONAL_ACCESS_TOKEN` and `GITHUB_TOKEN` only for the launched MCP process

Issue workflow:

1. Auth check
2. List or search for duplicates
3. Create or update the issue
4. Add progress comments
5. Update labels, assignees, and state as needed

Rules:

- do not use Docker GitHub MCP auth
- do not use `gh auth status` as the auth gate
- do not use any GitHub path other than the wrapper above
- `--auth-check` is authoritative
