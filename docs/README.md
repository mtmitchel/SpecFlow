# docs/

Documentation for SpecFlow.

## Contents

| File | What it covers |
|---|---|
| [`product-brief.md`](product-brief.md) | Problem statement, goals, success criteria, non-goals |
| [`product-language-spec.md`](product-language-spec.md) | Canonical product vocabulary, phase language, status labels, CTA rules, empty states, and transition messaging |
| [`workflows.md`](workflows.md) | Four user workflows (Groundwork, Milestone Run, Quick Build, Drift Audit) with step-by-step flows and state diagrams |
| [`architecture.md`](architecture.md) | Technical architecture: package structure, data model, component responsibilities, API surface, sequence diagrams |
| [`runtime-modes.md`](runtime-modes.md) | Desktop-first development and runtime modes, including `tauri dev`, legacy web fallback, sidecar expectations, and build outputs |
| [`review-prompts/`](review-prompts/) | Structured repo-review prompts for data integrity, security, client state, and product-value audits |

For setup and quick-start instructions, see the root [`README.md`](../README.md).
For coding conventions, testing guidelines, and commit rules, see [`AGENTS.md`](../AGENTS.md).
For the version history, see [`CHANGELOG.md`](../CHANGELOG.md).

Agent-facing rule: duplicated or near-duplicated UI meaning is treated as a defect. The repo-level `npm run lint` command runs the shared ESLint baseline, and `npm run check` includes that lint pass plus the hard UI dedupe gate. The configured git hooks intentionally stop short of desktop packaging, so packaging stays out of the normal commit/push loop and out of the active development loop.

## Current Repository State

SpecFlow is now desktop-first. The active runtime under development is:

- `packages/app`: Node business logic, CLI commands (`ui`, `export-bundle`, `verify`), shared runtime handlers, and the persistent sidecar entrypoint
- `packages/client`: React UI for initiatives, tickets, runs, audits, specs, and settings
- `packages/tauri`: Tauri v2 desktop shell and Rust bridge

Legacy Fastify + browser mode remains available as a fallback and compatibility path.

All four workflows remain functional: Groundwork, Milestone Run, Quick Build, and Drift Audit.

Key capabilities in the current version:

- Action-oriented home: an Up next queue plus initiative cards with inline progress instead of a counts dashboard
- Expandable sidebar workspace: slim icon rail for primary navigation that expands in place to reveal labels and the active initiative hierarchy
- Command palette (Cmd+K): Quick Task, New Initiative, GitHub Import, entity search
- Shared initiative pipeline: Brief -> Core flows -> PRD -> Tech spec -> Tickets -> Execute -> Verify -> Done as one continuous visual model
- Mandatory brief intake before the first brief is generated
- Inline creator handoff: `/new-initiative` flows directly into required brief intake in the same screen
- Persisted review gates and cross-checks across planning artifacts
- Traceability-backed planning with artifact sidecar trace outlines
- Spec-driven ticket planning with repo context scanning (grounded file targets)
- Coverage checks that can block initiative ticket export and execution until gaps are resolved or explicitly overridden
- Verification with per-criterion severity (Critical/Major/Minor/Outdated) and remediation hints
- Fix-forward loop: quick-fix export mode chains failed verification to enriched re-export to re-verify
- LLM-powered drift audit with Bug/Performance/Security/Clarity finding categories
- Real streaming progress for LLM operations through transport adapters: Tauri channels in desktop mode and SSE in legacy web mode
- GitHub Issue import via `POST /api/import/github-issue`
- Ticket dependencies with automatic inter-phase wiring and enforced status transitions
