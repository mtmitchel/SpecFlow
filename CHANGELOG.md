# Changelog

All notable changes to SpecFlow are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

---

## [0.2.0] - 2026-02-28

### Added

**Verification quality**
- `severity` (Critical/Major/Minor/Outdated) and `remediationHint` fields on `RunCriterionResult`
- Expanded verifier LLM prompt: evidence-quality standards, severity classification guidance, partial-fulfillment reasoning, and regression comparison against prior attempts

**Audit quality**
- LLM-powered audit (`buildAuditFindingsWithLlm`) replaces keyword matching when an API key is configured
- Audit finding categories expanded to: `bug | performance | security | clarity` (alongside legacy `drift | acceptance | convention`)
- Confidence score field on `AuditFinding`

**Planning quality**
- Repo context scanning (`repo-scanner.ts`): `git ls-files` + key config files condensed into a file tree injected into plan prompts, grounding file targets in the actual codebase
- `mermaidDiagram` field on `Initiative` and `PlanResult`; planner prompt includes Mermaid diagram contract
- Mermaid phase-dependency diagram rendered on initiative detail page (`MermaidView` component with DOMPurify SVG sanitization)

**LLM streaming**
- Real SSE token streaming for both Anthropic and OpenAI/OpenRouter providers; previously the client simulated streaming after a full response
- `max_tokens` is now configurable per job type (8192 for plans, 4096 for verification)

**Fix-forward loop**
- `exportMode: "quick-fix"` on `POST /api/tickets/:id/export-bundle`; enriches the bundle with verification failure context and remediation hints
- Ticket detail page: attempt counter, enriched re-export button, and "Re-verify Now" button after quick-fix export

**GitHub Issue import**
- `POST /api/import/github-issue`: fetches a GitHub Issue and feeds it through the triage pipeline
- Requires `GITHUB_PERSONAL_ACCESS_TOKEN` or `GITHUB_TOKEN` in the environment
- Import panel on the Tickets page

**Ticket dependencies**
- `blockedBy: string[]` and `blocks: string[]` on `Ticket`
- Planner wires inter-phase ticket dependencies automatically at plan generation time
- `PATCH /api/tickets/:id` returns 409 when transitioning to `in-progress` with unfinished blockers
- Blockers banner on ticket detail page
- Backwards-compatible loader normalisation for existing YAML files that lack these fields

**Client reliability**
- Root `ErrorBoundary` catches rendering crashes and presents a recovery UI
- `ToastContext` surfaces API errors (LLM rate limits, invalid keys, conflict errors) that were previously silent
- Targeted `setSnapshot` updates after mutations instead of full `refreshArtifacts()` round-trips

**Input validation**
- `isValidEntityId()` applied to all `:id` route parameters
- `isValidGitRef()` applied to branch and commit-range inputs in audit routes

**Markdown rendering**
- Replaced hand-rolled renderer with `react-markdown` + `remark-gfm`; code blocks, tables, bold/italic, and links now render correctly

### Changed
- `upsertInitiative` skips `reloadFromDisk()` for metadata-only updates; only reloads when doc files (brief, PRD, tech spec) change
- `AuditFinding.category` type widened to include `bug | performance | security | clarity`

---

## [0.1.0] - 2026-01-15

Initial release.

### Added

**Core workflow loop**
- Four named workflows: Groundwork, Milestone Run, Quick Build, Drift Audit
- `specflow ui` starts a Fastify server + React board on `localhost:3141`
- `specflow export-bundle` and `specflow verify` CLI commands with prefer-server delegation

**Planner**
- Spec generation (Brief, PRD, Tech Spec) from free-text initiative descriptions
- Phase + ticket plan generation with acceptance criteria, implementation plans, and file targets
- Quick Task triage: small tasks become tickets, large tasks convert to draft initiatives

**Verification**
- Git-based diff verification using `simple-git`
- Snapshot-based verification (no-git path) with scope captured at export time
- Dual-diff model: primary diff for verification, drift diff for warnings
- Per-criterion pass/fail with evidence; drift flags for unexpected file touches

**Bundle export**
- Agent-specific bundle renderers: Claude Code, Codex CLI, OpenCode, Generic
- Flat clipboard string + directory bundle, both from the same generator
- Quick-fix export with source run and finding ID linkage metadata
- Versioned `bundle-manifest.yaml` with content digest

**Artifact Store**
- In-memory typed maps for all entities; all reads served from memory
- Staged commit model with per-run operation leases and atomic temp-rename writes
- Startup recovery: orphaned operations classified as `abandoned`, `superseded`, or `failed`
- File watcher (chokidar) for external YAML edits

**Drift Audit**
- Diff source selection: current git diff, git branch, commit range, snapshot
- Finding categorisation: drift, acceptance, convention
- Per-finding actions: create ticket, export fix bundle, dismiss with note

**Board UI**
- Kanban board: Backlog / Ready / In Progress / Verify / Done
- Initiative detail with Brief, PRD, Tech Spec tabs
- Run detail with diff viewer and verification panel
- Settings page: provider, model, API key; OpenRouter model picker
- SSE streaming for planner and verification progress
