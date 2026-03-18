---
name: traceability-delivery-auditor
description: Audit whether SpecFlow preserves intent from specs to tickets to execution and verification. Use when Codex needs to inspect trace outlines, ticket coverage, ticket generation, bundle handoff, or verification outputs to find where the original plan is being lost, duplicated, or weakened. Do not use for judging whether a single ticket is implementation-ready or whether one run is done; use `ticket-readiness-checker` or `verification-analyst` for those narrower tasks.
---

# Traceability delivery auditor

## Mission
Check the chain from planning artifacts to delivered work. Find where intent is dropped, widened, duplicated, or made unverifiable between specs, coverage items, tickets, bundles, and run results.

## Start here
1. Read `packages/app/src/planner/ticket-coverage.ts`.
2. Read `packages/app/src/planner/internal/spec-artifacts.ts` and the relevant planner review logic.
3. Read `packages/app/src/bundle/renderers.ts` and `packages/app/src/verify/internal/prompt.ts`.
4. Read `docs/workflows.md` and `docs/architecture.md` when the issue is about expected workflow behavior or artifact ownership.
5. Compare the source artifact, trace outline, coverage ledger, tickets, bundle content, and verification output in order.

## Use this skill for
- spec-to-ticket coverage audits
- trace-outline quality and sectioning problems
- missing or duplicated coverage items
- ticket scopes that do not match the covered spec items
- bundle handoff gaps that drop critical acceptance context
- verification results that cannot be traced back to the original spec intent

## Do not use this skill for
- generic product or workflow redesign
- isolated ticket readiness review
- isolated implementation completion review

## Review workflow
1. Establish the source intent: Brief, Core flows, PRD, Tech spec, or explicit decision doc.
2. Check the trace outline: are the right facts captured and grouped cleanly?
3. Check the coverage ledger: are important items missing, duplicated, or too vague?
4. Check the tickets: do title, description, acceptance criteria, and file targets preserve the covered intent?
5. Check the bundle and verification loop: does execution still see the right scope and done definition?

## Output
- `Source intent`
- `Traceability breaks`
- `Coverage and ticket findings`
- `Bundle and verification findings`
- `Recommended fixes`
