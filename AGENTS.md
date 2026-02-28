# Repository Guidelines

## Project Structure & Module Organization
Core runtime and docs now live together:
- `packages/app`: Fastify server, CLI, artifact store, planner/verifier/bundle services
- `packages/client`: React + Vite board UI
- `docs/designing-specflow/`: product and technical planning artifacts
- `README.md` and `docs/README.md`: entry points for setup and docs index

Runtime data is persisted under `specflow/` (`config.yaml`, `initiatives/`, `tickets/`, `runs/`, `decisions/`).

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

## Testing Guidelines
- Backend tests use Vitest under `packages/app/test`.
- Add/adjust tests when modifying:
  - server routes (`server.test.ts`)
  - verifier/diff logic (`verifier.test.ts`)
  - bundle generation (`bundle-generator.test.ts`)
  - artifact store semantics (`artifact-store.test.ts`)
- Before pushing, run `npm test` and `npm run build`.

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
- Keep `specflow/config.yaml` non-secret (provider/model/host/port/repoInstructionFile).
- `.env.example` may be committed; `.env` must remain ignored.
