---
name: planner-prompt-tuner
description: Improve SpecFlow's planner question policies, prompt boundaries, and artifact-generation instructions. Use when Codex needs to tune the Brief intake, refinement question budgets, starter requirements, decision-type taxonomy, forbidden-term boundaries, duplicate-question suppression, explicit reopen semantics, repo-context usage, or generation prompts for Brief, Core flows, PRD, Tech spec, planning reviews, or quality-strategy guidance. Do not use for generic prompt writing outside SpecFlow or for broad workflow redesign; use `specflow-workflow-designer` for product-flow questions.
---

# Planner prompt tuner

## Mission
Tune the planner as a structured contract, not as isolated prompt copy. Keep the question taxonomy, validators, prompt inputs, and stage boundaries aligned.

## Start here
1. Read `packages/app/src/planner/prompt-builder.ts`.
2. Read `packages/app/src/planner/refinement-check-policy.ts`, `packages/app/src/planner/brief-consultation.ts`, and `packages/app/src/planner/internal/validators.ts`.
3. Read `packages/app/src/planner/internal/context.ts` and `packages/app/src/planner/planner-service.ts` when the issue involves saved context, question history, repo context, or stage ownership.
4. Read `packages/app/src/verify/internal/prompt.ts` when the change affects verification-facing language or quality framing.
5. Propose prompt and policy changes together with the validator, type, test, and doc changes they require.

## Use this skill for
- decision-type taxonomy changes
- question budget and required-starter changes
- stage-boundary and forbidden-term tuning
- duplicate-question suppression and handoff context
- explicit reopen semantics such as `reopensQuestionIds`
- Brief intake option wording and helper-text quality
- non-UI flow framing for Core flows
- repo-context usage in planning prompts
- generation prompt quality for Brief, Core flows, PRD, Tech spec, and reviews

## Do not use this skill for
- generic prompt-composition advice detached from SpecFlow
- current-state workflow inspection for one initiative or ticket
- architectural review unrelated to planner behavior

## Working rules
- Treat planner questions, validators, and shared types as one contract.
- Prefer the smallest taxonomy change that closes the real gap.
- Do not widen question budgets or allowed decision types without tightening stage boundaries and tests.
- Protect the separation between Brief, Core flows, PRD, and Tech spec.
- When a later stage reopens an earlier concern, require both an explicit downstream consequence and an explicit question reference.
- Prefer canonical `quality-strategy` wording while keeping legacy `verification` inputs compatible.
- Keep forbidden-term enforcement aligned to abstraction level, not SpecFlow-specific technology names that may be part of the user domain.

## Output
- `Observed planner flaw`
- `Root cause in the planner contract`
- `Recommended prompt and policy changes`
- `Required validator/type/test updates`
- `Risks and regressions to watch`
