# AGENTS.md - SpecFlow Repository

This file is the operating standard for every coding agent working in this repository. Read it before touching any file. Follow it without exception.

For the principles and guardrails behind these rules, see [docs/guidelines/development-philosophy.md](docs/guidelines/development-philosophy.md).

## 1. Project Overview

SpecFlow is a local-first, spec-driven development orchestrator for solo builders and small teams using AI coding agents. It turns raw intent into planning artifacts, ordered ticket breakdowns, and agent-ready bundles, then verifies that the agent's output satisfies the original plan.

SpecFlow is desktop-only. The primary runtime is a Tauri v2 desktop shell backed by a persistent Node sidecar.

The repository is an npm workspace with three packages:

| Package | Contents | Runtime |
| --- | --- | --- |
| `packages/app` | Node business logic, shared runtime handlers, CLI, and sidecar runtime | Node.js |
| `packages/client` | React + Vite UI with desktop transport adapters | Browser / Tauri webview |
| `packages/tauri` | Tauri v2 desktop shell and Rust bridge | Rust + Tauri |

Core runtime and docs live together in the workspace:

- `docs/`: product and technical planning artifacts
- `README.md` and `docs/README.md`: setup and docs entry points
- `specflow/`: runtime data (`config.yaml`, `initiatives/`, `tickets/`, `runs/`, `decisions/`)

For the detailed directory tree, see [docs/repo-layout.md](docs/repo-layout.md).

### Required startup reading

Before making changes, read the docs that match the area you are about to touch. The minimum startup order is:

1. [`README.md`](README.md) for setup, commands, and runtime expectations
2. [`docs/runtime-modes.md`](docs/runtime-modes.md) for desktop runtime behavior
3. [`docs/architecture.md`](docs/architecture.md) before changing sidecar, transport, CLI, store, planner, verifier, or bundle behavior
4. [`docs/workflows.md`](docs/workflows.md) before changing planning, execution, verification, or audit UX/flow behavior

Use [`docs/README.md`](docs/README.md) as the index for additional domain docs. If a change touches product language or review expectations, read the relevant file under `docs/` before editing code.
If a change touches user-facing copy, read [`docs/product-language-spec.md`](docs/product-language-spec.md) and [`docs/ux-copy-guidelines.md`](docs/ux-copy-guidelines.md) before editing UI text.

### Documentation maintenance boundaries

Treat repo-wide documentation upkeep as applying to the living guidance and entrypoint docs only, such as:

- `README.md`
- `docs/README.md`
- `docs/runtime-modes.md`
- `docs/architecture.md`
- `docs/workflows.md`
- `docs/product-language-spec.md`
- `docs/ux-copy-guidelines.md`
- `CHANGELOG.md`
- `CLAUDE.md`

Do not update audit documents, report-style documents, or dated one-off files unless the user explicitly asks for those files.

## 2. Commands

Use these canonical commands. Do not invent variations.

```bash
npm install          # install all workspaces
npm run setup:git-hooks
npm run check        # lint, type-check both packages, UI dedupe gate, and automated guardrail checks
npm test             # run all Vitest suites (backend + client)
npm run dev          # alias for the desktop-first Tauri dev loop
npm run tauri dev    # explicit desktop-first dev loop
npm run ui           # launch from source; uses an existing desktop binary when present and otherwise fails closed
npm run package:desktop  # explicit desktop packaging only; not part of development
git status -sb       # quick working tree check
```

Direct CLI examples during development:

- `tsx packages/app/src/cli.ts ui --no-open`
- `tsx packages/app/src/cli.ts export-bundle --ticket <ticket-id> --agent codex-cli`
- `tsx packages/app/src/cli.ts verify --ticket <ticket-id>`

For normal development tasks, run `npm run check && npm test` before considering the task complete. Run desktop packaging only when the user explicitly asks for packaging or release validation. Do not report success without real command output. Do not invent results.

## 3. Code Quality Standards

### 3a. Finish the task

Do not stop at the first passing state. Verify the full acceptance criteria. If tests or type checks are broken in areas you touched, fix them even if you did not introduce the breakage.

### 3b. Fix root causes

If a bug has a structural cause such as a wrong data model, missing validation, or incorrect ownership of state, fix the structure. Do not hide the symptom with a guard clause.

### 3c. Design scope: durable but bounded

Before every change, answer: what breaks, what gets more complex, what gets harder to debug?

Optimize for the cleanest long-term design justified by the current task, not the smallest diff. Before implementing, inspect the shared type surface, ownership boundaries, and workflow contracts touched by the change. If the root cause crosses one of those boundaries, fix the boundary instead of patching downstream symptoms.

Do not introduce new abstractions, generic helpers, or future-facing extensibility unless they remove current duplication, restore clear ownership, or are required to make the current behavior correct.

### 3d. File size: 600 LOC hard limit

If a file you are editing or creating reaches or exceeds 600 lines of code, stop and propose a refactor plan before adding more code. Describe what the file is doing, how it should be split, and what each new module would own. Do not keep adding code to a file that already needs to be broken up.

### 3e. No hacks or short-term bandaids

Do not introduce:

- magic constants without named exports
- `// @ts-ignore` or `as any` without a documented reason in a comment directly above the line
- disabled lint rules without a documented reason
- workarounds that defer the real fix
- comments such as "temporary" or "fix later"

If a proper fix requires more context than you have, say so explicitly. Do not ship the hack.

### 3f. No ceremony and no unapproved additions

Do not create:

- new scripts, runners, or wrapper files to manage existing tooling
- process documents, ADRs, or tracking files unless explicitly requested
- abstraction layers whose only purpose is to exist
- new runtime dependencies without explicit approval

Build or fix the thing itself.

### 3g. No silent error suppression or degradation

Do not swallow errors. Every error path must either surface to the caller, log with enough context to diagnose, or both.

No silent fallbacks. If the system falls back to a reduced mode (missing repo context, unavailable config file, failed service call), log at warn level or surface a user-visible indicator. Use `// catch-ok: <reason>` only for truly intentional fire-and-forget patterns such as best-effort cancellation.

## 4. TypeScript and Coding Conventions

- Follow `.editorconfig`: UTF-8, LF, final newline, trimmed trailing whitespace.
- Use explicit interfaces for shared entities and API payloads. Do not use anonymous object types for anything that crosses a module boundary.
- Shared TypeScript types between packages live in `packages/app/src/types/` and are imported via path aliases. Do not duplicate type definitions across packages.
- Markdown docs should use concise sections with clear scope boundaries.
- File names use kebab-case unless framework conventions require otherwise.
- Do not annotate React component return types with `: JSX.Element`. TypeScript infers them correctly and the global `JSX` namespace was removed in `@types/react@19`.
- Use `ConfigSavePayload` from `types.ts` when sending config to `config.save`. Use `Config` for reading.
- `AgentTarget` is the canonical type for agent selection (`"claude-code" | "codex-cli" | "opencode" | "generic"`). Import it from `../types` rather than re-declaring it locally.

## 5. CSS Design System

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

## 6. No Duplicate UI

Never ship duplicated UI meaning. Do not repeat the same action, state, or explanation in adjacent controls, cards, banners, drawers, or helper text. Treat near-duplicates as defects, not copy tweaks. If two labels or blocks mean the same thing, keep one.

Do not render the same option twice in a choice set, including fallback options such as `Other`.

`npm run check` includes a hard UI dedupe gate. Fix failures. Do not bypass them.

### Copy and naming rules

- Use sentence case for user-facing headings, section titles, buttons, labels, badges, status labels, project names, phase names, and ticket titles.
- Sentence case means: capitalize the first word, proper nouns, approved acronyms, and the first word after a colon. Lowercase the rest.
- Keep project names short: 2 to 3 words when generated by SpecFlow.
- Keep phase names short: ideally 1 to 4 words.
- Keep ticket titles short: ideally 2 to 6 words.
- Do not use ampersands in authored prose, generated copy, headings, or labels. Write `and`.

## 7. Architecture Constraints

### Artifact store staged commit model

All mutations to `specflow/` follow the staged commit model:

1. Build the full output in a temp attempt directory.
2. Validate and write a temp manifest.
3. Atomically commit by updating the authoritative pointer in `run.yaml`.
4. Refresh in-memory maps from committed files.

Never write directly to committed artifact paths. Never skip the temp-rename pattern for single-file writes. Writes are serialized with a per-run lock. Concurrent operations against the same run must be rejected with a retryable conflict error.

### LLM calls go through the backend runtime

The UI never calls provider APIs directly. Planner, Verifier, and Audit operations go through backend-owned handlers reached through the Tauri sidecar bridge. Provider keys are read from `.env`. Do not pass API keys through client payloads.

### Workflow contract and execution gates

Step order, review kinds, labels, and prerequisite review rules are defined in `packages/app/src/planner/workflow-contract.ts`. Initiative-linked execution gating is centralized in `packages/app/src/planner/execution-gates.ts`. Do not duplicate or diverge from those rules in route handlers or UI logic.

### Streaming and reconnection

Desktop mode uses request-scoped sidecar notifications routed through the Tauri bridge. Reconnection remains non-resumable with snapshot refresh: on disconnect, the client refreshes persisted state instead of replaying buffered events. Do not implement event replay buffers.

## 8. Input Validation, Security, and Data Contracts

### Input validation

All server-side input validation lives in `packages/app/src/validation.ts`. Use these helpers instead of ad-hoc checks:

- `isValidEntityId(id)` validates entity ID format (`prefix-{8 hex chars}`)
- `isContainedPath(root, target)` prevents directory traversal
- `isValidGitRef(ref)` validates git branch and commit refs
- `sanitizeSseEventName(event)` strips unsafe chars from SSE event names

When adding routes that accept entity IDs or file paths, validate before constructing filesystem paths or passing values to git commands.

### API key handling

The server redacts `apiKey` from all API responses. Clients receive `hasApiKey: boolean` instead. The raw key is only ever sent from client to server through the desktop `config.save` path via `ConfigSavePayload`. Never include the raw key in any API response, log line, or error message.

### Secrets

Never commit secrets or provider API keys.

- Keep provider keys in `.env`: `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- Keep `specflow/config.yaml` non-secret: `provider`, `model`, `host`, `port`, `repoInstructionFile`
- `.env.example` may be committed; `.env` must remain ignored

### GitHub issue import

The `import.githubIssue` runtime action fetches a GitHub issue and feeds it through the triage pipeline. It reads `GITHUB_PERSONAL_ACCESS_TOKEN` or `GITHUB_TOKEN` from the environment at request time. No GitHub credentials are stored in the artifact store or returned in API responses.

### Ticket dependency fields

`Ticket` carries two required arrays: `blockedBy: string[]` and `blocks: string[]`. Older YAML files that lack these fields are normalized to empty arrays in `packages/app/src/store/internal/loaders.ts`. When adding literals that satisfy `Ticket`, always include both fields.

## 9. Testing Standards

Backend tests use Vitest under `packages/app/test` and are split by domain. Client tests use Vitest and React Testing Library under `packages/client/src/**/*.test.tsx`.

Add or adjust tests when modifying server routes, verifier or diff logic, bundle generation, artifact store semantics, or client behavior with meaningful UI state. If behavior changes and tests do not exist, add them.

Do not mock behavior you can test directly. Do not write tests that only assert that a mock was called.

## 10. Refactor Triggers

Propose a refactor instead of silently continuing when any of the following are true:

- a file reaches 600 LOC
- a function exceeds roughly 60 lines and handles more than one concern
- a module imports from more than 8 other internal modules
- a route handler contains business logic that belongs in a service layer
- a component manages both data fetching and complex render logic in the same file

When proposing a refactor, name the file, the problem, the proposed split, and the new module names with their responsibilities. Wait for confirmation before executing if the refactor would touch more than 3 files.

## 11. Stop Rules

Stop and report rather than continuing when:

- you have made three attempts to fix the same failing test or type error and it is still failing
- a fix requires a non-trivial change in a file you were not given context for
- you are about to make a destructive filesystem or git operation that was not explicitly requested
- you cannot determine whether a change is safe without running the app end to end and you do not have that capability
- a fix requires more infrastructure than the feature itself -- the problem is upstream

Do not spiral on repeated failed variants of the same fix. Report what you tried, what failed, and what you believe the root cause is.

## 12. Reporting Standards

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

## 13. Commit and PR Guidelines

Use concise imperative commit subjects, for example:

- `Implement run audit actions and run detail endpoints`
- `Fix coverage-gate banner rendering on stale initiatives`
- `Refactor artifact-store into writer and loader modules`

PRs must include:

- what changed and why
- linked issue(s), for example `#8`
- docs updates in `README.md`, `docs/README.md`, or design docs when applicable
- screenshots or GIFs for user-visible UI changes

## 14. GitHub Issue Process (Required on This Machine)

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
