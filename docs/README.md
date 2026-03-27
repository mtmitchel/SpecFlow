# docs/

Documentation for SpecFlow.

## Contents

| File | What it covers |
|---|---|
| [`../README.md`](../README.md) | Setup, commands, recovery, release hardening, and desktop runtime expectations |
| [`runtime-modes.md`](runtime-modes.md) | Desktop-first development and runtime expectations, including `tauri dev`, sidecar behavior, and build outputs |
| [`architecture.md`](architecture.md) | Technical architecture: package structure, data model, component responsibilities, API surface, and runtime topology |
| [`workflows.md`](workflows.md) | Four user workflows (Groundwork, Milestone Run, Quick Build, Drift Audit) with step-by-step flows and state diagrams |
| [`product-language-spec.md`](product-language-spec.md) | Canonical product vocabulary, phase language, status labels, CTA rules, empty states, and transition messaging |
| [`ux-copy-guidelines.md`](ux-copy-guidelines.md) | Repo-specific UX copy tone, style, and component-writing rules for user-facing UI text |
| [`../AGENTS.md`](../AGENTS.md) | Repo operating standard: architecture rules, testing gates, copy rules, and GitHub workflow |
| [`guidelines/development-philosophy.md`](guidelines/development-philosophy.md) | Core principles, AI usage policy, complexity budget, decision discipline, and agent guardrails |
| [`repo-layout.md`](repo-layout.md) | Detailed directory tree for all three workspace packages |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Version history and notable product changes |
| [`review-prompts/`](review-prompts/) | Structured repo-review prompts for data integrity, security, client state, and product-value audits |

One-off audits, dated reports, and exploratory documents can still live under `docs/`, but they are not maintained as the day-to-day source of truth. Start with the files above.

Agent-facing rule: duplicated or near-duplicated UI meaning is treated as a defect. The repo-level `npm run lint` command runs the shared ESLint baseline, and `npm run check` includes that lint pass plus the hard UI dedupe gate. The configured git hooks intentionally stop short of desktop packaging, so packaging stays out of the normal commit/push loop and out of the active development loop.

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
