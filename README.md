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

## Workspace Commands

```bash
npm test
npm run build
npm run ui
```

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
- Keep `specflow/config.yaml` non-secret (`provider`, `model`, `host`, `port`, `repoInstructionFile`).
- `.env` is ignored by git; `.env.example` is safe to commit.

Note: `apiKey` may still appear in `config.yaml` as a legacy fallback field, but `.env` is the recommended and documented source of truth.

## Project Layout

- `packages/app`: Fastify API server, CLI, bundle/export/verify services
- `packages/client`: React board UI
- `docs/`: product flows, technical plan, and ticket artifacts
- `specflow/`: runtime artifacts (tickets, runs, initiatives, decisions, config)
