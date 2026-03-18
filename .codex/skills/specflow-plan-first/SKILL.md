---
name: specflow-plan-first
description: Route software requests into the right SpecFlow workflow and turn rough intent into a plan-first delivery path with clarifying questions, living specs, executable tickets, acceptance criteria, and verification. Use when Codex should help a user use SpecFlow for new features, refactors, multi-file changes, agent-assisted execution, or any ambiguous request where traceability from idea to code matters; especially when deciding between Groundwork, Quick Build, Milestone Run, Drift Audit, or direct execution. Do not use for trivial edits, isolated one-file fixes, simple formatting changes, or requests that already include a complete implementation plan and only need immediate code generation.
---

# SpecFlow Plan-First

## Mission
Use SpecFlow as the guided planning workspace that turns a rough request into executable, verifiable work. Choose the lightest valid workflow, make ambiguity explicit, and keep traceability from idea to verified delivery.

## Start here
1. Decide whether the request belongs in SpecFlow at all.
2. Choose the correct workflow before producing artifacts or code.
3. Inspect real repo state before answering when the user refers to an existing initiative, ticket, run, or `specflow/` artifact.
4. Read `docs/workflows.md` and `docs/product-language-spec.md` when workflow behavior or wording is unclear.

## Choose the path
- Use direct execution when the request is trivial, isolated, already fully scoped, or clearly a one-file fix with no planning ambiguity.
- Use `Quick Build` when the work is focused, bounded, and should fit one ticket with a short implementation plan plus acceptance criteria.
- Use `Groundwork` when the request is ambiguous, large, cross-cutting, risky, or needs durable planning artifacts before implementation.
- Use `Milestone Run` when the user already has a ticket and needs export, execution handoff, capture, verification, or retry guidance.
- Use `Drift Audit` when the user wants structured review of an existing diff, branch, commit range, or snapshot.
- Escalate a supposed quick task into `Groundwork` when scope, dependencies, or edge cases would make one-ticket planning unsafe.

## Run the plan-first loop
### Capture intent
- Lock the problem, target user, desired outcome, and success signal.
- Ask only the questions that unblock the next artifact or workflow choice.
- Record hard constraints, platform assumptions, dependencies, and non-goals.

### Shape the artifact path
- For `Groundwork`, move in order: `Brief intake` -> `Brief` -> `Core flows` -> `PRD` -> `Tech spec` -> `Tickets` -> `Coverage check`.
- For `Quick Build`, produce a short implementation plan, acceptance criteria, and suggested file targets before execution.
- Prefer the smallest artifact set that makes execution safe. Do not create overlapping docs that repeat the same meaning.

### Make ambiguity explicit
- Separate decisions, assumptions, constraints, risks, and open questions.
- Call out missing edge cases, failure states, permission rules, and data or migration concerns.
- Turn vague goals into concrete behavior rules and acceptance criteria.

### Decompose into executable work
- Break the work into tickets only after the concept model and critical flows are stable enough to trust.
- Keep ticket scopes coherent, ordered, and verifiable.
- Preserve traceability from each ticket back to the relevant spec items or requirements.

### Close the loop
- Treat implementation as incomplete until verification is checked against the original requirements.
- Use SpecFlow's acceptance criteria, covered spec items, and verification results as the completion bar.
- Do not call the work done just because code exists. Completion means the delivered change still matches the plan.

## Use repo language
- Prefer canonical product terms: `Brief`, `Core flows`, `PRD`, `Tech spec`, `Tickets`, `Runs`, `Brief intake`, `Coverage check`, `Verify work`.
- Frame SpecFlow as a `guided planning workspace`, not an intake form, document archive, or agent control panel.
- When the user asks for help using the app, answer in workflow terms first and implementation terms second.

## Reuse the repo's other skills
- Use `groundwork-artifact-designer` when the main job is creating or critiquing early planning artifacts before ticketing.
- Use `workflow-guide` when the user needs the exact next valid step, blocking gate, or override path for an existing initiative, ticket, or run.
- Use `ticket-readiness-checker` when the user already has a ticket or execution plan and wants to know if it is precise enough to build safely.
- Use `verification-analyst` when comparing delivered work to the original ticket, spec, or acceptance criteria after implementation.

## Default response shape
- `Recommended path`: direct execution, `Quick Build`, `Groundwork`, `Milestone Run`, or `Drift Audit`
- `Why this path`: scope, ambiguity, and traceability rationale
- `Questions before proceeding`: only the blockers that matter now
- `Planned outputs`: artifacts, tickets, criteria, or verification steps to produce
- `Done means`: the explicit verification bar for considering the work complete
