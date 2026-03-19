# CLAUDE.md

This file provides guidance to Claude Code when working in this repository. It should match the current repo behavior, but the repo-root [AGENTS.md](./AGENTS.md) remains the stronger and more complete source of truth.

## Build and development commands

```bash
npm install
npm run setup:git-hooks
npm run lint
npm run check
npm test
npm run test:e2e
npm run tauri dev
npm run dev
npm run dev:web
npm run ui
npm run ui:web
npm run package:desktop

# Client tests only
npm run -w @specflow/client test

# Single backend test file (run from packages/app/)
npx vitest run test/artifact-store.test.ts

# Single backend test by name pattern (run from packages/app/)
npx vitest run -t "pattern"

# Type-check only
npx tsc -p packages/app/tsconfig.json --noEmit
npx tsc -p packages/client/tsconfig.json --noEmit
```

Notes:
- `npm run tauri dev` is the primary development loop. `npm run dev` is an alias.
- `npm run ui` runs the CLI from source, prefers an existing packaged desktop binary if present, and falls back to legacy web mode only when no desktop binary exists.
- `npm run check` runs ESLint, both TypeScript checks, and the UI dedupe gate.
- `npm run test:e2e` runs the Playwright browser workflow suite against the deterministic legacy-web harness. It currently covers the main initiative workflow and the core-flows review-back/update path.
- `npm run package:desktop` is explicit packaging, not part of the normal dev loop.

## Architecture

SpecFlow is a desktop-first npm workspace with three packages:

- `packages/app`: Node business logic, shared runtime handlers, CLI commands, sidecar entrypoint, legacy Fastify runtime, planner, verifier, bundle export, and store logic
- `packages/client`: React + Vite UI with desktop and legacy-web transport adapters
- `packages/tauri`: Tauri v2 shell and Rust bridge that manages the Node sidecar in desktop mode

Normal desktop use is:

`React UI -> Tauri bridge -> Node sidecar`

Legacy web fallback remains:

`React UI -> Fastify HTTP/SSE -> shared runtime handlers`

## Data and store model

All runtime data lives under `specflow/` as YAML/Markdown/JSON files. There is no database.

- `ArtifactStore` loads the workspace into in-memory Maps and persists through staged writes plus reloads.
- Long operations write into `runs/<id>/_tmp/<op-id>/` first, then commit into final locations.
- Planner-owned YAML artifacts are validated before replacing the in-memory snapshot.
- External edits under `specflow/` are watched and reloaded.

## Planning workflow

The planning flow is:

`Brief -> Core flows -> PRD -> Tech spec -> Validation -> Tickets`

Important current rules:
- Fresh initiatives always begin with a required four-question Brief intake.
- The first Core flows draft requires a short starter consultation that covers journey, branch, and flow condition.
- The first PRD draft requires at least one explicit scope-setting question.
- The first Tech spec draft requires at least one architecture question.
- Tech spec hands off into Validation, not directly into Tickets.
- Validation owns the final planning gate before tickets are committed and should ask in-place follow-up questions when those blockers can be answered without sending the user backward.
- Tickets is an execution-only phase board with a right-side ticket drawer, not the place where planning blockers or review questionnaires should live.
- Planning transition states should name the active phase directly during entry checks, follow-up checks, and artifact generation.
- Planning reviews remain important, but they are secondary artifacts rather than hard blockers between Brief, Core flows, PRD, and Tech spec.
- `ticket-coverage-review` is owned by Validation, not Tickets, and remains the real planning-to-execution gate for initiative-linked tickets.

Planner question policy lives in:
- `packages/app/src/planner/refinement-check-policy.ts`
- `packages/app/src/planner/brief-consultation.ts`
- `packages/app/src/planner/prompt-builder.ts`
- `packages/app/src/planner/internal/validators.ts`
- `packages/app/src/planner/internal/context.ts`

## Client structure

- `App.tsx` owns the top-level `ArtifactsSnapshot` and refreshes persisted state.
- `src/api/transport.ts` switches between Tauri desktop transport and legacy web transport.
- `src/app/views/initiative/` owns the planning workspace sections and orchestration hooks.
- `src/app/views/ticket/` owns bundle export, capture, verification, and override presentation.
- `src/app/layout/` owns the workspace shell, rail, navigator, and command palette.

## Conventions

- Use `.js` extensions in imports in `packages/app` source.
- Do not annotate React component return types with `: JSX.Element`.
- Use shared types from `packages/app/src/types/` and `packages/client/src/types.ts`; do not duplicate cross-module shapes.
- Never use native browser confirmation dialogs. Use `useConfirm()`.
- Treat duplicated or near-duplicated UI meaning as a defect. `npm run check` enforces this.
- Use design tokens from `packages/client/src/styles/base.css`; do not hardcode repeated visual values.

## Testing

- Backend tests live in `packages/app/test/`.
- Client tests live under `packages/client/src/**/*.test.tsx`.
- Browser E2E coverage lives in `e2e/workflow.spec.ts`.
- Before finishing meaningful work, run `npm run check` and `npm test`.
- Run `npm run test:e2e` when a change affects initiative workflow handoffs, planning review-back flows, or other multi-step browser journeys.
- Desktop packaging and full manual desktop click-through are separate tasks; do not assume they were run unless explicitly stated.

## GitHub access

Use the local wrapper as the only GitHub MCP entrypoint:

- MCP server name: `github`
- Backing command: `/home/mason/bin/mcp-github-server`

Auth gate before any GitHub read or write:

```bash
~/bin/mcp-github-server --auth-check
```

Do not use Docker GitHub auth or `gh auth status` as the gate.

## Read next

- [AGENTS.md](./AGENTS.md)
- [README.md](./README.md)
- [docs/runtime-modes.md](./docs/runtime-modes.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/workflows.md](./docs/workflows.md)
- [docs/product-language-spec.md](./docs/product-language-spec.md)
- [docs/ux-copy-guidelines.md](./docs/ux-copy-guidelines.md)
