# Architecture - SpecFlow

Related docs:

- For setup and top-level command entry points, see [`../README.md`](../README.md)
- For desktop runtime behavior, see [`runtime-modes.md`](runtime-modes.md)
- For user workflow expectations and state transitions, see [`workflows.md`](workflows.md)
- For canonical UI terminology, see [`product-language-spec.md`](product-language-spec.md)

## Package Structure

Three packages share a single npm workspace root:

| Package | Contents | Runtime |
|---|---|---|
| `packages/app` | Node business logic, CLI entry points, shared runtime handlers, and the persistent sidecar runtime | Node.js |
| `packages/client` | React + Vite SPA | Browser / Tauri webview |
| `packages/tauri` | Tauri v2 desktop shell and Rust bridge | Rust + Tauri |

Desktop is the only supported runtime. `npm run tauri dev` is the explicit desktop development command, and `npm run dev` is an alias for it. The Tauri dev stack runs the app watcher, the Vite client dev server on `127.0.0.1:5173`, and the Tauri shell without a separate upfront build step; the desktop bridge waits for a fresh settled backend build under `packages/app/dist` before spawning the sidecar and hot-swaps to a fresh sidecar generation before the next request after a backend rebuild. Normal usage does not bind an HTTP port.

Shared TypeScript types (entity schemas, API contracts) live in `packages/app/src/types/` and are imported by both packages during development via path aliases.

---

## Runtime Topology

The desktop runtime is split into three layers:

1. The React UI in `packages/client`
2. The Tauri bridge in `packages/tauri`
3. A persistent Node sidecar in `packages/app/src/sidecar.ts`

The UI talks to Tauri through `invoke`, `Channel`, and Tauri events. Native path approval and desktop save flows stay inside Rust commands instead of exposing raw filesystem paths through the webview. Tauri spawns and manages the Node sidecar, keeps desktop dev attached to the freshest backend `dist` generation, forwards request/response traffic over line-delimited JSON, and forwards streamed sidecar notifications back to the webview.

The sidecar owns planning, verification, bundle export, store access, config updates, and GitHub issue import. Planner, verifier, bundle, store, and config logic remain in Node; Rust only owns desktop process management and transport bridging.

The runtime owns one active **SpecFlow storage root**. The sidecar is launched with that root and the artifact store persists under that root's `specflow/` directory. Project records also persist a separate `projectRoot`, which points at the repo or folder that planning, bundle export, verification, and audit should inspect. Initiative-linked repo scans and diffs use that per-project root, while quick tasks still default to the active storage root when no project root is bound.

---

## Artifact Store

On server startup, the store scans `specflow/` and loads all artifacts into typed in-memory maps (projects, tickets, runs, specs, config). All board API reads are served from memory -- no filesystem I/O per request. Mutations follow a **staged commit model**:

1. Build full operation output in a temp attempt directory (bundle files, snapshot, diff, verification output).
2. Validate integrity and write a temp manifest.
3. Atomically commit by updating the authoritative pointer/manifest in `run.yaml`.
4. Refresh in-memory maps from committed files.

A file watcher (chokidar) detects external edits and reloads affected artifacts into memory.
A dedicated reload helper validates planner-owned YAML on load, including planning reviews, trace outlines, and ticket coverage artifacts, before replacing the in-memory maps. Corrupt config, initiative, ticket, run, or decision files are isolated into reload issues so one bad file does not take down the whole in-memory snapshot.

The sidecar emits `artifacts.changed` notifications after mutating operations. The desktop bridge converts those into Tauri events so the UI can refresh from the latest persisted snapshot instead of relying on long-lived global HTTP streams.
Each snapshot also carries metadata for `revision`, `generatedAt`, `generationTimeMs`, `payloadBytes`, and `reloadIssues`, so the UI and support tooling can see reload cost and degraded-store warnings without rereading the filesystem directly.

**Failure mode handling:** single-file writes use `.tmp` + atomic rename. Multi-file operations are never considered committed until the final pointer/manifest update succeeds. On startup, orphan temp attempt directories are detected and marked as recoverable leftovers.

Staged-commit edge-case rules:
- Writes are serialized with a per-run lock; concurrent operations against the same run are rejected with a retryable conflict error.
- Each staged operation has `operationLeaseExpiresAt`; expired operations are treated as abandoned.
- Recovery on startup:
  - `activeOperationId` present + committed pointer missing + tmp exists -> mark `abandoned`
  - `activeOperationId` present + committed pointer already advanced -> mark `superseded`
  - tmp missing but active pointer present -> mark `failed` and clear active pointer
- Cleanup: abandoned/superseded temp directories are retained for a bounded TTL, then pruned by a background task.

### Store backup and restore

`specflow backup-store` writes a ZIP archive of the entire `specflow/` directory for operator recovery. Restore is intentionally explicit and offline: stop the desktop shell and CLI, move the damaged `specflow/` tree aside, extract the backup ZIP at the workspace root, then relaunch and validate the restored snapshot before deleting the damaged copy.

---

## CLI as Thin Wrapper

`specflow ui` is desktop-only. It launches the desktop binary when available and fails closed when the desktop runtime is unavailable.

`specflow backup-store`, `specflow verify`, and `specflow export-bundle` execute locally in-process against the same store, bundle, and verifier services that the sidecar uses. `verify` and `export-bundle` still accept an `operationId` idempotency key so repeated local invocations can reuse the same staged run operation semantics.

---

## Shared Runtime and Transport

Core backend behavior is extracted into transport-agnostic runtime handlers under `packages/app/src/runtime/handlers/`. These handlers accept validated typed input plus optional progress and notification sinks, and they return plain typed results or structured handler errors.

One transport adapts those handlers:

- The sidecar JSON-RPC dispatcher for the desktop runtime

The shared sidecar contract uses correlated request/response envelopes plus request-scoped notifications. Mutating methods also trigger global artifact change notifications so the UI can refresh snapshot state after writes.
Those global notifications now preserve the originating `requestId` and `correlationId`, which lets the client suppress redundant whole-snapshot refreshes after locally applied mutations and gives support logs one stable identifier across client, sidecar, and desktop-bridge events.
Planning question flows now also use two backend-owned continuation methods, `initiatives.continueArtifactStep` and `initiatives.continueValidation`. Those combined requests persist the current local refinement draft, rerun the phase or validation checks, and generate the next artifact or ticket plan inside the same foreground request instead of forcing the client to wait for a separate background autosave round-trip before it can continue.
Ticket-plan generation and plan repair are structured-input operations. Validation no longer resends the raw Brief, Core flows, PRD, and Tech spec markdown back to the planner. Instead, the planner consumes persisted trace outlines, ticket-coverage items, repo context, and optional validation feedback, which keeps the payload smaller and makes coverage and engineering-foundation expectations explicit.

The browser never calls provider APIs directly. AI operations stream through request-scoped Tauri channels backed by sidecar notifications. The UI refresh model stays snapshot-based: on disconnect or completion, it fetches the latest committed state rather than attempting event replay.
Long-running planning requests can emit both `planner-token` notifications and request-scoped `planner-status` notifications. Validation uses the status channel to surface milestones such as preparing inputs, drafting the ticket plan, repairing coverage, running coverage review, and committing the plan.

When `SPECFLOW_DEBUG_OBSERVABILITY=1` is set, the app runtime, Node sidecar, and Rust bridge each emit structured observability events to stderr. These logs cover request start/finish/timeout/cancel paths, sidecar startup and shutdown, store reload timings, and sidecar restarts without printing provider secrets.

---

## Workflow Contract and Execution Gates

Planning workflow metadata lives in one shared contract module: `packages/app/src/planner/workflow-contract.ts`. Step order, review kinds, labels, source-step ownership, and prerequisite review rules are defined there and imported by both the server and client so the project workspace cannot drift from backend gating behavior.

Project-linked execution gating is centralized in `packages/app/src/planner/execution-gates.ts`. Ticket status transitions and bundle export both use the same helper, so the rule "resolve the coverage check before starting execution" is enforced consistently across server routes and surfaced with the same message in the UI.

For the user-facing version of these workflow rules, see [`workflows.md`](workflows.md).

---

## Bundle Duality

`specflow export-bundle` writes a **directory bundle** to `specflow/runs/<run-id>/attempts/<attempt-id>/bundle/`. The board's Export Bundle panel calls an API endpoint that returns the same content as a **flattened clipboard string**. Both are generated by the same Bundle Generator service.

Desktop mode replaces the legacy HTTP ZIP download anchor with a native save flow. The client asks Rust to open the save dialog, and Rust forwards a trusted `runs.saveBundleZip` sidecar request with the selected destination path without exposing that absolute path as a renderer-supplied parameter.

Bundle contracts are versioned: every bundle includes a manifest with `bundleSchemaVersion`, `agentTarget`, and `exportMode` (standard vs quick-fix). Quick-fix exports include source linkage metadata (`sourceRunId`, `sourceFindingId`) for audit traceability. For project-linked tickets, `PROMPT.md` also surfaces the ticket's covered spec items before the acceptance criteria so the agent sees the originating requirement and flow context, not only the ticket summary. Coverage-gated project tickets cannot export until the shared execution-gate helper reports that the project's coverage review is resolved. Agent renderers are validated by golden tests against fixed fixtures.
For project-linked tickets, `PROMPT.md` also carries continuous engineering guardrails plus any covered engineering-foundation items mapped from the Tech spec trace and ticket-coverage ledger. That keeps architecture, validation, persistence, testing, design-system, observability, docs, and dependency constraints attached to the execution handoff instead of relying on a final checklist.

---

## Verification Strategy

The Diff Engine checks for a git repo first. If found, uses `git diff`. If not, uses the file snapshot captured at Export Bundle time.

Verification is always local-project based. The verifier reads the bound project root on disk, computes diffs from that local filesystem boundary, and only then asks the LLM to judge the returned work against the ticket criteria. Without that local filesystem boundary, verification degrades into text review instead of real change checking.

No-git verification uses a **two-stage scope + dual-diff model**:
- **Initial scope** is selected and baselined at export.
- **Capture-time widening** is allowed, but widened files are drift-only context.
- **Primary diff:** baseline-at-export vs capture-time state for the initial scope (used for verification).
- **Drift diff:** pre-capture local changes and widened-scope deltas surfaced as warnings.

The Verifier LLM receives the primary diff, acceptance criteria, covered spec items, covered engineering foundations, and `specflow/AGENTS.md` and returns structured results per criterion including `pass`, `evidence`, `severity`, and `remediationHint`. Drift diff warnings are shown alongside verification output. This means verification judges the delivered change against the same continuous engineering constraints that shaped planning and bundle export rather than treating them as an end-stage afterthought.

---

## Data Model

### File Layout

```text
.env                               # provider secrets (OPENAI_API_KEY, etc.)
specflow/
  config.yaml                        # provider, model, host, port, repoInstructionFile (non-secret)
  AGENTS.md                          # repo instruction file (conventions)
  initiatives/                      # persisted project artifacts (legacy path name retained internally)
    <id>/
      initiative.yaml                # project metadata, workflow state, phase list
      brief.md
      core-flows.md
      prd.md
      tech-spec.md
      reviews/
        brief-review.yaml
        brief-core-flows-crosscheck.yaml
        core-flows-review.yaml
        core-flows-prd-crosscheck.yaml
        prd-review.yaml
        prd-tech-spec-crosscheck.yaml
        tech-spec-review.yaml
        spec-set-review.yaml
        ticket-coverage-review.yaml
      coverage/
        tickets.yaml
      traces/
        brief.yaml
        core-flows.yaml
        prd.yaml
        tech-spec.yaml
  tickets/
    <id>.yaml                        # all ticket fields including blockedBy/blocks
  runs/
    <id>/
      run.yaml                       # run metadata, committed attempt pointer
      attempts/
        <attempt-id>/
          bundle/                    # directory bundle (CLI)
            PROMPT.md
            AGENTS.md
            <referenced-spec-files>
          bundle-flat.md             # flattened clipboard version
          bundle-manifest.yaml       # versioned contract metadata
          snapshot-before/           # no-git baseline (file targets only)
          diff-primary.patch         # verification diff
          diff-drift.patch           # pre-capture local drift warning diff
          verification.json          # structured pass/fail results
      _tmp/
        <operation-id>/              # staged commit workspace (not yet committed)
          operation-manifest.yaml    # operation state + lease + validation
          ...
  decisions/
    <id>.md
```

### Core Entities

**Project**
```yaml
id: string
title: string
description: string          # original free-text input
status: draft | active | done
phases:
  - id: string
    name: string
    order: number
    status: active | complete
specIds: string[]
ticketIds: string[]
workflow:
  activeStep: brief | core-flows | prd | tech-spec | validation | tickets
  resumeTicketId: string | null
  steps:
    brief:
      status: locked | ready | complete | stale
      updatedAt: ISO8601 | null
    core-flows:
      status: locked | ready | complete | stale
      updatedAt: ISO8601 | null
    prd:
      status: locked | ready | complete | stale
      updatedAt: ISO8601 | null
    tech-spec:
      status: locked | ready | complete | stale
      updatedAt: ISO8601 | null
    validation:
      status: locked | ready | complete | stale
      updatedAt: ISO8601 | null
    tickets:
      status: locked | ready | complete | stale
      updatedAt: ISO8601 | null
  refinements:
    brief | core-flows | prd | tech-spec:
      questions: PlannerQuestion[]
      history: PlannerQuestion[]
      answers: Record<string, string | string[] | boolean>
      defaultAnswerQuestionIds: string[]
      baseAssumptions: string[]
      preferredSurface: questions | review | null
      checkedAt: ISO8601 | null
createdAt: ISO8601
updatedAt: ISO8601
```

Planner refinement checks now consume both the flattened saved answers and the persisted refinement question history for the current and earlier stages. Each refinement step stores the current blocker set in `questions` plus a durable `history` list that survives artifact generation, so completed phases can still reopen the exact answered survey later without losing blocker provenance. Refinement state also stores a `preferredSurface` value so the project route and Home resume links can restore the last meaningful planning surface for that phase. Artifact completion resets that preference to `review`, while an intentional `Back` or reopen flow can persist `questions` again later. The project workflow also stores a `resumeTicketId` so execution re-entry can reopen the active project ticket instead of re-deriving it from ticket sorting alone. Run detail stays explicit history: visiting a run report does not replace the ticket as the project's default execution resume target. That lets later checks see the original blocker questions, avoid same-stage duplicate re-asks, and reopen an earlier concern only when a real downstream constraint still blocks the next artifact. Reopened questions now carry explicit `reopensQuestionIds` references so cross-stage follow-ups are structural instead of prompt-only, and the client can render the earlier step/question/answer context inline when a blocker revisits prior work. PRD checks can receive lightweight repo context when earlier artifacts already indicate existing-system or compatibility work, while Tech spec checks and generation continue to receive repo context when existing-system, compatibility, failure-handling, performance, quality-strategy, or operations constraints matter. The planner now treats `quality-strategy` as the canonical tech-spec decision type and accepts legacy `verification` values as a compatibility alias.
Background refinement autosave remains a durability aid only. The explicit `Continue` action uses the current local draft answers as the source of truth for the foreground continuation request, so a slow background save cannot strand the user on an answered-survey summary card.

**Ticket**
```yaml
id: string
initiativeId: string | null  # null for Quick tasks
phaseId: string | null
title: string
description: string
status: backlog | ready | in-progress | verify | done
acceptanceCriteria:
  - id: string
    text: string
implementationPlan: string   # Markdown
fileTargets: string[]        # relative paths
coverageItemIds: string[]    # project coverage ledger items this ticket is expected to satisfy
blockedBy: string[]          # ticket IDs that must be done before this one starts
blocks: string[]             # ticket IDs that this one blocks
runId: string | null         # current active run
createdAt: ISO8601
updatedAt: ISO8601
```

**PlanningReviewArtifact**
```yaml
id: string                    # initiativeId:kind
initiativeId: string
kind: brief-review | brief-core-flows-crosscheck | core-flows-review | core-flows-prd-crosscheck | prd-review | prd-tech-spec-crosscheck | tech-spec-review | spec-set-review | ticket-coverage-review
status: passed | blocked | overridden | stale
summary: string
findings:
  - id: string
    type: blocker | warning | traceability-gap | assumption | recommended-fix
    message: string
    relatedArtifacts: [brief | core-flows | prd | tech-spec | validation | tickets]
                         # ticket-coverage-review findings persist one best-fit resolution step
                         # so Validation can reopen the correct artifact instead of inferring from summary text
sourceUpdatedAts:
  brief?: ISO8601
  core-flows?: ISO8601
  prd?: ISO8601
  tech-spec?: ISO8601
  tickets?: ISO8601
overrideReason: string | null
reviewedAt: ISO8601
updatedAt: ISO8601
```

Ticket-coverage review findings are narrower than the other review kinds. Cross-artifact reviews can still list the full set of related source artifacts, but blocked Validation findings persist a single best-fit resolution step so the client can reopen the right follow-up questions and still show a concrete fallback list when question regeneration is not possible.

**ArtifactTraceOutline**
```yaml
id: string                    # initiativeId:step
initiativeId: string
step: brief | core-flows | prd | tech-spec
sections:
  - key: string
    label: string
    items: string[]
sourceUpdatedAt: ISO8601
generatedAt: ISO8601
updatedAt: ISO8601
```

**TicketCoverageArtifact**
```yaml
id: string                    # initiativeId:ticket-coverage
initiativeId: string
items:
  - id: string
    sourceStep: brief | core-flows | prd | tech-spec
    sectionKey: string
    sectionLabel: string
    kind: string
    text: string
uncoveredItemIds: string[]
sourceUpdatedAts:
  brief?: ISO8601
  core-flows?: ISO8601
  prd?: ISO8601
  tech-spec?: ISO8601
  tickets?: ISO8601
generatedAt: ISO8601
updatedAt: ISO8601
```

**Run + RunAttempt**
```yaml
# run.yaml
id: string
ticketId: string | null      # null for standalone audits
type: execution | audit
agentType: claude-code | codex-cli | opencode | generic
status: pending | complete
attempts: string[]           # ordered attempt IDs
committedAttemptId: string | null
activeOperationId: string | null    # non-null only during staged commit
operationLeaseExpiresAt: ISO8601 | null
lastCommittedAt: ISO8601 | null
createdAt: ISO8601

# attempts/<id>/verification.json
attemptId: string
agentSummary: string
diffSource: git | snapshot
initialScopePaths: string[]
widenedScopePaths: string[]
primaryDiffPath: string
driftDiffPath: string | null
overrideReason: string | null
overrideAccepted: boolean
criteriaResults:
  - criterionId: string
    pass: boolean
    evidence: string
    severity: Critical | Major | Minor | Outdated
    remediationHint: string | null
driftFlags:
  - type: unexpected-file | missing-requirement | pre-capture-drift | widened-scope-drift | snapshot-partial-scope
    file: string
    description: string
overallPass: boolean
createdAt: ISO8601
```

**AuditFinding** (within the audit report for audit-type runs)
```yaml
findings:
  - id: string
    category: drift | acceptance | convention | bug | performance | security | clarity
    severity: error | warning | info
    confidence: number | null       # 0-1, present when LLM-generated
    description: string
    file: string
    line: number | null
    dismissed: boolean
    dismissNote: string | null
```

**Config**
```yaml
provider: anthropic | openai | openrouter
model: string                # e.g. claude-opus-4-6, gpt-4o, openrouter/auto
port: number                 # default 3141
host: string                 # default 127.0.0.1
repoInstructionFile: string  # default specflow/AGENTS.md
```

Provider secrets are stored separately in repo-root `.env`. Settings writes use the desktop sidecar config handlers (`config.save` and `config.saveProviderKey`) to update `.env`, refresh `process.env`, and keep the raw key out of runtime responses. Legacy `apiKey` fields found in `specflow/config.yaml` are auto-migrated into `.env` and scrubbed on startup.

**BundleManifest**
```yaml
bundleSchemaVersion: string
rendererVersion: string
agentTarget: claude-code | codex-cli | opencode | generic
exportMode: standard | quick-fix
ticketId: string | null
runId: string
attemptId: string
sourceRunId: string | null       # present for quick-fix from audit findings
sourceFindingId: string | null   # present for quick-fix from audit findings
contextFiles: string[]
requiredFiles: string[]
contentDigest: string
generatedAt: ISO8601
```

**OperationManifest**
```yaml
operationId: string
runId: string
targetAttemptId: string
state: prepared | committed | abandoned | superseded | failed
leaseExpiresAt: ISO8601
validation:
  passed: boolean
  details: string | null
preparedAt: ISO8601
updatedAt: ISO8601
```

### Entity Relationships

```mermaid
graph TD
    Project --> Phase
    Project --> Spec
    Project --> PlanningReview
    Project --> TicketCoverage[TicketCoverageArtifact]
    Project --> TraceOutline
    Project --> Ticket
    Phase --> Ticket
    TicketCoverage --> Ticket
    Ticket --> Ticket2[Ticket blockedBy/blocks]
    Ticket --> Run
    Run --> RunAttempt
    RunAttempt --> VerificationResult
    RunAttempt --> AuditFinding
    Spec --> TraceOutline
    PlanningReview --> TraceOutline
    PlanningReview --> TicketCoverage
    Config --> LLMClient
```

---

## Component Architecture

### packages/app - Backend and CLI

| Component | Responsibility |
|---|---|
| **CLI entry (`src/cli.ts`)** | Parses `ui`, `backup-store`, `export-bundle`, and `verify`; launches desktop for `ui` and runs local recovery, bundle, or verify operations against shared services |
| **Shared runtime factory (`src/runtime/create-runtime.ts`)** | Composes `ArtifactStore`, planner, verifier, bundle generator, diff engine, and config/runtime dependencies once for the sidecar runtime |
| **Runtime handlers (`src/runtime/handlers/*`)** | Transport-agnostic application operations grouped by domain; return plain typed results or structured handler errors |
| **Sidecar dispatcher (`src/sidecar/dispatcher.ts`)** | Maps JSON-RPC method names to shared runtime handlers; emits request-scoped progress plus `artifacts.changed` notifications |
| **Sidecar entrypoint (`src/sidecar.ts`)** | Long-lived line-delimited JSON process that powers desktop mode |
| **Artifact store (`src/store/*`)** | In-memory read model plus staged-commit persistence layer for `specflow/`, including watcher-driven reloads and recovery state |
| **Planner / verifier / bundle / audit modules** | Own planning workflow, verification semantics, bundle rendering, and drift-audit behavior without transport coupling |

### packages/client - Presentation Layer

| Component | Responsibility |
|---|---|
| **`App.tsx`** | Holds the top-level `ArtifactsSnapshot`, refreshes persisted state, and subscribes to desktop artifact-change events |
| **Transport adapter (`src/api/transport.ts`)** | Owns desktop transport (`invoke`, `Channel`, native dialogs, Tauri events), local mutation refresh suppression, and desktop-safe error handling |
| **API modules (`src/api/*`)** | Keep domain-level client APIs stable while routing them through the sidecar transport |
| **Workspace shell + navigation** | Provide the collapsing/expanding left sidebar, command palette, and route-level workspace structure |
| **Project / ticket / run views** | Render planning, execution, and verification flows using backend-owned workflow and verification state |
| **Execution hooks** | Manage local UI concerns such as verification log display, capture preview debouncing, export workflow state, and error toasts |

### packages/tauri - Desktop Bridge

| Component | Responsibility |
|---|---|
| **Rust bridge (`src-tauri/src/lib.rs`)** | Spawns the Node sidecar, forwards request/response traffic, relays progress events, emits `artifacts-changed`, and drains pending requests on disconnect |
| **Tauri config (`tauri.conf.json`)** | Production build configuration, including frontend assets and packaged sidecar binary |
| **Dev config (`tauri.dev.conf.json`)** | Dev-only overlay that disables `externalBin` so `tauri dev` can use the Node `dist/sidecar.js` flow instead of requiring a packaged sidecar |
| **Workspace scripts (`packages/tauri/package.json`)** | Own the desktop dev stack through `beforeDevCommand`, including the app/client watch processes and watcher-first sidecar startup |

---

## Transport Surfaces

### Desktop sidecar method families

The desktop runtime uses correlated JSON-RPC requests over stdin/stdout between Tauri and the Node sidecar. Current method families:

| Namespace | Purpose |
|---|---|
| `runtime.*` / `artifacts.*` | Runtime status and full snapshot reads |
| `config.*` / `providers.*` | Non-secret settings writes, provider-key saves, and provider model discovery |
| `operations.*` | Operation-status probing for idempotent retries |
| `initiatives.*` | Project workflow actions, reviews, and ticket-plan generation |
| `tickets.*` | Ticket CRUD, bundle export, capture preview, verification, and override flows |
| `runs.*` | Run list/detail/state plus desktop ZIP save |
| `audit.*` | Drift audit execution and finding actions |
| `import.*` | GitHub Issue import |

## End-to-End Request Trace: Desktop Verification

```mermaid
sequenceDiagram
    participant UI as React UI
    participant Tauri as Tauri Bridge
    participant Sidecar as Node Sidecar
    participant Verify as Verifier Service
    participant Store as Artifact Store

    UI->>Tauri: invoke("sidecar_request", tickets.captureResults)
    Tauri->>Sidecar: LDJSON request
    Sidecar->>Verify: captureAndVerify(...)
    Verify->>Verify: git diff or snapshot compare
    Verify-->>Sidecar: progress notifications + final result
    Sidecar->>Store: staged write of attempt artifacts
    Sidecar-->>Tauri: success response + artifacts.changed
    Tauri-->>UI: request-scoped events + artifacts-changed event
    UI->>UI: refresh snapshot and render verification results
```

## End-to-End Request Trace: Bundle Export

```mermaid
sequenceDiagram
    participant UI as React UI
    participant Bridge as Tauri Bridge
    participant Runtime as Shared Runtime Handler
    participant Bundle as Bundle Generator
    participant Store as Artifact Store

    UI->>Bridge: tickets.exportBundle
    Bridge->>Runtime: exportBundle handler
    Runtime->>Bundle: generate(ticketId, agent, exportMode)
    Bundle->>Store: read ticket/spec context
    Bundle->>Store: staged write of bundle artifacts and manifests
    Runtime-->>Bridge: flatString + run/attempt metadata
    Bridge-->>UI: export result
    UI->>UI: show flat bundle, copy action, and ZIP save action
```
