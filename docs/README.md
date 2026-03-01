# docs/

Documentation for SpecFlow.

## Contents

| File | What it covers |
|---|---|
| [`product-brief.md`](product-brief.md) | Problem statement, goals, success criteria, non-goals |
| [`workflows.md`](workflows.md) | Four user workflows (Groundwork, Milestone Run, Quick Build, Drift Audit) with step-by-step flows and state diagrams |
| [`architecture.md`](architecture.md) | Technical architecture: package structure, data model, component responsibilities, API surface, sequence diagrams |

For setup and quick-start instructions, see the root [`README.md`](../README.md).
For coding conventions, testing guidelines, and commit rules, see [`AGENTS.md`](../AGENTS.md).
For the version history, see [`CHANGELOG.md`](../CHANGELOG.md).

## Implementation Status

SpecFlow is fully implemented. The repository includes a working app/client workspace:

- `packages/app`: Fastify backend, CLI commands (`ui`, `export-bundle`, `verify`), and all backend services
- `packages/client`: React UI for initiatives, tickets, runs, audits, specs, and settings

All four workflows are functional: Groundwork, Milestone Run, Quick Build, and Drift Audit.

Key capabilities in the current version (0.3.0):

- Master-detail layout: navigator tree sidebar (initiatives > specs/phases > tickets) + detail workspace
- Command palette (Cmd+K): Quick Task, New Initiative, GitHub Import, entity search
- Spec-driven planning with repo context scanning (grounded file targets)
- Mermaid phase-dependency diagrams on initiative detail pages
- Verification with per-criterion severity (Critical/Major/Minor/Outdated) and remediation hints
- Fix-forward loop: quick-fix export mode chains failed verification to enriched re-export to re-verify
- LLM-powered drift audit with Bug/Performance/Security/Clarity finding categories
- Real SSE token streaming for all LLM operations
- GitHub Issue import via `POST /api/import/github-issue`
- Ticket dependencies with automatic inter-phase wiring and enforced status transitions
