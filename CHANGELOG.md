# Changelog

All notable changes to SpecFlow are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

---

## [Unreleased]

### Fixed

**Code health audit**
- Fixed method catalog drift: 4 desktop features (`specs.detail`, `providers.models`, `operations.status`, `runs.attemptDetail`) were blocked by the Rust allowlist; 5 phantom entries removed
- Removed dead exports `listInitiatives` and `getRuntimeStatus` and their test mocks
- Extracted duplicated `describeIssue` utility from `loaders.ts` and `reload.ts`
- Replaced 17 inline styles with shared CSS utility classes (`m-0`, `mt-0`, `mb-0`, `flex-inline-center`, `text-muted`, `text-danger-sm`)

**LLM output validation resilience**
- Brief markdown heading mismatch now auto-corrects to match `initiativeTitle` instead of throwing
- Markdown headings with wrong sentence case now auto-correct instead of throwing (e.g., `## problem` becomes `## Problem`)

**Planning survey navigation**
- Unified "Back" and "Previous question" into a single "Back" button that walks questions first, then falls back to the previous step
- After spec generation, user now lands on the review surface instead of auto-advancing to the next step
- After validation passes with no follow-up questions, auto-navigates to tickets
- Local refinement answers are preserved when follow-up questions arrive mid-survey

### Changed

**Refactoring**
- Extracted `refinement-section.tsx` state logic into `use-refinement-state.ts` hook (614 LOC reduced to 428 LOC)


**Shell hierarchy and run framing**
- Split Home resume targets from stable project-shell navigation so Home remains the primary resume surface while the sidebar and project cards stay stable object entry points
- Added `Recent runs` to Home and removed audit history from the main resume queue so historical drill-down no longer competes with active work
- Reframed run detail as a report-first surface with compact ticket and project context instead of the full project pipeline
- Recast `Review changes` as a guided audit flow with findings-first follow-up actions and secondary disclosure for review options and diff context
- Synced the new-project entry pipeline (`/new-initiative`) to the canonical visual model so it now includes `Validation`

**Validation and ticket handoff**
- Added a first-class Validation step between Tech spec and Tickets so the planning pipeline is now `Brief -> Core flows -> PRD -> Tech spec -> Validation -> Tickets`
- Validation now owns the final planning gate before tickets are committed, including in-place follow-up questions when the draft ticket plan exposes unresolved gaps
- Tickets is now execution-only: it keeps ordered phases visible, opens the selected phase as a status-based kanban board, opens the ticket workspace directly, and no longer owns planning review dumps or question loops

**Ticket execution workspace**
- Rebuilt the ticket page around a compact ticket header, a persistent ticket-context panel, and one dominant workbench stage
- Simplified execution to a two-stage `Handoff` and `Verification` model, with automatic verification after returned work is detected
- Verification now stays explicit until the user clicks `Accept`; pass results no longer auto-close tickets
- Moved file-by-file inspection and raw diff detail out of the main ticket surface and into `Review changes` or secondary disclosure

**Project roots and verification**
- Split the SpecFlow storage root from each project's bound `Project folder`, so one workspace can plan and verify many different repos or folders
- Bound planner repo scans, bundle export, diffing, verification, and audit to the project's selected folder instead of the app workspace root

**Planning survey reliability**
- Coalesced refinement autosaves so rapid answer changes no longer race each other through the desktop mutation queue
- Stopped fresh downstream phases from timing out on a bogus save before the first question check completes
- Fixed the inline survey deck so it advances only through unresolved questions instead of looping back to already answered blockers
- Moved the final planning `Continue` action onto backend-owned combined continuation requests so Brief, Core flows, PRD, Tech spec, and Validation can persist the local draft and move forward in one foreground request
- Kept background answer saving inline and non-blocking so a slow autosave no longer strands the user on an answered-summary card

**Naming and copy guardrails**
- Added a shared design and language charter to planner prompts, ticket generation, quick-task triage, and bundle handoff
- Enforced sentence case for generated project names, phase names, ticket titles, and section headings
- Required generated project names to stay short and descriptive, and banned ampersands from generated and authored prose

**Planning and Validation UX**
- `Back` now consistently means "go to the previous stage" across planning surveys and review surfaces; question-level movement uses explicit actions such as `Previous question` and `Revise answers`
- Reopened questions now show compact prior-answer context in survey mode instead of rendering like a duplicate answer option or a separate fake card
- Choice questions always preserve an `Other` path so the user is not trapped by planner-provided option lists
- Planning document summary cards now expose the copy-to-clipboard action consistently across Brief, Core flows, PRD, and Tech spec
- Completed Validation now keeps a `Revise answers` path available, even when it has to rebuild the question deck from saved state
- Completed Validation no longer shows the old phase and ticket count sentence; it stays a simpler handoff card aligned with the other planning surfaces

**Product naming and copy polish**
- Standardized user-facing `Initiative` language to `Project` and `Projects` while keeping internal `initiative` routes and storage paths as compatibility details
- Standardized planning-shell review and handoff navigation to generic `Back` and `Continue`
- Enforced sentence case across shared headings, labels, badges, and modal chrome instead of forced uppercase styling
- Simplified the sidebar to one search entry point plus a clearer `Projects` hierarchy without the duplicate navigator search field

**Plan validation and provider hardening**
- Ticket-plan validation now emits structured coverage issues, retries once through a focused repair path, and routes attributable failures back into Validation as step-owned follow-up questions
- Validation and plan-repair provider requests now sanitize unsafe prompt text and trim volatile retry payload sections before serialization
- Reopen validation now accepts regenerated concern IDs that keep the same semantic tokens across stage/version suffixes such as `-prd` and `-v1`

**Planner workflow contract**
- Brief intake is now domain-neutral instead of note-taking-specific
- Core flows now allows one additional follow-up question beyond the required starter set
- The first PRD draft now requires an explicit scope-setting consultation
- The first Tech spec draft now requires an explicit architecture consultation
- Planner checks and generation now receive persisted refinement history so later checks can avoid same-stage duplicate re-asks
- Tech spec planning can consume lightweight repo context earlier for existing-system, compatibility, performance, and operations decisions

**Product language and workflow docs**
- Synced workflow docs, architecture docs, and product-language docs to the current consultation rules and coverage terminology
- Standardized the planning-to-execution gate language around Validation and the ticket-plan gate
- Rewrote repo-facing guidance in `CLAUDE.md` to match the current desktop-first runtime and planner behavior
- Added a repo-specific UX copy guide and linked it from the repo docs and agent instructions
- Documented the shared planning transition wording model and the current browser E2E workflow coverage

**Planner runtime and validation**
- Added a bounded repair pass for invalid non-brief phase-check results so planner validation feedback can be fed back into one retry before surfacing an error
- Split the brief workflow so the required Brief intake resolves directly into artifact generation instead of a second planner-backed brief blocker check
- Tightened Core flows stage boundaries around platform and packaging questions, same-step reopen semantics, and boolean question shape validation

**Planning UX**
- Normalized planning transition copy so phase entry checks, follow-up checks, and artifact generation all name the active phase directly
- Kept generated planning artifacts on their own review surface by default instead of auto-jumping into the next phase
- Restored reopened-question history inside the same survey deck so review-back revision flows preserve the full grouped question context

**End-to-end workflow coverage**
- Added a Playwright browser E2E harness with a deterministic planner/verifier backend
- Covered the main project workflow end to end plus the Core flows review-back/update revision path

**Repo-local Codex skills**
- Removed the generic repo-local skills that no longer matched SpecFlow's real workflow shape
- Added `specflow-workflow-designer`, `planner-prompt-tuner`, and `traceability-delivery-auditor`
- Narrowed `workflow-guide`, `product-language-guardian`, `ticket-readiness-checker`, and `verification-analyst` so each maps to a distinct current repo need

**Desktop-first runtime**
- SpecFlow now runs desktop-first through a Tauri v2 shell backed by a persistent Node sidecar
- `packages/client` remains the React/Vite UI, `packages/app` remains the Node business-logic package, and `packages/tauri` now owns the desktop shell and bridge
- Normal desktop usage no longer depends on a Fastify-bound HTTP port

**Shared runtime**
- Added transport-agnostic runtime handlers and a shared sidecar RPC contract under `packages/app/src/runtime/`
- Fastify route modules now act as legacy HTTP/SSE adapters over the shared handler layer
- Added a persistent sidecar entrypoint and dispatcher in `packages/app/src/sidecar.ts` and `packages/app/src/sidecar/`

**Client transport**
- Replaced desktop-path API calls with transport adapters over Tauri `invoke`, `Channel`, events, and native save dialogs
- Removed the stale `/api/planner/stream` reconnect assumption from the client
- Verification progress now uses request-scoped desktop events, while legacy web mode retains SSE fallback where still supported
- Desktop ZIP export now uses a native save flow instead of an HTTP-only anchor

**CLI and scripts**
- `specflow ui` is now desktop-first and falls back to legacy Fastify + browser mode with a deprecation warning
- Root `npm run tauri dev` is the primary desktop development command, with `npm run dev` as an alias
- Desktop development uses a dev-only Tauri config that disables packaged sidecar requirements
- Added sidecar packaging with `caxa` for desktop builds

**Documentation**
- Rewrote the setup and architecture docs for the desktop-first runtime
- Added `docs/runtime-modes.md` to document desktop dev, desktop build, legacy web fallback, and CLI/runtime expectations
- Documented the local-first planning continue flow and the required `tauri dev` restart boundary when bridge method names change during desktop development

## [0.3.0] - 2026-03-01

### Changed

**UI: master-detail layout replaces page-based navigation**
- Two-panel `WorkspaceShell`: 280px navigator sidebar + detail workspace; Kanban board removed
- `Navigator` component: WAI-ARIA TreeView with full keyboard navigation (ArrowUp/Down/Left/Right, Enter, Home, End); hierarchy: projects > specs/phases > tickets + Quick Tasks section; auto-expands to reveal the active route; filter input
- `CommandPalette` (Cmd+K / Ctrl+K): fuzzy search across projects, tickets, runs, and specs; inline Quick Task flow; inline GitHub Import flow; New Project shortcut; Settings shortcut
- `SettingsModal`: settings form rendered as a modal overlay at `/settings` (previously a dedicated page); `navigate(-1)` to close
- `StatusBar`: bottom bar showing per-project progress (done/blocked/in-verify counts)
- All detail views ported to `src/app/views/`: `initiative-view`, `spec-view`, `ticket-view`, `run-view`, `overview-panel`, `initiative-creator`
- `TicketView` status change: status dropdown in ticket header using `canTransition()` replaces Kanban drag-and-drop
- `SpecView`: dedicated route at `/initiative/:id/spec/:type` for inline spec editing
- `InitiativeCreator`: project-creation flow at `/new-initiative` (describe → analyze → answer questions → generate specs → navigate)
- Route canonicalization: `/tickets/:id` → `/ticket/:id`, `/initiatives/:id` → `/initiative/:id`, `/runs/:id` → `/run/:id` (backward-compat redirects in place)
- `audit-panel` moved from `pages/` to `components/`
- CSS token system: `--surface-*`, `--accent-*`, `--warning-*`, `--danger-*`, `--success-*` custom properties; `--radius-sm/md/lg/pill`; `--transition-fast/normal`; hover/focus transitions on all interactive elements
- Responsive breakpoints: navigator becomes a slide-out drawer at 1080px; compact layout at 760px

### Removed
- Kanban board (five-column ticket view)
- Page-based navigation (`initiatives-page`, `tickets-page`, `runs-page`, `specs-page`, `settings-page`)
- `app-shell` layout and `navigate-to-tickets` routing helper

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
- Mermaid phase-dependency diagram rendered on the project detail page (`MermaidView` component with DOMPurify SVG sanitization)

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
- Spec generation (Brief, PRD, Tech Spec) from free-text project descriptions
- Phase + ticket plan generation with acceptance criteria, implementation plans, and file targets
- Quick Task triage: small tasks become tickets, large tasks convert to draft projects

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
- Project detail with Brief, PRD, Tech Spec tabs
- Run detail with diff viewer and verification panel
- Settings page: provider, model, API key; OpenRouter model picker
- SSE streaming for planner and verification progress
