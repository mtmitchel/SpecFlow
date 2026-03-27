# CLAUDE.md

This file reinforces the repo-root [AGENTS.md](./AGENTS.md) for Claude Code.

Read `AGENTS.md` first. Follow it without exception. If this file and `AGENTS.md` ever diverge, `AGENTS.md` wins.

Keep this file as a compact operational mirror, not a second competing spec. When repo-wide guidance changes, update `AGENTS.md` first and then sync `CLAUDE.md`.

For the principles and guardrails behind these rules, see [docs/guidelines/development-philosophy.md](docs/guidelines/development-philosophy.md).

## Operating stance

- Ship production-grade work. Finish the task completely.
- Prefer root-cause fixes over symptom patches.
- Choose the smallest coherent scope that fully resolves the real problem.
- Do not return stubs, placeholders, TODOs, or temporary workarounds unless the user explicitly asks for them.
- Be direct. Do not hedge around known defects or incomplete work.
- Do not normalize bugs, drift, or missing verification as acceptable.
- Before every change, answer: what breaks, what gets more complex, what gets harder to debug?

## Required startup reading

Before changing code or repo-wide docs, read the docs that match the area you are touching. The minimum startup order is:

1. [README.md](./README.md)
2. [docs/runtime-modes.md](./docs/runtime-modes.md)
3. [docs/architecture.md](./docs/architecture.md)
4. [docs/workflows.md](./docs/workflows.md)

Use [docs/README.md](./docs/README.md) as the index for additional domain docs.

If the change touches product language, workflow wording, or review expectations, also read:

- [docs/product-language-spec.md](./docs/product-language-spec.md)
- [docs/ux-copy-guidelines.md](./docs/ux-copy-guidelines.md)

## Project snapshot

SpecFlow is a local-first, spec-driven development orchestrator for planning, executing, and verifying AI-agent work.

The repo is desktop-only:

- Runtime: Tauri v2 desktop shell plus persistent Node sidecar

Workspace packages:

- `packages/app`: Node business logic, shared runtime handlers, CLI, sidecar, planner, verifier, and bundle logic
- `packages/client`: React plus Vite UI with desktop transport adapters
- `packages/tauri`: Tauri v2 shell and Rust bridge

Runtime data lives under `specflow/`. There is no database. For the detailed directory tree, see [docs/repo-layout.md](docs/repo-layout.md).

## Canonical commands

Use these commands. Do not invent variations.

```bash
npm install
npm run setup:git-hooks
npm run check
npm test
npm run dev
npm run tauri dev
npm run ui
npm run package:desktop
git status -sb
```

Direct CLI examples during development:

```bash
tsx packages/app/src/cli.ts ui --no-open
tsx packages/app/src/cli.ts export-bundle --ticket <ticket-id> --agent codex-cli
tsx packages/app/src/cli.ts verify --ticket <ticket-id>
```

Command notes:

- `npm run tauri dev` is the primary development loop. `npm run dev` is an alias.
- `npm run ui` launches from source and requires an existing desktop binary.
- If sidecar method names or the desktop transport contract change while a desktop dev session is already running, restart `npm run tauri dev` before validating the new flow.
- `npm run check` is the required pre-finish gate for normal development. It runs ESLint, both TypeScript checks, the UI dedupe gate, and automated guardrail checks (test-skip, error-handling, adapter-drift).
- `npm test` runs the backend and client Vitest suites.
- `npm run package:desktop` is explicit packaging only. It is not part of the normal development loop.
- Do not report success without real command output.

## Non-negotiable implementation rules

- Finish the task. Do not stop at the first passing state if acceptance criteria are still unmet.
- Fix broken tests or type checks in the area you touched, even if you did not introduce the breakage.
- Do not add hacks, bandaids, or deferred cleanups.
- Do not create scripts, wrappers, ADRs, or process files unless the user explicitly asks for them.
- Do not swallow errors. Surface them or log them with enough context to diagnose the failure.
- No silent fallbacks. If the system degrades to a reduced mode, log at warn level or surface a user-visible indicator.
- No new runtime dependencies without explicit approval.

Do not introduce:

- magic constants without named exports
- `// @ts-ignore` or `as any` without a reasoned comment directly above the line
- disabled lint rules without a documented reason
- comments such as `temporary` or `fix later`

## Refactor triggers

Stop and propose a refactor plan when any of these become true:

- a file reaches or exceeds 600 LOC
- a function grows past roughly 60 lines and handles multiple concerns
- a module imports from more than 8 internal modules
- a route handler starts owning business logic
- a component mixes data fetching with heavy render orchestration in one file

If the refactor would touch more than 3 files, wait for confirmation before executing it.

## Architecture invariants

- Keep desktop-only as the default mental model.
- Keep the browser away from provider APIs and raw provider secrets. LLM access stays in backend-owned handlers.
- Keep the artifact store staged. Mutations to `specflow/` must prepare output in a temp attempt directory, validate, atomically commit, and then refresh in-memory maps.
- Keep workflow rules centralized in `packages/app/src/planner/workflow-contract.ts` and execution gating centralized in `packages/app/src/planner/execution-gates.ts`.
- Keep desktop streaming request-scoped through the Tauri bridge.
- Keep reconnection snapshot-based. Do not implement event replay buffers.

## TypeScript and shared-contract rules

- Follow `.editorconfig`: UTF-8, LF, final newline, trimmed trailing whitespace.
- Use explicit interfaces for shared entities and API payloads.
- Shared TypeScript types live in `packages/app/src/types/`. Do not duplicate cross-package shapes.
- Use `.js` extensions in imports inside `packages/app` source.
- Do not annotate React component return types with `: JSX.Element`.
- Use `ConfigSavePayload` for `config.save` writes and `Config` for reads.
- `AgentTarget` is the canonical agent-selection type. Import it from shared types instead of re-declaring it.
- `Ticket` requires both `blockedBy: string[]` and `blocks: string[]`.

## Client, UI, and copy rules

- Treat duplicated or near-duplicated UI meaning as a defect. `npm run check` enforces this with the UI dedupe gate.
- Use design tokens from `packages/client/src/styles/base.css`. Do not hardcode repeated visual values.
- Use shared UI utility classes from `shared-ui.css` when they already cover the need.
- Never use `transition: all`.
- Never use native browser confirmation dialogs. Use `useConfirm()`.

Keep SpecFlow language aligned with the canonical product model:

- dominant mental model: `guided planning workspace`
- canonical workflow nouns: `Brief`, `Core flows`, `PRD`, `Tech spec`, `Validation`, `Tickets`, `Runs`
- canonical execution nouns: `Handoff`, `Verification`
- canonical phrases: `Brief intake`, `Review changes`, `Project folder`, `Up next`, `Needs attention`
- canonical planning term: `quality strategy`
- legacy internal alias only when technically necessary: `verification`

Do not let UI or docs drift toward:

- intake questionnaire
- document archive
- internal agent control panel
- raw workflow-state jargon in default user copy
- ampersands in authored prose or UI copy

Copy and naming rules:

- Use sentence case for headings, section titles, buttons, labels, badges, statuses, project names, phase names, and ticket titles.
- Sentence case means: capitalize the first word, proper nouns, approved acronyms, and the first word after a colon. Lowercase the rest.
- Keep generated project names short: 2 to 3 words.
- Keep phase names short: ideally 1 to 4 words.
- Keep ticket titles short: ideally 2 to 6 words.
- Do not use ampersands. Write `and`.

## Validation, security, and secrets

All server-side validation lives in `packages/app/src/validation.ts`. Reuse the shared helpers:

- `isValidEntityId(id)`
- `isContainedPath(root, target)`
- `isValidGitRef(ref)`
- `sanitizeSseEventName(event)`

Security rules:

- Never expose raw provider API keys in responses, logs, or errors.
- The server returns `hasApiKey: boolean`, not the raw key.
- Provider secrets live in repo-root `.env` only.
- `specflow/config.yaml` stays non-secret.
- GitHub issue import reads `GITHUB_PERSONAL_ACCESS_TOKEN` or `GITHUB_TOKEN` from the environment at request time.

## Testing and verification

- Backend tests live in `packages/app/test`.
- Client tests live under `packages/client/src/**/*.test.tsx`.
- Before finishing normal development work, run `npm run check && npm test`.
- Add or adjust tests when behavior changes in routes, planner or verifier logic, diff behavior, bundle generation, artifact-store semantics, or meaningful client UI state.
- Do not mock behavior that can be tested directly.
- Do not write tests that only assert that a mock was called.

## Stop rules

Stop and report instead of continuing when:

- the same failing test or type error still fails after 3 attempts
- a safe fix requires a non-trivial change in a file you were not given context for
- you are about to make a destructive filesystem or git operation that was not explicitly requested
- safety depends on an end-to-end run you cannot perform
- a fix requires more infrastructure than the feature itself -- the problem is upstream

Do not spiral on repeated variants of the same failed fix. Report what you tried, what failed, and the likely root cause.

## Reporting requirements

When reporting completed work, include:

- what changed: exact files modified, each with a one-line description
- scope rationale: why the chosen scope matched the root cause
- test results: real output from `npm run check && npm test`
- packaging status: real output from `npm run package:desktop` when packaging was requested or performed
- what is not done: any remaining acceptance-criteria gap
- known risks: any uncertainty or follow-up risk

Every substantive assistant response must end with a `Next steps` section. That close must recommend one concrete immediate action, written in imperative language, and explain why it is the right next move.

## GitHub process on this machine

Use the local wrapper as the only GitHub MCP entrypoint:

- MCP server name: `github`
- backing command: `/home/mason/bin/mcp-github-server`

Run this auth gate before any GitHub read or write:

```bash
~/bin/mcp-github-server --auth-check
```

Exit `0` means proceed. Non-zero means stop and fix auth first.

Useful checks:

- `~/bin/mcp-github-server --preflight`
- `~/bin/mcp-github-server --health-check`
- `~/bin/mcp-github-server --clear-cache`
- `~/bin/mcp-github-server --force-refresh`

Auth model:

- token source of truth: Bitwarden Secrets Manager (`bws`)
- runtime cache: kernel keyring (`keyctl`), key `github-mcp-token`, 24h TTL
- the wrapper exports `GITHUB_PERSONAL_ACCESS_TOKEN` and `GITHUB_TOKEN` only for the launched MCP process

Rules:

- do not use Docker GitHub MCP auth
- do not use `gh auth status` as the gate
- do not use any GitHub path other than the wrapper above
- `--auth-check` is authoritative

## Read next

- [AGENTS.md](./AGENTS.md)
- [docs/guidelines/development-philosophy.md](./docs/guidelines/development-philosophy.md)
- [docs/repo-layout.md](./docs/repo-layout.md)
- [README.md](./README.md)
- [docs/README.md](./docs/README.md)
- [docs/runtime-modes.md](./docs/runtime-modes.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/workflows.md](./docs/workflows.md)
- [docs/product-language-spec.md](./docs/product-language-spec.md)
- [docs/ux-copy-guidelines.md](./docs/ux-copy-guidelines.md)

<!-- sync: AGENTS.md @ a2c358fa1439 -->
