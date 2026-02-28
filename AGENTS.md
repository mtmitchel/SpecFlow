# Repository Guidelines

## Project Structure & Module Organization

Core runtime and docs live together as an npm workspace:

- `packages/app`: Fastify server, CLI, and all backend services
- `packages/client`: React + Vite board UI
- `docs/designing-specflow/`: product and technical planning artifacts
- `README.md` and `docs/README.md`: entry points for setup and docs index

Runtime data is persisted under `specflow/` (`config.yaml`, `initiatives/`, `tickets/`, `runs/`, `decisions/`).

### packages/app source layout

```
src/
  bundle/           bundle generation and agent-specific renderers
    internal/       helpers: agents-md, context-files, manifest, operations, snapshot
  cli/              Commander.js entry point and command modules (ui, export-bundle, verify)
    commands/
  config/           env key resolution
  io/               file I/O: agents-md (secure loader), atomic-write, paths, yaml
  llm/              LLM provider client and error types
  planner/          spec + plan generation service
    internal/       helpers: agents-md, config, job-executor, ticket-factory, validators
  server/           Fastify HTTP server
    audit/          drift audit logic (findings, report-store, types)
    routes/         one file per domain: import, initiative, operation, provider, run, runtime, ticket
    sse/            SSE session management
    validation.ts   security validators (see Security section)
    zip/            bundle ZIP streaming
  store/            in-memory artifact store with staged commits
    internal/       helpers: cleanup, fs-utils, loaders, operations, recovery, watcher
    types.ts        PreparedOperationArtifacts interface (shared between store and operations)
  types/            core entity types (Initiative, Ticket, Run, Config, etc.)
  verify/           verification and diff engine
    diff/           git-strategy, snapshot-strategy, patch-utils, path-utils, types
    internal/       helpers: agents-md, config, criteria, operations, prompt
```

### packages/client source layout

```
src/
  api/              one module per domain: artifacts, audit, http, import, initiatives, runs, settings, sse, tickets
  app/
    components/     shared UI: diff-viewer, markdown-view, mermaid-view
    constants/      status-columns (Kanban column definitions)
    hooks/          use-sse-reconnect
    layout/         app-shell (left nav + main content frame)
    pages/          one file per page/panel
    routing/        navigate-to-tickets (catch-all redirect)
    utils/          phase-warning, specs
  api.ts            consolidated re-export of all API modules
  App.tsx           root component, ArtifactsSnapshot state, refreshArtifacts callback
  types.ts          all client-facing types including AgentTarget, Config, ConfigSavePayload
```

## Build, Test, and Development Commands

Use these canonical commands:

- `npm install` - install workspaces
- `npm test` - run backend Vitest suite
- `npm run build` - build client and backend
- `npm run ui` - build and start local server/UI
- `git status -sb` - quick working tree check

Direct CLI examples (after build):

- `node packages/app/dist/cli.js ui --no-open`
- `node packages/app/dist/cli.js export-bundle --ticket <ticket-id> --agent codex-cli`
- `node packages/app/dist/cli.js verify --ticket <ticket-id>`

## Coding Style & Naming Conventions

- Follow `.editorconfig`: UTF-8, LF, final newline, trimmed trailing whitespace.
- TypeScript: explicit interfaces for shared entities and API payloads.
- Markdown docs: concise sections with clear scope boundaries.
- File names use kebab-case unless framework conventions require otherwise.

### React / client conventions

- Do **not** annotate component return types with `: JSX.Element`. The global `JSX` namespace was removed in `@types/react@19`. TypeScript infers component return types correctly without annotations.
- Use `ConfigSavePayload` (from `types.ts`) when sending config to the server via `PUT /api/config`. Use `Config` for reading. The server returns `hasApiKey: boolean` instead of the raw API key -- never expose the key through API reads.
- `AgentTarget` is the shared type for agent selection (`"claude-code" | "codex-cli" | "opencode" | "generic"`). Import from `../types` rather than re-declaring locally.

## Testing Guidelines

Backend tests use Vitest under `packages/app/test`. Test files are split by domain:

- `artifact-store.test.ts` - in-memory store semantics, staged commits, file watcher
- `atomic-write.test.ts` - atomic temp-rename writes
- `bundle-generator.test.ts` - bundle generation, agent renderers, manifest versioning
- `llm-client.test.ts` - LLM streaming and error handling
- `planner.test.ts` - spec generation, JSON parsing, job orchestration
- `verifier.test.ts` - verification pass/fail logic, drift flags
- `server/audit-routes.test.ts` - drift audit endpoints
- `server/initiative-routes.test.ts` - initiative CRUD and spec generation
- `server/provider-routes.test.ts` - model discovery, provider configuration
- `server/run-routes.test.ts` - run detail, bundle ZIP download
- `server/runtime-status.test.ts` - server health/capability probes
- `server/ticket-routes.test.ts` - ticket CRUD, export, capture, SSE

Add or adjust tests when modifying server routes, verifier/diff logic, bundle generation, or artifact store semantics. Before pushing, run `npm test` and `npm run build`.

## Code Quality Policy

If you are working on a feature or module and encounter errors or failing tests that you did not introduce, you are still responsible for fixing them. We do not ship broken code. All type-check errors and test failures in the areas you touch must be resolved before your work is considered complete.

## Commit & Pull Request Guidelines

Use concise imperative commit subjects, for example:

- `Implement run audit actions and run detail endpoints`
- `Update docs for .env-based provider configuration`

PRs should include:

- What changed and why
- Linked issue(s) (for example, `#8`)
- Any docs updates (`README.md`, `docs/README.md`, or design docs)
- Screenshots/GIFs for user-visible UI changes

## GitHub Issue Process (Required on this Machine)

Use the local MCP wrapper only:

- Server command: `/home/mason/bin/mcp-github-server`

Run this auth gate before any GitHub read/write:

- `~/bin/mcp-github-server --auth-check`
- Exit `0`: proceed
- Non-zero: stop and fix auth first

Optional checks:

- `~/bin/mcp-github-server --preflight`
- `~/bin/mcp-github-server --health-check`

Issue workflow:

1. Auth check
2. List/search for duplicates
3. Create/update issue
4. Add progress comments
5. Update labels/assignees/state as needed

Rules:

- Do not use Docker GitHub MCP auth.
- Do not use `gh auth status` as auth gate.
- `--auth-check` is authoritative.

## Security & Configuration Tips

- Never commit secrets or provider API keys.
- Keep provider keys in `.env` (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).
- Keep `specflow/config.yaml` non-secret (`provider`, `model`, `host`, `port`, `repoInstructionFile`).
- `.env.example` may be committed; `.env` must remain ignored.

### Input validation

All server-side input validation lives in `packages/app/src/server/validation.ts`. Use these helpers rather than ad-hoc checks:

- `isValidEntityId(id)` - validates entity ID format (`prefix-{8 hex chars}`)
- `isContainedPath(root, target)` - prevents directory traversal (resolved target must be under root)
- `isValidGitRef(ref)` - validates git branch and commit refs (no leading dash, safe chars only)
- `sanitizeSseEventName(event)` - strips unsafe chars from SSE event names

When adding new routes that accept entity IDs or file paths, validate with these before constructing filesystem paths or passing to git commands.

### API key handling

The server redacts `apiKey` from all API responses. Clients receive `hasApiKey: boolean` (from `GET /api/artifacts` and `PUT /api/config`). The raw key is only ever sent from client to server on `PUT /api/config` via `ConfigSavePayload`. Never include the raw key in any API response.

### GitHub Issue import

`POST /api/import/github-issue` fetches a GitHub issue and feeds it through the triage pipeline. It reads `GITHUB_PERSONAL_ACCESS_TOKEN` or `GITHUB_TOKEN` from the environment at request time. No GitHub credentials are stored in the artifact store or returned in API responses.

### Ticket dependency fields

`Ticket` carries two required arrays: `blockedBy: string[]` and `blocks: string[]`. Older YAML files that lack these fields are normalised to empty arrays in `loadTickets` (`packages/app/src/store/internal/loaders.ts`). When adding literals that satisfy `Ticket`, always include both fields.
