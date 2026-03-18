---
name: specflow-workflow-designer
description: Design or critique the end-user SpecFlow workflow itself. Use when Codex needs to improve how Groundwork, Quick Build, Milestone Run, or Drift Audit work for the user; evaluate planning handoffs, first-run clarity, stage gates, review placement, re-entry behavior, and workflow comprehension; or pressure-test whether the product structure matches the intended guided planning experience. Do not use for inspecting the current next step of a specific initiative or ticket; use `workflow-guide` for that.
---

# SpecFlow workflow designer

## Mission
Improve the product workflow, not just the copy or the current state of one initiative. Focus on whether the user can move through SpecFlow clearly, safely, and with the right amount of structure.

## Start here
1. Read `docs/workflows.md` and `docs/product-language-spec.md`.
2. Read `docs/product-ux-audit.md` and `docs/review-prompts/04-product-value.md` when the request is about workflow quality, product value, or UX coherence.
3. If the request is about current behavior, inspect the real planner policy and relevant UI surfaces before proposing changes.
4. Separate workflow design issues from prompt-quality issues and from current-state guidance.
5. Return a concrete workflow recommendation with entry point, step model, blockers, user questions, and success criteria.

## Use this skill for
- Groundwork structure and stage handoffs
- Brief, Core flows, PRD, Tech spec, and Tickets flow design
- how planning should work for UI, API, CLI, automation, and existing-system initiatives instead of only screen-based apps
- first-run clarity and re-entry behavior
- gating, review placement, and override-path design
- command-palette entry points and routing between Quick Build and Groundwork
- execution handoff and verification-loop UX when the problem is workflow shape

## Do not use this skill for
- `What comes next for this initiative or ticket?` Use `workflow-guide`.
- `How should the planner questions or policies change?` Use `planner-prompt-tuner`.
- `Does the spec-to-ticket chain preserve intent?` Use `traceability-delivery-auditor`.

## Source-of-truth order
1. `docs/workflows.md`
2. `docs/product-language-spec.md`
3. `docs/product-ux-audit.md`
4. `docs/review-prompts/04-product-value.md`
5. `packages/app/src/planner/refinement-check-policy.ts`
6. Relevant initiative or ticket views under `packages/client/src/app/views/`

## Review lenses
- `Entry`: is it obvious how the user starts the workflow?
- `Progress`: is the current stage and next step obvious?
- `Consultation`: does the planner ask the right questions at the right stage, and does the flow framing still work when the initiative is not a screen-based UI?
- `Gating`: are blockers real and placed at the right moment?
- `Re-entry`: can the user resume without losing context?
- `Revision`: can review `Back` reopen the answered survey for targeted revisions, and do reopened blockers show earlier provenance clearly?
- `Comprehension`: does the workflow read like a guided planning workspace instead of a document maze?

## Output
- `Workflow problem`
- `Current behavior`
- `Structural flaws`
- `Recommended workflow`
- `User-facing implications`
- `Validation plan`
