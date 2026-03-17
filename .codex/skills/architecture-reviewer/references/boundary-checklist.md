# Boundary checklist

Read only the sections that match the change under review.

## Routes
- Confirm the route validates IDs, paths, refs, and SSE event names through shared helpers instead of ad hoc checks.
- Confirm the route delegates business logic to planner, store, verifier, audit, or bundle services instead of inlining policy.
- Confirm the route shapes HTTP or SSE responses only after service results are available.
- Confirm the route does not read or write `specflow/` directly when the store or service layer already owns that behavior.

## Store
- Confirm reads still come from in-memory maps rather than per-request filesystem access.
- Confirm mutations still use staged writes, manifest validation, pointer updates, and reload-after-commit behavior.
- Confirm loader or artifact-shape changes update the relevant validation and normalization code together.
- Confirm file-watcher, recovery, and cleanup semantics still match the staged commit model.

## Planner
- Confirm workflow order, review kinds, or prerequisite rules live in shared contract modules.
- Confirm review, trace, and coverage artifact ownership stays inside planner and store modules.
- Confirm planner orchestration remains separate from HTTP concerns and client UI concerns.
- Confirm planner changes do not leak prompt-shaping or workflow rules into unrelated modules.

## Verification
- Confirm diff-source selection remains inside verification or diff modules.
- Confirm scope widening, drift warnings, and criterion evaluation semantics remain intact.
- Confirm verifier prompt assembly stays grounded in shared contracts and repo instructions rather than route-local or client-local state.
- Confirm verification results still flow through the persisted run attempt artifacts expected by the UI.

## Shared contracts
- Confirm shared entity changes update `packages/app/src/types/` rather than creating client-local duplicates.
- Confirm workflow or execution-gate changes update shared modules that both server and client consume.
- Confirm required ticket fields such as `blockedBy` and `blocks` remain normalized end to end.
- Confirm API payload changes keep secrets redacted and preserve the client-facing contract.

## Client
- Confirm the client renders server-owned workflow and verification state instead of re-implementing backend rules.
- Confirm the client does not talk to LLM providers directly or retain raw API keys.
- Confirm UI helpers do not become shadow versions of planner, verifier, or store logic.
- Confirm new components respect existing feature boundaries instead of becoming cross-workspace dumping grounds.

## CLI and runtime
- Confirm mutating CLI commands still prefer server delegation when the server is available.
- Confirm protocol mismatch or capability failure still fails closed rather than writing locally anyway.
- Confirm runtime status, operation probing, and idempotency behavior stay coherent with server-side operation ownership.

## Docs
- Confirm `docs/architecture.md`, `README.md`, or `docs/README.md` are updated when boundaries or public contracts intentionally change.
- Confirm review output distinguishes stale docs from architectural defects in code.
