# SpecFlow

Local-first, spec-driven development orchestrator for planning, executing, and verifying AI-agent work.

SpecFlow now runs desktop-first through a Tauri v2 shell backed by a persistent Node sidecar. The existing React/Vite UI stays in `packages/client`, the business logic stays in `packages/app`, and the desktop runtime avoids binding an HTTP port during normal use.

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

`npm run tauri dev` is the primary desktop development loop. It starts the watched app build plus the Vite client dev server, and then launches the Tauri desktop shell. During startup the desktop bridge waits for the first watched `packages/app/dist/sidecar.js` output instead of requiring a separate upfront build. In desktop mode the UI talks to the bundled runtime through the Tauri bridge, not through Fastify.

`npm run dev` is an alias for `npm run tauri dev`.

For a local source launch outside the Tauri dev loop:

```bash
npm run ui
```

That runs the CLI from source. If a packaged desktop binary already exists, it launches it. If not, it falls back to the legacy Fastify + browser runtime.

If you have changed sidecar methods or desktop-only transport behavior in source, prefer `npm run tauri dev` until you rebuild the desktop app. `npm run ui` will still prefer an older packaged binary if one exists, which can leave the UI and sidecar on different revisions.

Legacy Fastify + browser mode is still available when needed:

```bash
npm run dev:web
npm run ui:web
```

In legacy web mode, the Vite client proxies `/api` requests to the watched app server on `http://127.0.0.1:3142`, and `ui:web` runs the Fastify + browser runtime from source on `http://127.0.0.1:3141`.

## Workspace Commands

```bash
npm run dev
npm run tauri dev
npm run tauri:dev
npm run dev:web
npm run lint
npm run check
npm test
npm run package:desktop
npm run package:web
npm run package:sidecar
npm run ui
npm run ui:web
```

`npm test` runs both the backend and client Vitest suites.
`npm run lint` runs the shared ESLint baseline for TypeScript, React Hooks, and general correctness issues.
`npm run check` now runs lint, both TypeScript checks, and the UI dedupe gate that fails on duplicated or near-duplicated UI copy, actions, and option labels.
`npm run tauri dev` is the explicit desktop-first development command. `npm run dev` points to the same flow.
`npm run package:desktop` is the explicit packaging command for an unsigned native desktop bundle. It is not part of the normal development loop.

Direct CLI commands during development:

```bash
tsx packages/app/src/cli.ts ui --no-open
tsx packages/app/src/cli.ts ui --legacy-web --no-open
tsx packages/app/src/cli.ts export-bundle --ticket <ticket-id> --agent codex-cli
tsx packages/app/src/cli.ts verify --ticket <ticket-id> --summary "Implemented + tests"
```

`specflow ui` is desktop-first. If the desktop binary is unavailable, it falls back to the legacy Fastify + browser runtime with a deprecation warning. `export-bundle` and `verify` remain headless CLI commands and preserve the existing prefer-server delegation behavior when a compatible server is already running.

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

## Key Features

- **Pipeline-centered planning workflow**: start with a raw idea, stay in one planning shell, and move through Brief, Core flows, PRD, Tech spec, and Tickets with one persistent initiative pipeline visible across Home, creation, planning, ticket, and run views.
- **Mandatory brief intake**: fresh initiatives always begin with a short consultation before the first brief is generated, so the product does not hallucinate scope, users, or success criteria from a single paragraph.
- **Planning reviews and cross-checks**: every major artifact can still be reviewed for gaps and cross-checked against adjacent artifacts, but those reviews are secondary artifacts instead of primary blockers between Brief, Core flows, PRD, and Tech spec.
- **Traceability-backed planning**: generated artifacts persist lightweight trace outlines, and ticket planning now builds an explicit coverage ledger from those traces so gaps are visible before execution starts.
- **Execution gating**: initiative-backed tickets carry covered spec items, and unresolved coverage checks block export and execution until the user reruns or overrides the check.
- **Action-oriented home**: the landing view is an Up next queue plus initiative cards with inline progress, so the first screen answers what needs attention now instead of showing aggregate counts.
- **Expandable sidebar workspace**: the left rail collapses to icon-only shortcuts and expands in place into a wider sidebar that reveals labels plus the active initiative hierarchy.
- **Command palette (Cmd+K)**: quick access to Quick Task, New Initiative, GitHub Import, Settings, and fuzzy entity search.
- **Direct planning entry**: `/new-initiative` flows directly into the shared Brief survey instead of bouncing through a separate handoff mode.
- **Bundle export**: packages a ticket's full context (covered spec items, criteria, specs, repo snapshot) into an agent-ready bundle for Claude Code, Codex CLI, OpenCode, or generic agents. Desktop mode saves ZIP bundles through the native file picker instead of an HTTP download anchor.
- **Verification with severity**: captures agent output and runs an LLM verifier that classifies each criterion as Critical/Major/Minor/Outdated, with remediation hints.
- **Fix-forward loop**: failed verification auto-enriches the re-export bundle with failure context; one-click re-export and re-verify.
- **Drift audit**: diff-based audit with LLM-powered finding categorisation (Bug/Performance/Security/Clarity) and finding-to-ticket creation.
- **GitHub Issue import**: `POST /api/import/github-issue` fetches a GitHub Issue and feeds it through the triage pipeline (requires `GITHUB_PERSONAL_ACCESS_TOKEN`).
- **Ticket dependencies**: tickets declare `blockedBy`/`blocks`; inter-phase ordering is wired automatically by the planner and enforced on status transitions.

## Project Layout

- `packages/app`: Fastify legacy web runtime, CLI, sidecar, bundle/export/verify services
- `packages/client`: React board UI with desktop and legacy-web transport adapters
- `packages/tauri`: Tauri v2 desktop shell and Rust bridge to the Node sidecar
- `docs/`: product docs, workflow docs, technical architecture, and review prompts
- `specflow/`: runtime artifacts (`config.yaml`, initiatives, reviews, traces, tickets, runs, decisions)

For desktop versus legacy web runtime details, see [`docs/runtime-modes.md`](docs/runtime-modes.md).
For the full docs index, see [`docs/README.md`](docs/README.md).
For backend/runtime structure, see [`docs/architecture.md`](docs/architecture.md).
For user workflow behavior, see [`docs/workflows.md`](docs/workflows.md).
For canonical user-facing terminology, see [`docs/product-language-spec.md`](docs/product-language-spec.md).
