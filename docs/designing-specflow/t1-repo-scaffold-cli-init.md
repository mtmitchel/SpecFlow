# Epic: Designing SpecFlow - A Spec-Driven Development Orchestrator

---

# T1 - Repo Scaffold + CLI Runtime Foundation

## Purpose

Establish the monorepo/workspace foundation for SpecFlow runtime delivery: Node/TypeScript backend, React client build pipeline, and CLI entry points for UI startup, bundle export, and verification.

## Scope

- Workspace scaffold with root `package.json` + npm workspaces for `packages/app` and `packages/client`
- `packages/app` TypeScript backend package with:
  - Fastify server entry
  - Commander CLI entry
  - core services (artifact store, planner, bundle generator, verifier)
- `packages/client` React + Vite app served by backend static hosting
- CLI commands:
  - `specflow ui`
  - `specflow export-bundle`
  - `specflow verify`
- Runtime artifact layout under `specflow/` (`initiatives/`, `tickets/`, `runs/`, `decisions/`, `config.yaml`)

### Runtime layout

```text
specflow/
  config.yaml
  AGENTS.md
  initiatives/
  tickets/
  runs/
  decisions/
```

### `config.yaml` fields (non-secret)

```yaml
provider: openrouter
model: openrouter/auto
port: 3141
host: 127.0.0.1
repoInstructionFile: specflow/AGENTS.md
```

Provider API keys are expected from `.env` (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).

## Out of Scope

- No dedicated `specflow init` command in the current implementation
- No automatic subprocess execution of external coding agents
- No cloud sync or multi-user orchestration

## Spec References

- `spec:54e3ce1d-93b2-4fff-8e57-b3284fe34e06/f78e8aa2-a7bf-4cec-aa8f-ef4b52cb45a7` - Package Structure, File Layout, Local-Only Binding sections
- `spec:54e3ce1d-93b2-4fff-8e57-b3284fe34e06/1023dc12-32ea-401e-bbd9-d740b55bf69b` - Non-Goals (local-only, no cloud)

## Dependencies

None - this is the root ticket.

## Done Means

- `npm run build` compiles `packages/client` and `packages/app`
- `npm test` passes app service/unit/integration coverage
- `npm run ui` starts the local board/API on configured host/port
- CLI `export-bundle` and `verify` run end-to-end (server-delegated when available)
- Runtime artifacts are persisted under `specflow/` with staged commit semantics for run operations
