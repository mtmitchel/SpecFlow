---
name: workflow-guide
description: Inspect actual SpecFlow workflow state and explain the next valid user action, blocker, or override path. Use when Codex needs to answer "what comes next?", "why is this blocked?", "can I start this ticket?", or "what state is this initiative, ticket, or run in?" for an existing initiative, ticket, run, quick task, or audit. Do not use for redesigning the workflow itself; use `specflow-workflow-designer` for that.
---

# Workflow guide

## Mission
Tell the user the current workflow state, the real blocker, the next valid action, and the supported override path if one exists.

## Start here
1. Identify the object: initiative, ticket, run, quick task, or audit.
2. Inspect the real repo state before answering. Prefer `specflow/` artifacts, API data, or visible UI state over assumptions.
3. Read `references/specflow-process.md` for the current workflow matrix, inspection paths, and blocking rules.
4. Compare the current state to the exact artifact, coverage, dependency, or verification requirement that applies now.
5. Respond with the current stage, the blocker, the next action, and the valid override path if the product supports one.

## Source-of-truth order
1. Current workspace state under `specflow/`
2. `packages/app/src/planner/workflow-contract.ts`
3. `packages/app/src/planner/execution-gates.ts`
4. `docs/workflows.md`
5. `docs/product-language-spec.md`
6. `references/specflow-process.md`

When the docs and repo state disagree, trust the repo state first and then verify the enforcing code path.

## Apply these rules
- Do not invent blockers that the product does not actually enforce.
- Treat planning reviews as secondary review artifacts unless the user is explicitly asking about the review itself.
- Treat `ticket-coverage-review` as the real planning-to-execution gate for initiative-linked work.
- For execution, always check ticket status, `blockedBy` dependencies, coverage state, and verification state.
- Use product language in user-facing guidance: `Coverage check`, `Needs review`, `Verify work`, `Runs`.
- Use internal names like `ticket-coverage-review` or `stale` only when pointing to code or files.

## Check these cases explicitly
- `Can I create tickets yet?` Check whether the Tech spec artifact exists and the Tickets step is unlocked. Do not treat spec reviews as hard blockers by default.
- `Can I start this ticket?` Check initiative coverage, `blockedBy` dependencies, and the ticket status-transition rules.
- `Why is this ticket still blocked?` Inspect ticket dependencies first, then coverage status, then verification state.
- `Do I need to rerun review?` Check whether the source artifact changed after the review and whether the review is now `Needs review`.
- `Should this be Quick Build or Groundwork?` Only answer this if the user is routing work, not inspecting an existing object. Use `specflow-workflow-designer` for redesign questions.

## Default response shape
- `Current stage`: where the work is now
- `Complete`: what is already resolved
- `Blocking`: the real blocker or reason there is no blocker
- `Next action`: the next valid action in SpecFlow
- `Override path`: only when the product explicitly supports one
