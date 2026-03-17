# Ticket readiness rubric

## Contents
- Severity model
- Core dimensions
- Ticket-type expectations
- Rewrite patterns

## Severity model
- `blocking`: The implementer would need to guess about scope, behavior, dependencies, or safety-critical constraints.
- `major`: The ticket can start, but rework or unverifiable completion is likely without clarification.
- `minor`: The intent is implementable; the gap is editorial, organizational, or low-risk.

## Core dimensions
### 1) Outcome and scope
Ready when:
- The ticket states the observable change after completion.
- In-scope and out-of-scope boundaries are explicit.
- Non-goals or unchanged areas are named when confusion is likely.

Not ready when:
- The ticket names an activity, not an outcome.
- The work bundles multiple unrelated changes.
- Success depends on hidden follow-up tickets.

Ask:
- What exists or behaves differently after this lands?
- What is explicitly out of scope?

### 2) Behavior and states
Ready when:
- Inputs, outputs, states, transitions, and error handling are concrete.
- Bug tickets describe the failing case and corrected behavior.
- Refactor tickets define preserved behavior and invariants.

Not ready when:
- Terms like `handle`, `support`, or `improve` stand in for actual behavior.
- Edge cases are mentioned but not enumerated.
- The ticket leaves error behavior to implementer preference.

Ask:
- What should happen on success, failure, empty, loading, invalid, and partial states?
- What behavior must remain unchanged?

### 3) Dependencies and sequencing
Ready when:
- Upstream blockers, rollout order, and external dependencies are named.
- Data migrations, backfills, or contract changes have a safe sequence.
- Ownership boundaries are clear when multiple systems or teams are involved.

Not ready when:
- Another change must land first but is not referenced.
- The ticket mixes schema, app, and rollout work without ordering.
- The execution path relies on tribal knowledge.

Ask:
- What must already exist before implementation starts?
- Does this change require a migration, backfill, feature flag, or rollback plan?

### 4) Verification and evidence
Ready when:
- Acceptance criteria describe observable outcomes.
- The ticket states how to prove completion.
- Negative-path verification exists when the change can fail.

Not ready when:
- Acceptance criteria restate coding tasks instead of outcomes.
- There is no concrete way to tell done from almost done.
- Manual verification depends on unstated setup or hidden fixtures.

Ask:
- What tests, checks, or artifacts will prove this is complete?
- How will a reviewer know the failure paths were covered?

### 5) Risk controls
Ready when:
- Security, permissions, performance, data integrity, and compatibility constraints are stated when relevant.
- The ticket names rollout constraints for risky changes.

Not ready when:
- A risky surface changes with no mention of guardrails.
- Performance or data-safety claims have no target or measurement plan.

Ask:
- What could break or become unsafe if this is implemented literally?
- Which constraints are mandatory versus nice to have?

## Ticket-type expectations
### UI tickets
- Define the affected screens, entry points, and user actions.
- Cover loading, empty, error, and success states when they can occur.
- State responsive or accessibility requirements when behavior or layout changes.

### API and backend tickets
- Define inputs, outputs, validation, auth, persistence, and error responses.
- Name contract changes and compatibility expectations.
- Include observable verification such as tests, logs, or response examples.

### Data and migration tickets
- Define source and target state, migration order, idempotence, and rollback or recovery expectations.
- State who or what runs the migration and when.
- Separate one-time operational steps from permanent product behavior.

### Refactor tickets
- Define preserved behavior, invariants, interfaces, and non-goals.
- State what tests or diffs must remain unchanged.
- Reject vague cleanup work that has no completion boundary.

## Rewrite patterns
- `Handle edge cases.` -> `List each edge case and the expected behavior for each one.`
- `Improve performance.` -> `State the workload, baseline, target metric, and how to measure it.`
- `Support X.` -> `Describe the affected entry points, states, outputs, and success criteria for X.`
- `Clean up Y.` -> `State the invariant to preserve, the modules in scope, and what will remain unchanged.`
- `Add validation.` -> `Define which inputs are rejected, the exact failure response, and how it is verified.`
