# SpecFlow

Local-first, spec-driven development orchestrator for planning, executing, and verifying AI-agent work.

SpecFlow runs through a Tauri v2 shell backed by a persistent Node sidecar. The existing React/Vite UI stays in `packages/client`, the business logic stays in `packages/app`, and the desktop runtime avoids binding an HTTP port during normal use.

## Prerequisites

- Node.js 20+
- npm 10+
- Git (optional, but recommended for git-based diff verification)

## Quick Start

```bash
cp .env.example .env
# Set at least one provider key, usually OPENROUTER_API_KEY

mkdir -p specflow
cat > specflow/config.yaml <<'YAML'
provider: openrouter
model: openrouter/auto
port: 3141
host: 127.0.0.1
repoInstructionFile: specflow/AGENTS.md
YAML

npm install
npm run setup:git-hooks
npm run tauri dev
```

`npm run setup:git-hooks` configures the repo's versioned `pre-commit` and `pre-push` hooks for this clone. The hooks enforce `git diff --cached --check`, block committed build outputs, and run the repo `check`/`test` gates before commits and pushes. They intentionally do not run desktop packaging; packaging stays a separate explicit step outside normal development.

`npm run tauri dev` is the primary desktop development loop. It starts the watched app build plus the Vite client dev server, and then launches the Tauri desktop shell. During startup the desktop bridge waits for a fresh settled backend build under `packages/app/dist` before it spawns the Node sidecar, and later backend rebuilds are picked up by a bridge-owned sidecar restart before the next desktop request is sent. The dev stack now runs in raw terminal mode so closing the desktop window cleanly tears down the watched processes without the old spinner-heavy shutdown noise. In desktop mode the UI talks to the bundled runtime through the Tauri bridge, not through a local HTTP server.

`npm run dev` is an alias for `npm run tauri dev`.

For a local source launch outside the Tauri dev loop:

```bash
npm run ui
```

That runs the CLI from source and launches an existing packaged desktop binary. If no desktop binary is available, it fails closed. Use `npm run tauri dev` for source development or `npm run package:desktop` to produce a local desktop binary.

If you have changed sidecar methods or desktop-only transport behavior in source, prefer `npm run tauri dev` until you rebuild the desktop app. `npm run ui` will still prefer an older packaged binary if one exists, which can leave the UI and sidecar on different revisions.

## Workspace Commands

```bash
npm run dev
npm run tauri dev
npm run tauri:dev
npm run lint
npm run check
npm test
npm run package:desktop
npm run package:web
npm run package:sidecar
npm run ui
```

`npm test` runs both the backend and client Vitest suites.
`npm run lint` runs the shared ESLint baseline for TypeScript, React Hooks, and general correctness issues.
`npm run check` now runs lint, both TypeScript checks, and the UI dedupe gate that fails on duplicated or near-duplicated UI copy, actions, and option labels.
`npm run tauri dev` is the explicit desktop-first development command. `npm run dev` points to the same flow.
`npm run package:desktop` is the explicit packaging command for an unsigned native desktop bundle. It is not part of the normal development loop.

Direct CLI commands during development:

```bash
tsx packages/app/src/cli.ts ui
tsx packages/app/src/cli.ts export-bundle --ticket <ticket-id> --agent codex-cli
tsx packages/app/src/cli.ts verify --ticket <ticket-id> --summary "Implemented + tests"
```

`specflow ui` is desktop-only. `export-bundle` and `verify` remain headless CLI commands and run locally against the same store, bundle, and verifier services that the sidecar uses.

## Local Release Hardening

Run this checklist before shipping a local desktop build:

```bash
npm ci
npm run check
npm test
cargo check --manifest-path packages/tauri/src-tauri/Cargo.toml --locked
cargo test --manifest-path packages/tauri/src-tauri/Cargo.toml --locked
npm run -w @specflow/tauri build -- --locked
```

Release posture:

- Desktop packaging is unsigned.
- There is no built-in updater configured in `tauri.conf.json`.
- Lockfiles are required for release validation.
- The supported product runtime is desktop only.

## Configuration and Security

- Keep provider secrets in repo-root `.env` only.
- Supported environment keys:
  - `OPENROUTER_API_KEY`
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `GITHUB_PERSONAL_ACCESS_TOKEN` or `GITHUB_TOKEN` (optional, for GitHub Issue import)
- Keep `specflow/config.yaml` non-secret (`provider`, `model`, `host`, `port`, `repoInstructionFile`).
- `.env` is ignored by git; `.env.example` is safe to commit.

The Settings modal (open via Cmd+K or the rail settings button) lets you change provider, model, and API key at runtime. API keys are written through the backend into repo-root `.env`, not into `specflow/config.yaml`. For OpenRouter, a searchable model picker loads all available models. The server never returns your API key in API responses; the UI only receives redacted per-provider key status.

If an older `specflow/config.yaml` still contains a legacy `apiKey`, startup migrates it into `.env`, scrubs the YAML, and logs a rotation warning.

## Privacy

SpecFlow is local-first by default:

- Runtime data stays on disk under `specflow/`, including project artifacts, tickets, runs, and decisions.
- Provider API keys stay in repo-root `.env` and are not returned to the UI.
- Data leaves the device only when you invoke a provider-backed planner, verifier, or audit action, or when you run GitHub issue import.
- The app does not include analytics or telemetry.

## Key Features

- **Pipeline-centered planning workflow**: start with a raw idea, stay in one planning shell, and move through Brief, Core flows, PRD, Tech spec, Validation, and Tickets with project-local pipeline chrome across creation and planning surfaces, while Home, ticket, and run pages each keep their own clearer job.
- **Design-aware planning and tickets**: artifact generation, ticket planning, and quick-task drafts treat information architecture, workflow clarity, progressive disclosure, states, and system feedback as first-class requirements instead of later polish.
- **Mandatory brief intake**: fresh projects always begin with a short consultation before the first brief is generated, so the product does not hallucinate scope, users, or success criteria from a single paragraph.
- **Planning reviews and cross-checks**: every major artifact can still be reviewed for gaps and cross-checked against adjacent artifacts, but those reviews are secondary artifacts instead of primary blockers between Brief, Core flows, PRD, and Tech spec.
- **Validation-owned ticket readiness**: Validation now owns the last planning gate before tickets are committed. It drafts the ticket plan, reroutes actionable blockers into in-place follow-up questions, and only commits tickets once the plan is clear or explicitly overridden.
- **Traceability-backed planning**: generated artifacts persist lightweight trace outlines, and ticket planning now builds an explicit coverage ledger from those traces so gaps are visible before execution starts.
- **Phase-based ticket board**: Tickets now keeps phase context visible while opening the selected phase as a status-based kanban board, so board work leads straight into execution.
- **Execution gating**: project-backed tickets carry covered spec items, and unresolved Validation blockers still block export and execution until the user reruns or overrides the check.
- **Action-oriented home**: the landing view shows a new-work chooser on an empty workspace, then shifts to an Up next queue, Recent runs, and project cards with inline progress once work exists.
- **Durable re-entry**: Home's resume actions reopen the last meaningful planning surface or active project ticket, while project cards and the sidebar stay stable object entry points and run detail stays explicit history.
- **Report-first runs and guided review**: run detail stays focused on what happened and what changed, while **Review changes** opens a guided audit flow with follow-up actions and keeps advanced compare controls behind secondary disclosure.
- **Expandable sidebar workspace**: the left rail collapses to icon-only shortcuts and expands in place into a wider sidebar that reveals app actions plus the full project and quick-task hierarchy as a stable object navigator.
- **Command palette (Cmd+K)**: quick access to Quick task, New project, GitHub Import, Settings, and fuzzy entity search.
- **Direct planning entry**: the project entry route `/new-initiative` flows directly into the shared Brief survey instead of bouncing through a separate handoff mode.
- **Per-project roots**: each new project binds to the repo or folder the user selects, so SpecFlow can plan and verify many different apps from one storage workspace instead of assuming one repeated project root.
- **Phase-specific planning transitions**: planning entry, follow-up checks, and artifact generation now name the active phase directly and explain the next step instead of falling back to generic waiting copy.
- **Bundle export**: packages a ticket's full context (covered spec items, criteria, specs, repo snapshot) into an agent-ready bundle for Claude Code, Codex CLI, OpenCode, or generic agents. Desktop mode saves ZIP bundles through the native file picker instead of an HTTP download anchor.
- **Verification with severity**: captures agent output and runs an LLM verifier that classifies each criterion as Critical/Major/Minor/Outdated, with remediation hints.
- **Fix-forward loop**: failed verification auto-enriches the re-export bundle with failure context; one-click re-export and re-verify.
- **Drift audit**: diff-based audit with LLM-powered finding categorisation (Bug/Performance/Security/Clarity) and finding-to-ticket creation.
- **GitHub Issue import**: the backend `import.githubIssue` action fetches a GitHub Issue and feeds it through the triage pipeline (requires `GITHUB_PERSONAL_ACCESS_TOKEN`).
- **Ticket dependencies**: tickets declare `blockedBy`/`blocks`; inter-phase ordering is wired automatically by the planner and enforced on status transitions.

## Project Layout

- `packages/app`: CLI, sidecar, bundle/export/verify services, and shared runtime handlers
- `packages/client`: React board UI with desktop transport
- `packages/tauri`: Tauri v2 desktop shell and Rust bridge to the Node sidecar
- `docs/`: product docs, workflow docs, technical architecture, and review prompts
- `specflow/`: runtime artifacts (`config.yaml`, projects, reviews, traces, tickets, runs, decisions)

For desktop runtime details, see [`docs/runtime-modes.md`](docs/runtime-modes.md).
For the full docs index, see [`docs/README.md`](docs/README.md).
For backend/runtime structure, see [`docs/architecture.md`](docs/architecture.md).
For user workflow behavior, see [`docs/workflows.md`](docs/workflows.md).
For canonical user-facing terminology, see [`docs/product-language-spec.md`](docs/product-language-spec.md).
