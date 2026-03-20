# docs/

Documentation for SpecFlow.

## Contents

| File | What it covers |
|---|---|
| [`product-brief.md`](product-brief.md) | Problem statement, goals, success criteria, non-goals |
| [`product-ux-audit.md`](product-ux-audit.md) | End-to-end product, workflow, and UX audit with prioritized findings, target journey, and redesign roadmap |
| [`product-language-spec.md`](product-language-spec.md) | Canonical product vocabulary, phase language, status labels, CTA rules, empty states, and transition messaging |
| [`ux-copy-guidelines.md`](ux-copy-guidelines.md) | Repo-specific UX copy tone, style, and component-writing rules for user-facing UI text |
| [`workflows.md`](workflows.md) | Four user workflows (Groundwork, Milestone Run, Quick Build, Drift Audit) with step-by-step flows and state diagrams |
| [`architecture.md`](architecture.md) | Technical architecture: package structure, data model, component responsibilities, API surface, sequence diagrams |
| [`runtime-modes.md`](runtime-modes.md) | Desktop-first development and runtime modes, including `tauri dev`, legacy web fallback, sidecar expectations, and build outputs |
| [`review-prompts/`](review-prompts/) | Structured repo-review prompts for data integrity, security, client state, and product-value audits |

For setup and quick-start instructions, see the root [`README.md`](../README.md).
For coding conventions, testing guidelines, and commit rules, see [`AGENTS.md`](../AGENTS.md).
For the version history, see [`CHANGELOG.md`](../CHANGELOG.md).

Agent-facing rule: duplicated or near-duplicated UI meaning is treated as a defect. The repo-level `npm run lint` command runs the shared ESLint baseline, and `npm run check` includes that lint pass plus the hard UI dedupe gate. The configured git hooks intentionally stop short of desktop packaging, so packaging stays out of the normal commit/push loop and out of the active development loop.

Browser end-to-end coverage now lives in the root Playwright harness. Use `npm run test:e2e` to run the main project workflow and the core-flows review-back/update path against the legacy web runtime with a deterministic fake planner/verifier backend.

## Current Repository State

SpecFlow is now desktop-first. The active runtime under development is:

- `packages/app`: Node business logic, CLI commands (`ui`, `export-bundle`, `verify`), shared runtime handlers, and the persistent sidecar entrypoint
- `packages/client`: React UI for projects, tickets, runs, audits, specs, and settings
- `packages/tauri`: Tauri v2 desktop shell and Rust bridge

Legacy Fastify + browser mode remains available as a fallback and compatibility path.

All four workflows remain functional: Groundwork, Milestone Run, Quick Build, and Drift Audit.

Key capabilities in the current version:

- Action-oriented home: an Up next queue, Recent runs, and project cards with inline progress instead of a counts dashboard
- Durable re-entry: Home resume restores the last meaningful planning surface or active project ticket, while project cards and the sidebar stay stable object entry points; run detail stays historical unless the user explicitly opens it
- Report-first runs and guided review: run detail stays focused on history and outcome, while Review changes opens a guided audit flow and keeps advanced compare controls secondary
- Expandable sidebar workspace: slim icon rail for primary navigation that expands in place to reveal labels and the active project hierarchy as a stable object navigator
- Command palette (Cmd+K): Quick task, New project, GitHub Import, entity search
- Shared project pipeline: Brief -> Core flows -> PRD -> Tech spec -> Validation -> Tickets -> Execute -> Verify -> Done as one continuous visual model
- Mandatory brief intake before the first brief is generated
- Mandatory first-draft consultations for Core flows, PRD, and Tech spec with stage-specific budgets and decision types
- Shared planning transition copy that names the active phase during entry checks, follow-up checks, and artifact generation
- Direct planning entry: the project entry route `/new-initiative` flows straight into the shared Brief survey instead of a separate handoff mode, even though the user-facing term is now `Project`
- Persisted planning reviews and cross-checks remain available, but they no longer block artifact-to-artifact progression between Brief, Core flows, PRD, and Tech spec
- Validation now owns the final planning gate before tickets are committed, including in-place follow-up questions when the draft ticket plan exposes unresolved gaps
- Traceability-backed planning with artifact sidecar trace outlines
- Spec-driven ticket planning with repo context scanning (grounded file targets)
- Tickets now keep phase context visible while opening the selected phase as a status-based ticket board with direct ticket-page entry
- Validation blockers can still block project ticket export and execution until gaps are resolved or explicitly overridden
- Verification with per-criterion severity (Critical/Major/Minor/Outdated) and remediation hints
- Fix-forward loop: quick-fix export mode chains failed verification to enriched re-export to re-verify
- LLM-powered drift audit with Bug/Performance/Security/Clarity finding categories
- Real streaming progress for LLM operations through transport adapters: Tauri channels in desktop mode and SSE in legacy web mode
- GitHub Issue import via `POST /api/import/github-issue`
- Ticket dependencies with automatic inter-phase wiring and enforced status transitions

## Repo-local Codex skills

The repo-local skills under `.codex/skills/` are intended to match the current SpecFlow workflow and architecture, not generic planning advice.

| Skill | Use it for |
|---|---|
| `architecture-reviewer` | Review changes against package boundaries, shared contracts, and documented architecture ownership |
| `product-language-guardian` | Keep workflow, artifact, and UI language aligned with the canonical SpecFlow vocabulary |
| `workflow-guide` | Inspect a real project, ticket, or run and explain the next valid step, blocker, or override path |
| `ticket-readiness-checker` | Decide whether a ticket is precise enough to implement and verify safely |
| `verification-analyst` | Judge whether delivered work actually satisfies the original ticket, run, and acceptance baseline |
| `specflow-workflow-designer` | Design or critique the end-user SpecFlow workflow itself, especially planning, handoff, and review flow behavior |
| `planner-prompt-tuner` | Improve planner question policies, prompt boundaries, consultation quality, and stage handoff behavior |
| `traceability-delivery-auditor` | Audit the chain from specs to coverage to tickets to bundles to verification results |
