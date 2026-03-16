# SpecFlow

Local-first, spec-driven development orchestrator for planning, executing, and verifying AI-agent work.

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
npm run ui
```

Open `http://127.0.0.1:3141`.

For iterative development:

```bash
npm run dev
```

Open `http://127.0.0.1:5173`. The Vite client proxies `/api` requests to the watched app server on `http://127.0.0.1:3142`.

## Workspace Commands

```bash
npm run dev
npm test
npm run build
npm run ui
```

`npm test` runs both the backend and client Vitest suites.

Direct CLI commands (after `npm run build`):

```bash
node packages/app/dist/cli.js ui --no-open
node packages/app/dist/cli.js export-bundle --ticket <ticket-id> --agent codex-cli
node packages/app/dist/cli.js verify --ticket <ticket-id> --summary "Implemented + tests"
```

## Configuration and Security

- Keep provider secrets in `.env` only.
- Supported environment keys:
  - `OPENROUTER_API_KEY`
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `GITHUB_PERSONAL_ACCESS_TOKEN` or `GITHUB_TOKEN` (optional, for GitHub Issue import)
- Keep `specflow/config.yaml` non-secret (`provider`, `model`, `host`, `port`, `repoInstructionFile`).
- `.env` is ignored by git; `.env.example` is safe to commit.

The Settings modal (open via Cmd+K or navigator) lets you change provider, model, and API key at runtime. For OpenRouter, a searchable model picker loads all available models. The server never returns your API key in API responses -- the UI only shows whether a key is currently set.

## Key Features

- **Progressive planning workflow**: describe a feature, then move through Brief, Core flows, PRD, Tech spec, and Tickets with targeted blocker questions only when ambiguity would materially affect the next artifact.
- **Review gates and cross-checks**: every major artifact can be reviewed for gaps and cross-checked against adjacent artifacts before the next planning step opens.
- **Traceability-backed planning**: generated artifacts persist lightweight trace outlines, and ticket planning now builds an explicit coverage ledger from those traces so gaps are visible before execution starts.
- **Execution gating**: initiative-backed tickets carry covered spec items, and unresolved coverage checks block export and execution until the user reruns or overrides the check.
- **Master-detail layout**: navigator tree sidebar (initiatives > phases > tickets, plus aggregate views) + detail workspace; no page navigation required.
- **Command palette (Cmd+K)**: quick access to Quick Task, New Initiative, GitHub Import, Settings, and fuzzy entity search.
- **Bundle export**: packages a ticket's full context (covered spec items, criteria, specs, repo snapshot) into an agent-ready bundle for Claude Code, Codex CLI, OpenCode, or generic agents.
- **Verification with severity**: captures agent output and runs an LLM verifier that classifies each criterion as Critical/Major/Minor/Outdated, with remediation hints.
- **Fix-forward loop**: failed verification auto-enriches the re-export bundle with failure context; one-click re-export and re-verify.
- **Drift audit**: diff-based audit with LLM-powered finding categorisation (Bug/Performance/Security/Clarity) and finding-to-ticket creation.
- **GitHub Issue import**: `POST /api/import/github-issue` fetches a GitHub Issue and feeds it through the triage pipeline (requires `GITHUB_PERSONAL_ACCESS_TOKEN`).
- **Ticket dependencies**: tickets declare `blockedBy`/`blocks`; inter-phase ordering is wired automatically by the planner and enforced on status transitions.

## Project Layout

- `packages/app`: Fastify API server, CLI, bundle/export/verify services
- `packages/client`: React board UI
- `docs/`: product docs, workflow docs, technical architecture, and review prompts
- `specflow/`: runtime artifacts (`config.yaml`, initiatives, reviews, traces, tickets, runs, decisions)
