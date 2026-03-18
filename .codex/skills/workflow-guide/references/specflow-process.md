# SpecFlow process reference

## Source files
- `docs/workflows.md`: user-facing workflow definitions and happy paths
- `docs/product-language-spec.md`: canonical user-facing terms and phase/status language
- `packages/app/src/planner/workflow-contract.ts`: planning steps, prerequisite rules, and review status helpers
- `packages/app/src/planner/execution-gates.ts`: the real initiative coverage gate for initiative-linked ticket execution
- `packages/app/src/io/paths.ts`: on-disk artifact paths
- `packages/app/src/store/internal/loaders.ts`: filenames actually loaded into memory

## Workflow selection
- Use `Groundwork` when the user is shaping or checking an initiative artifact set.
- Use `Milestone Run` when the user is executing or verifying an initiative-linked ticket.
- Use `Quick Build` when the user is planning a single focused task without full initiative decomposition.
- Use `Drift Audit` when the user is reviewing an existing diff, branch, commit range, or file snapshot.

## Groundwork state matrix

| Stage | Required artifact | First-draft consultation rule | What actually blocks the next artifact | What opens next |
|---|---|---|---|---|
| Brief | `brief.md` | required 4-question Brief intake | missing Brief artifact | Core flows |
| Core flows | `core-flows.md` | required first consultation: primary flow, alternate/destructive path, flow condition | missing Core flows artifact | PRD |
| PRD | `prd.md` | required first scope-setting question, then up to 3 more blockers | missing PRD artifact | Tech spec |
| Tech spec | `tech-spec.md` | required first architecture question, then up to 4 more blockers | missing Tech spec artifact | Tickets |
| Tickets | ticket plan plus coverage ledger | no starter consultation; planner generates from the spec set | unresolved `ticket-coverage-review` only matters before execution, not before ticket generation | Execution |

Use these rules while checking Groundwork:
- Moving to the next planning artifact is primarily gated by the prior artifact existing and the workflow step being unlocked.
- Planning reviews and cross-checks remain important, but they are secondary review artifacts instead of hard blockers between Brief, Core flows, PRD, and Tech spec.
- Missing, `blocked`, or `stale` reviews matter when the user asks about review health or artifact quality, but they do not automatically stop the next artifact from opening.
- Editing an upstream artifact can still make downstream reviews stale.
- Ticket creation is not enough. Initiative execution still stays blocked until the coverage check is resolved or explicitly overridden.

## Milestone Run gate matrix

| Transition | Requirement | Result |
|---|---|---|
| `Backlog -> Ready` | User moves the ticket manually | Ticket is queued for work |
| `Ready -> In progress` | User exports a bundle; initiative-linked tickets also need resolved coverage and finished blockers | Ticket begins execution |
| `In progress -> Verify` | User captures results | Verification becomes the active gate |
| `Verify -> Done` | All criteria pass, or user overrides with a reason and risk acceptance | Ticket is complete |
| `Verify -> In progress` | User re-exports with findings | Quick-fix retry loop starts |

Use these rules while checking Milestone Run:
- Initiative-linked tickets cannot start if the initiative coverage check is unresolved.
- `blockedBy` dependencies can block execution even when phase ordering is only a soft warning.
- Export starts the run. Capture does not happen until the user returns with results.
- If verification fails, inspect failed criteria, severity, remediation hints, and drift flags before telling the user what to do next.
- If there is no git repo, snapshot-based verification uses the export-time scope as the primary baseline.

## Quick Build rules
- Use Quick Build only for focused, bounded work that fits a single ticket.
- The planner creates one ticket in `Ready` status with acceptance criteria, a short implementation plan, and file targets.
- Quick tasks are exempt from initiative coverage gating until they are linked to an initiative.
- If the task is too large or ambiguous, convert it into a draft initiative and continue through Groundwork.

## Drift Audit rules
- Accept these diff sources: current git diff, git branch, commit range, or file snapshot.
- Allow optional ticket linkage when acceptance criteria should inform the review.
- Expect findings to include category, severity, confidence, description, and affected file.
- Support three follow-up actions per finding: create ticket, export fix bundle, dismiss with note.

## State inspection paths

### Initiative planning state
- `specflow/initiatives/<initiative-id>/initiative.yaml`: initiative metadata, workflow state, phases, ticket IDs
- `specflow/initiatives/<initiative-id>/brief.md`
- `specflow/initiatives/<initiative-id>/core-flows.md`
- `specflow/initiatives/<initiative-id>/prd.md`
- `specflow/initiatives/<initiative-id>/tech-spec.md`
- `specflow/initiatives/<initiative-id>/reviews/<review-kind>.yaml`
- `specflow/initiatives/<initiative-id>/coverage/tickets.yaml`
- `specflow/initiatives/<initiative-id>/traces/<artifact-step>.yaml`

### Execution state
- `specflow/tickets/<ticket-id>.yaml`: ticket status, criteria, file targets, `blockedBy`, `blocks`, `runId`
- `specflow/runs/<run-id>/run.yaml`: run metadata, attempts, committed attempt, run type
- `specflow/runs/<run-id>/attempts/<attempt-id>/verification.json`: criterion results, drift flags, override reason, overall pass

### Decisions
- `specflow/decisions/*.md`: durable planning decisions that may explain why the current artifact set looks the way it does

## Response pattern
- `Current stage`: the active workflow and step
- `Complete`: what is already resolved
- `Blocking`: the real blocker, or explicitly say there is no blocking gate
- `Next action`: the exact action to take in SpecFlow
- `Override path`: only when the product supports override for that situation
