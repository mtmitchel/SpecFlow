# Epic: Designing SpecFlow - A Spec-Driven Development Orchestrator

---

# T1 - Repo Scaffold + CLI Init

## Purpose

Establish the canonical `specflow/` directory layout, the `specflow init` command, and the `specflow ui` server-start entry point. This ticket has no dependencies and unblocks the entire dependency chain.

## Scope

- `specflow init` command: creates `specflow/` directory tree, writes starter `config.yaml` with defaults, writes starter `AGENTS.md` template, warns (does not block) if not a git repo
- `specflow ui` flags: `--port`, `--host` (default `127.0.0.1`), `--no-open`
- `packages/app` package setup: TypeScript config, Commander.js CLI entry, build scripts
- `packages/client` package setup: React + Vite scaffold, TypeScript config, build output wired into `packages/app/src/static/`
- Shared type stubs in `packages/app/src/types/` (entity interfaces only - no logic)
- `specflow/` directory layout as defined in the Tech Plan

### Directory layout produced by `specflow init`

```text
specflow/
  config.yaml
  AGENTS.md
  initiatives/
  tickets/
  runs/
  decisions/
```

### `config.yaml` defaults

```yaml
provider: anthropic
model: claude-opus-4-5
apiKey: ""
port: 3141
host: 127.0.0.1
repoInstructionFile: specflow/AGENTS.md
```

## Out of Scope

- No actual server logic (T3)
- No artifact store (T2)
- No LLM calls (T4)
- No board UI beyond scaffold (T8)

## Spec References

- `spec:54e3ce1d-93b2-4fff-8e57-b3284fe34e06/f78e8aa2-a7bf-4cec-aa8f-ef4b52cb45a7` - Package Structure, File Layout, Local-Only Binding sections
- `spec:54e3ce1d-93b2-4fff-8e57-b3284fe34e06/1023dc12-32ea-401e-bbd9-d740b55bf69b` - Non-Goals (local-only, no cloud)

## Dependencies

None - this is the root ticket.

## Done Means

- `specflow init` runs in an empty directory and produces the correct `specflow/` layout with no errors
- `specflow init` in a non-git directory prints a warning but does not exit with error
- `specflow init` in an already-initialized directory is idempotent (does not overwrite existing files)
- `specflow ui --port 4000 --no-open` starts without crashing (server stub acceptable at this stage)
- TypeScript compiles cleanly for both packages with no errors
- `packages/client` Vite build produces output that `packages/app` can reference

