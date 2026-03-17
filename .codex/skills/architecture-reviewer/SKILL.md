---
name: architecture-reviewer
description: >-
  Review proposed or implemented changes against the repository's documented
  architecture, component boundaries, shared contracts, and maintainability
  rules. Use when a change touches Fastify routes, artifact storage, planner
  workflow logic, verification or diff logic, shared types or API contracts,
  cross-package data flow, or any refactor where responsibilities may move
  between server, client, CLI, and runtime artifacts.
---

# SpecFlow architecture reviewer

## Mission
Review system design and code changes for architectural fit. Surface boundary violations, contract drift, leaked responsibilities, and maintainability regressions.

## Quick start
1. Read the closest scoped `AGENTS.md`.
2. Read `docs/architecture.md` first, then `README.md` and `docs/README.md` for package and workflow context.
3. Map every touched file, or each proposed responsibility if no diff exists yet, to one primary responsibility before judging the change.
4. Compare the current or proposed implementation with the documented ownership model below.
5. Report findings first, ordered by severity, with file references and the exact boundary or invariant being broken.

## Use the documented ownership model
- Treat `packages/app/src/server/routes/` as the HTTP boundary. Keep request parsing, reply shaping, SSE session setup, and service delegation here. Do not move planner, store, verifier, or filesystem policy into routes.
- Treat `packages/app/src/store/` as the persistence boundary. Keep artifact loading, staged commit semantics, recovery, watcher behavior, and `specflow/` filesystem layout here. Do not bypass staged writes or duplicate loader rules elsewhere.
- Treat `packages/app/src/planner/` as the planning workflow boundary. Keep step ordering, review gates, coverage generation, traceability artifacts, planning prompts, and structured planner errors here.
- Treat `packages/app/src/verify/` as the verification boundary. Keep diff source selection, scope handling, verifier prompt assembly, result parsing, and drift-warning behavior here.
- Treat `packages/app/src/types/`, `packages/app/src/planner/workflow-contract.ts`, `packages/app/src/planner/execution-gates.ts`, and `packages/app/src/server/validation.ts` as shared contract modules. Reuse them instead of redefining shapes, workflow rules, execution gates, or validation rules in other layers.
- Treat `packages/client/src/` as the presentation boundary. Keep view state, API composition, navigation, and rendering here. Do not move provider access, filesystem access, staged commit rules, or verifier/planner policy into the client.
- Treat the CLI as a thin wrapper. Preserve the prefer-server delegation model and fail-closed behavior when the runtime capability check fails.

## Protect cross-cutting invariants
- Keep LLM access on the server only. The browser must not call provider APIs directly or handle raw provider secrets.
- Keep artifact-store reads in memory and mutations staged. If a change touches runs or attempts, trace the full prepare, validate, commit, and reload path.
- Keep workflow metadata centralized. If step order, review kinds, or execution gates change, update the shared contract module instead of duplicating the rule in routes or client code.
- Keep API-key handling redacted on reads. Client reads may expose `hasApiKey`; they must not expose raw keys.
- Keep ticket dependency fields and other required shared entity fields consistent across loaders, writers, server responses, and client consumers.
- Keep architecture docs honest. If the code intentionally changes a documented boundary, call for a docs update in the review.

## Run the review workflow
1. Inventory changed files, proposed components, nearby dependencies, and any touched docs.
2. Decide which layer should own each new rule, state transition, I/O action, or data transformation.
3. Trace contract changes end to end. When a shared type, YAML shape, or API payload changes, check loaders, store semantics, routes, client consumers, planner logic, verifier logic, and docs.
4. Check for duplicated policy. Flag workflow rules, validation rules, or persistence logic that appear in more than one layer without an explicit shared module.
5. Check for hidden coupling. Flag new imports into deep internals of another domain, bidirectional dependencies, or helpers that now know too much about multiple subsystems.
6. Distinguish implementation drift from documentation drift. If the code is sound but the docs are stale, say so explicitly instead of inventing an architectural bug.
7. Read `references/boundary-checklist.md` when the change touches routes, store, planner, verifier, shared contracts, or client/server ownership boundaries.

## Produce the review
- Start with findings. Use the repository's standard review style: findings first, ordered by severity, with concise summaries afterward.
- For each finding, include the violated boundary or invariant, why the current placement is wrong, where the logic or contract should live instead, and file references.
- State explicitly when no architectural findings are present.
- Call out residual risks, stale documentation, or missing verification separately from core findings.
- Keep style comments out unless they affect responsibility boundaries, long-term maintainability, or correctness.

## Output shape
- **Findings**: one item per issue with severity, boundary, rationale, corrective direction, and file references
- **Open questions**: only for true ambiguity that blocks a confident architecture call
- **Summary**: one short paragraph on architectural fit, residual risks, and needed docs or test follow-up

## Bundled reference
- Read `references/boundary-checklist.md` for area-specific review questions and common failure modes.
