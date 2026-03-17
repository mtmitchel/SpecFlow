---
name: workflow-guide
description: Apply the correct SpecFlow process, explain what comes next, and verify that planning, execution, and audit work has the required artifacts, reviews, and gates before moving forward. Use when Codex needs to guide a user through Groundwork, Milestone Run, Quick Build, or Drift Audit; inspect an initiative, ticket, or run to find the next valid step; check whether a brief, core flows set, PRD, tech spec, ticket plan, or verification state is complete; or explain why coverage, dependency, or review gates are blocking progress.
---

# Workflow guide

## Mission
Guide users through SpecFlow's documented lifecycle without skipping required planning, coverage, dependency, or verification checks.

## Start here
1. Identify the object in question: initiative, ticket, run, quick task, or audit.
2. Inspect the real workspace state before answering. Prefer `specflow/` artifacts, API data, or visible UI state over assumptions.
3. Read [references/specflow-process.md](references/specflow-process.md) for the workflow matrix, required gates, and inspection paths.
4. Compare the current state to the required artifact and review checklist for the active workflow.
5. Respond with the current stage, the blocking gaps, the exact next action, and any valid override path.

## Choose the workflow
- Use `Groundwork` for initiative planning: Brief, Core flows, PRD, Tech spec, Tickets, and Coverage check.
- Use `Milestone Run` for initiative-linked ticket execution, export, capture, verification, and retry flow.
- Use `Quick Build` for a single bounded task that can skip full initiative planning.
- Use `Drift Audit` for review of an existing diff, branch, commit range, or snapshot.

If a supposedly quick task is too large or ambiguous, route it into `Groundwork` instead of forcing `Quick Build`.

## Source-of-truth order
1. Current workspace state under `specflow/`
2. [references/specflow-process.md](references/specflow-process.md)
3. `docs/workflows.md`
4. `packages/app/src/planner/workflow-contract.ts`
5. `packages/app/src/planner/execution-gates.ts`
6. `docs/product-language-spec.md`

When the repo state and the reference disagree, trust the repo state and then verify the code path that enforces it.

## Apply these rules
- Treat review states `passed` and `overridden` as resolved.
- Treat missing, `blocked`, or `stale` reviews as unresolved.
- Do not tell the user to skip a required review or coverage gate.
- When artifact content changed after a review, assume downstream reviews may need reruns.
- When a user asks whether execution can start, always check coverage, ticket blockers, and ticket status-transition rules.
- Prefer product language in user-facing guidance: `Coverage check`, `Needs review`, `Verify work`, `Runs`.
- Use internal labels like `ticket-coverage-review` or `stale` only when pointing to code or files.

## Default response shape
- `Current stage`: where the work is in the workflow.
- `Complete`: artifacts, reviews, or verification steps that are already resolved.
- `Blocking`: missing artifacts, blocked reviews, unresolved coverage, dependencies, or failed verification.
- `Next action`: the next valid step the user should take in SpecFlow.
- `Override path`: only when the product explicitly supports one.

## Check these cases explicitly
- `Can I create tickets yet?` Verify that the tech spec exists and its required reviews are resolved.
- `Can I start this ticket?` Verify the initiative coverage check and `blockedBy` dependencies.
- `Why is this ticket in Verify?` Inspect the latest run attempt and failed criteria or drift flags.
- `Do I need to rerun review?` Check whether the source artifact changed after the last review and whether the review is now `Needs review`.
- `Should this be Quick Build or Groundwork?` Decide based on scope clarity and whether the work fits a single bounded ticket.
