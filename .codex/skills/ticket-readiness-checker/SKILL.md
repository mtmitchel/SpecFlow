---
name: ticket-readiness-checker
description: Review engineering tickets for execution readiness before implementation. Use when Codex needs to decide whether a ticket, task, or execution plan is precise enough to build safely and verify afterward, especially for "is this ticket ready?" requests, ambiguity reviews, acceptance-criteria audits, dependency and sequencing checks, or SpecFlow ticket refinement before work starts.
---

# Ticket readiness checker

## Mission
Decide whether a ticket is ready to implement without hidden product decisions, unsafe assumptions, or unverifiable acceptance criteria. Catch ambiguity before execution starts and turn weak tickets into concrete revisions.

## Quick start
1. Read the ticket first, then load only the surrounding context needed to judge it: linked spec, initiative, related tickets, API contracts, design notes, or existing behavior.
2. Determine the work type: feature, bug fix, refactor, migration, integration, UI change, or mixed work.
3. Review the ticket against `references/readiness-rubric.md`.
4. Mark each issue as `blocking`, `major`, or `minor`.
5. Return one verdict:
   - `ready`: implementable as written; only minor editorial improvements remain
   - `revise`: core intent exists, but at least one material ambiguity or verification gap remains
   - `blocked`: key scope, behavior, dependency, or acceptance information is missing
6. Rewrite vague requirements into concrete acceptance criteria or follow-up questions.

## Evidence order
Use the strongest available source in this order:
1. The ticket itself and linked acceptance criteria.
2. Canonical product or technical artifacts such as specs, PRDs, API schemas, design docs, or migration plans.
3. Existing shipped behavior and tests.
4. Adjacent tickets, comments, and implementation history.
5. Inference from recurring patterns in the repo.

Prefer explicit artifact evidence over inference. If a decision is not written in an authoritative source, report it as missing instead of silently choosing one.

## Review workflow
### 1) Establish the implementable unit
- State what change will exist after the ticket lands.
- Separate required behavior from suggested implementation details.
- Identify the user-visible outcome, system effect, or invariant that must hold.

### 2) Test the scope boundary
- Confirm what is in scope, out of scope, and intentionally unchanged.
- Flag tickets that bundle unrelated workstreams or hide follow-up work inside vague phrases such as `support`, `handle`, or `clean up`.
- Require explicit sequencing when the ticket depends on other tickets, migrations, data backfills, or rollout steps.

### 3) Test behavior precision
- Require concrete states, transitions, inputs, outputs, and failure handling where behavior changes.
- For bugs, require a reproducible failing condition and the expected corrected behavior.
- For refactors, require preserved invariants and what must not regress.

### 4) Test verification strength
- Confirm how completion will be proven: tests, manual checks, screenshots, logs, diffs, or measurable outputs.
- Reject acceptance criteria that only restate implementation steps without observable outcomes.
- Require unhappy-path verification when the change can fail, reject input, or partially apply.

### 5) Produce the readiness review
Return:
- `Verdict`
- `Findings` ordered by severity
- `Missing decisions`
- `Suggested rewrite` or exact acceptance-criteria additions
- `Verification plan`
- `Assumptions not allowed`

## When to open the rubric reference
Open `references/readiness-rubric.md` when you need:
- the detailed dimension-by-dimension checklist
- ticket-type-specific expectations for UI, API/backend, data, and refactor work
- rewrite patterns that convert vague tickets into implementable ones

## Guardrails
- Do not invent product decisions the ticket never made.
- Do not accept implementation detail in place of user-visible or system-observable behavior.
- Do not mark a ticket `ready` if verification still depends on guesswork.
- Distinguish missing information from merely missing wording. Minor phrasing issues do not block execution.
- Escalate contradictions between ticket, spec, and existing behavior instead of resolving them silently.
- Prefer a short list of precise blockers over generic quality advice.

## Output template
Use this structure unless the user asks for another format:

- `Verdict`: ready, revise, or blocked
- `Scope summary`: one short paragraph describing the implementable change
- `Blocking findings`: highest-risk ambiguities or missing decisions
- `Major findings`: gaps likely to cause rework or unverifiable completion
- `Minor findings`: editorial or clarity improvements
- `Missing decisions`: product, technical, dependency, or sequencing choices that must be made explicitly
- `Suggested rewrite`: exact acceptance criteria, constraints, or questions to add
- `Verification plan`: how to prove the ticket is done
- `Assumptions not allowed`: choices the implementer must not guess about

If the ticket is ready, say so explicitly and note any residual assumptions that remain intentionally out of scope.
