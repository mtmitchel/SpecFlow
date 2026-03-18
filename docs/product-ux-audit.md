# Product UX Audit

Rigorous product, workflow, and UX audit for the current desktop-first SpecFlow app.

## Executive summary

SpecFlow has the right product spine: a guided planning workspace that turns an idea into executable, verifiable work. The repository docs, workflow contract, and package boundaries are more coherent than the live user experience.

The current UX breaks down because the UI still behaves like three competing products at once:

- a guided planning workspace
- a document and review tool
- an internal operations console

The main problem is not visual polish. It is orchestration and state exposure. Too many internal workflow mechanics are visible to the user, phase transitions are not consistent enough, and navigation spreads the same meaning across too many surfaces.

### Top 5 product and UX problems

1. The planning flow is fragmented across separate route modes, inline states, drawers, review surfaces, and auto-advance logic instead of behaving like one continuous guided workflow.
2. The UI leaks internal state and workflow machinery into the experience. Users see too many intermediate `check`, `review`, `ready`, `override`, and `move on anyway` states.
3. Navigation is over-instrumented and under-prioritized. Home, pipeline, breadcrumbs, icon rail, expanded sidebar, drawers, ticket links, and run links all compete to answer orientation.
4. Execution and audit are functionally strong but interactionally too technical. The app often reads like a tool for operating its own engine rather than a product helping the user finish work.
5. Resume and re-entry behavior is not trustworthy enough. The app derives the next surface from workflow state, review state, tickets, and query params, but does not preserve a stable “last meaningful place” mental model.

### Top 5 highest-leverage improvements

1. Replace the current planning-phase UI branching with one explicit per-phase state machine: `questions`, `checking`, `drafting`, `reviewing`, `done`.
2. Remove planning-phase checkpoint interruptions as primary screens. Keep reviews secondary unless they truly block progression.
3. Rebuild the app shell around one stable hierarchy: `Home -> Initiative -> Phase/Ticket -> Run`.
4. Reframe execution and audit around user decisions, not backend mechanics.
5. Standardize transition states so the user always knows what is happening, why, and what happens next.

## Audit scope and assumptions

### Scope reviewed

- Product docs:
  - `README.md`
  - `docs/workflows.md`
  - `docs/runtime-modes.md`
  - `docs/architecture.md`
  - `docs/product-language-spec.md`
- Core client shell and journey views:
  - `packages/client/src/App.tsx`
  - `packages/client/src/app/views/overview-panel.tsx`
  - `packages/client/src/app/views/initiative-creator.tsx`
  - `packages/client/src/app/views/initiative/planning-spec-section.tsx`
  - `packages/client/src/app/views/initiative-view.tsx`
  - `packages/client/src/app/views/ticket-view.tsx`
  - `packages/client/src/app/views/run-view.tsx`
  - `packages/client/src/app/views/quick-task-page.tsx`
  - `packages/client/src/app/layout/settings-modal.tsx`
- Workflow and state orchestration:
  - `packages/client/src/app/views/initiative/use-initiative-planning-workspace.ts`
  - `packages/client/src/app/views/initiative/use-phase-auto-advance.ts`
  - `packages/client/src/app/utils/initiative-progress.ts`
  - `packages/client/src/app/utils/initiative-workflow.ts`
  - `packages/client/src/app/utils/ui-language.ts`
  - `packages/app/src/planner/workflow-contract.ts`
- Review, ticket, and audit surfaces:
  - `packages/client/src/app/views/initiative/refinement-section.tsx`
  - `packages/client/src/app/views/initiative/tickets-step-section.tsx`
  - `packages/client/src/app/components/audit-panel.tsx`
  - `packages/client/src/app/views/ticket/export-section.tsx`
  - `packages/client/src/app/views/ticket/capture-verify-section.tsx`
  - `packages/client/src/app/views/ticket/verification-results-section.tsx`

### Assumptions

- Desktop-first Tauri usage is the product of record.
- Legacy web is a fallback path and should only meaningfully shape UX where parity or runtime constraints matter.
- Solo builders and small teams remain the primary audience.
- The right mental model is `guided planning workspace`, not `document archive` or `agent control panel`.

### Evidence gaps

- Local `specflow/` runtime artifacts were effectively absent during the audit, so persisted real-user initiatives and runs could not be inspected from disk.
- The audit is grounded in docs, implementation, and user-reported screenshots and behavior, but not in telemetry or live user research.
- No live interactive desktop walkthrough was performed during this audit pass.

## End-to-end journey audit

### Home, shell, and navigation

**User goal:** understand what matters now and resume or start work fast.

**Current experience:** Home combines an `In progress` queue, initiative cards, an icon rail, an expandable sidebar, a pipeline in downstream views, breadcrumbs, and a command palette.

**Friction points:**

- too many orientation systems
- no single authoritative answer to “where am I?” and “what should I do next?”
- the expanded sidebar behaves more like a secondary context layer than a stable information architecture

**UX and system risk:** the app feels denser than necessary before the user even starts work.

**Recommended redesign direction:** Make Home a control tower with three jobs only:

- resume work
- start new work
- review recent work

Make the sidebar a stable object navigator. Keep the pipeline as in-context orientation chrome only.

### New initiative entry

**User goal:** start planning with minimal friction.

**Current experience:** `/new` chooses initiative vs quick task, `/new-initiative` captures the idea, and the app now routes directly into the shared Brief planning workspace.

**Friction points:**

- extra chooser before the user reaches planning
- the first phase has only recently been unified with the downstream planning pattern, so the surrounding workspace still carries complexity from the old special-cased handoff model

**UX and system risk:** the most important first-run journey is structurally brittle.

**Recommended redesign direction:** collapse creation and brief intake into one uninterrupted planning surface. The idea stays visible and brief intake begins immediately underneath it.

### Brief intake

**User goal:** answer just enough to ground the brief.

**Current experience:** the product now uses the shared planning surface for Brief, with a survey card, auto-start checks, inline revision, and compact loading states reused by downstream phases.

**Friction points:**

- hidden automatic checks
- special-case handoff logic
- multiple representations of the same survey state
- known regressions around huge cards, blank states, premature advancement, and inconsistent back behavior

**UX and system risk:** the first planning phase does not behave like a trustworthy, durable pattern.

**Recommended redesign direction:** brief intake should become standard phase state, not route state. Always use the same loop:

1. answer question
2. continue
3. check whether more input is needed
4. either ask again or draft the brief

### Brief review and revision

**User goal:** review the generated brief, revise if needed, then move on.

**Current experience:** the brief is shown in the main workspace, but answer revision, text editing, and review logic are distributed across inline content and drawers.

**Friction points:**

- too many editing modes
- revision of answers, editing of text, and review gating are not cleanly separated

**UX and system risk:** the user has to understand system structure to perform a simple revise-and-continue task.

**Recommended redesign direction:** the brief review screen should be stable and literal. Main document in center. Top-right actions only:

- `Back`
- `Edit text`
- `Copy`
- `Continue to core flows`

If the user goes back, show the answered survey inline in the same workspace and replace `Generate brief` with `Regenerate brief`.

### Core flows, PRD, and Tech spec

**User goal:** answer follow-up questions only when necessary, generate the artifact, review it, continue.

**Current experience:** downstream phases rely on auto question loading, auto-checking, auto-generation, ready states, generate buttons, compact survey cards, checkpoint banners, and sometimes document review plus next-phase navigation.

**Friction points:**

- downstream phases do not behave like a predictable pattern
- intermediate “ready” states still appear where the system should either keep asking questions or land on the drafted artifact
- user-facing behavior is driven by too many internal conditions

**UX and system risk:** users cannot confidently predict what will happen after answering questions.

**Recommended redesign direction:** all artifact phases should follow the same interaction model as Brief:

1. enter phase
2. if questions are needed, show them immediately
3. after final answer, check if more are needed
4. if none, generate the artifact
5. land on document review
6. require explicit continue to the next phase

### Tickets and coverage check

**User goal:** turn the plan into execution-ready tickets and know whether execution can start.

**Current experience:** the tickets phase combines ticket generation, coverage review, phase name editing, ticket lists, and linked runs.

**Friction points:**

- the page mixes readiness, plan review, and downstream management
- coverage is important but still framed as one more planning review artifact

**UX and system risk:** the planning-to-execution handoff feels weak.

**Recommended redesign direction:** treat Tickets as a readiness handoff screen:

- `Generate tickets`
- review grouped ticket plan
- run or inspect coverage
- if clear, `Open first ticket`
- if blocked, keep the user in one focused coverage-fix surface

### Ticket execution

**User goal:** start work, bring work back, verify it, and either finish or retry.

**Current experience:** the ticket view uses a three-step execution timeline with preflight, export, capture, verification, and side context.

**What works:**

- strong primary structure
- good separation of preflight, execution, capture, and verdict
- initiative pipeline still gives orientation without taking over the page

**Friction points:**

- too many low-level mechanics are surfaced in the main flow
- bundle formats, ZIP variants, raw scope inputs, widened scope behavior, and verification internals add cognitive load

**UX and system risk:** the execution workspace is powerful but still reads like an operator console.

**Recommended redesign direction:** keep the three-stage structure but simplify each stage to its primary decision:

- Stage 1: `Start execution`
- Stage 2: `Review returned work`
- Stage 3: `Decide outcome`

Move advanced bundle, diff, and scope controls behind secondary disclosure.

### Run detail and audit

**User goal:** inspect execution history, review changes, and diagnose problems.

**Current experience:** run detail combines summary, diff loading, drift diff, attempt history, and an embedded audit panel.

**Friction points:**

- audit is still presented as a technical multi-mode tool
- diff-source modes and scope controls are exposed too early
- audit does not feel like a natural extension of verification

**UX and system risk:** audit feels bolted on rather than productized.

**Recommended redesign direction:** keep run detail as a historical report. Turn audit into a guided review flow with a default mode and advanced options hidden until needed.

### Quick task

**User goal:** get a small task moving immediately.

**Current experience:** Quick task is lean and escalates into initiative planning when necessary.

**What works:**

- clear short-input entry
- good product decision to escalate into planning when scope expands

**Friction points:**

- it feels like a side feature rather than a first-class fast lane

**Recommended redesign direction:** frame Quick Build as the single-ticket fast lane and make its escalation into initiative planning more visibly part of the same overall workflow.

### Settings and activation

**User goal:** configure the environment once and get back to work.

**Current experience:** settings are modal and scoped appropriately, but setup readiness is under-signaled in the rest of the product.

**Friction points:**

- setup context is too detached from planning and execution entry points
- blocked AI-dependent moments do not always provide strong enough setup framing

**Recommended redesign direction:** keep settings modal-based, but surface provider/model/key readiness contextually in Home and at blocked planning or execution moments.

## Cross-cutting UX and system issues

### Workflow problems

- The app has the right high-level workflow but the wrong interaction granularity.
- Planning phases behave like a sequence of exceptions rather than one repeatable pattern.
- The system still stops on intermediate “ready” states where it should either keep asking questions or land on the generated artifact.

### Information architecture problems

- Navigation is spread across too many systems.
- The sidebar is not yet a stable information architecture tool.
- Home mixes resume logic, browsing, and creation without enough hierarchy.

### Interaction design problems

- Drawers are used for tasks that should happen in the main workspace.
- The same job is often available from multiple controls.
- Buttons often reflect system mechanics instead of user decisions.

### Copy and labeling problems

- The product language spec is stronger than the current UI.
- The UI still leaks low-trust labels such as `Move on anyway`, `Fix issues`, and raw audit terminology.
- Waiting states do not consistently tell the user what the system is doing and what happens next.

### State-model problems

- The planning workspace carries too many overlapping state models:
  - workflow state
  - active step
  - refinement state
  - draft state
  - drawer state
  - auto-load state
  - busy action state
  - inline survey state
  - query-param route state
- The user-facing result is unpredictability.

### Navigation problems

- The product needs one dominant hierarchy, not several partial ones.
- The pipeline should be orientation plus phase switching, not a second workflow system.
- Resume behavior should restore the last meaningful work surface, not just the next computable workflow step.

### Trust, clarity, and feedback problems

- Hidden auto-transitions have damaged trust.
- Blank or oversized loading cards make the product feel unstable even when backend logic is correct.
- Waiting states are not always tied to a clear promise about what the system will do next.

### Resume, back, and recovery problems

- The app derives where to send the user from workflow progress and gates, but does not preserve enough task intent.
- `Back` is inconsistent across planning, document review, drawers, ticket history, and run detail.
- Recovery states exist in the system model but are not yet fully translated into clear recovery paths in the UX.

## Prioritized findings

| Severity | Area | Issue | Why it matters | Recommended fix | Expected impact |
|---|---|---|---|---|---|
| Critical | Planning workflow | Separate handoff route for brief intake | Breaks continuity in the highest-value first-run flow | Eliminate special handoff mode and fold brief intake into the standard planning workspace | Higher trust and lower workflow fragility |
| Critical | State model | Too many visible planning substates | Users see internal orchestration instead of a clean journey | Replace planning branching with one explicit per-phase state machine | Major reduction in confusion and regressions |
| Critical | Review model | Planning checkpoints interrupt too often | Drafting feels blocked by internal QA mechanics | Make reviews secondary unless they truly block progression | Cleaner mental model and faster flow |
| High | Navigation | Too many parallel navigation systems | Users cannot tell which surface is authoritative | Rebuild shell around one hierarchy: `Home -> Initiative -> Phase/Ticket -> Run` | Better orientation and re-entry |
| High | Downstream planning | Core flows, PRD, and Tech spec do not mirror Brief cleanly | Users cannot predict what happens after answering questions | Make all artifact phases use the same survey -> check -> review pattern | Better learnability and repeat usage |
| High | Execution UX | Ticket flow exposes too much engine detail | Raises cognitive load at the point of action | Keep the 3-step structure but hide advanced mechanics behind disclosure | Faster execution and verification |
| High | Audit UX | Drift audit is too tool-like | Feels bolted on, not productized | Turn audit into a guided review flow with a default path and advanced options secondary | Better usability and adoption |
| Medium | Tickets phase | Coverage check is conceptually right but poorly framed | Weakens planning-to-execution handoff | Reframe Tickets as readiness handoff, not mixed management view | Better execution start clarity |
| Medium | Home | Up next and initiative cards are useful but not sufficiently hierarchical | Resume and browse compete | Strengthen queue as primary and recent initiatives as secondary | Faster restart of work |
| Medium | Activation | Environment readiness is under-signaled | First-run and blocked states feel disconnected from setup | Surface provider/model/key readiness contextually | Lower setup friction |

## Streamlined target workflow

### Proposed ideal flow

1. **Home**
   - Answer one question: what should I do now?
   - Show one clear resume card at the top.
   - Show recent initiatives below.
   - Keep `Start new initiative` primary and `Quick task` secondary.

2. **New initiative**
   - Enter one planning workspace immediately.
   - Keep the idea visible at the top.
   - Move directly into brief intake below it.

3. **Brief**
   - Ask questions one at a time in a survey card.
   - After the last answer, check if more input is needed.
   - If yes, continue in the same survey card.
   - If no, generate the brief and land on brief review.
   - Brief review actions:
     - `Back`
     - `Edit text`
     - `Copy`
     - `Continue to core flows`

4. **Core flows / PRD / Tech spec**
   - Reuse the exact same pattern as Brief.
   - If more questions are needed, stay in the survey.
   - If none are needed, generate the artifact and land on document review.
   - Require explicit continue to the next phase from the reviewed document.

5. **Tickets**
   - Generate tickets.
   - Review the grouped ticket plan.
   - Show the coverage result clearly.
   - If coverage is clear, `Open first ticket`.
   - If blocked, keep the user in one focused coverage-fix surface.

6. **Ticket execution**
   - Stage 1: `Start execution`
   - Stage 2: `Review returned work`
   - Stage 3: `Decide outcome`
   - Keep advanced diff and scope mechanics secondary.

7. **Run detail**
   - Historical report only.
   - Show summary, verdict, changes, attempts, and link back to the ticket.
   - Launch audit as a deliberate “Review changes” action, not a default embedded utility panel.

8. **Resume and re-entry**
   - Restore the last meaningful work surface:
     - active question if in planning
     - reviewed document if artifact exists and user has not continued
     - ticket verify if a run completed and verification is pending
     - run report only when the user explicitly opens history

### Automatic versus explicit

**Automatic**

- check whether more questions are needed after the user explicitly finishes a survey
- generate downstream artifacts immediately after final answers if the phase contract calls for it
- refresh snapshot state after completed operations

**Explicit**

- finish a question
- continue to the next phase
- override a truly blocking readiness issue
- run an audit

**Visible**

- current phase
- current task
- what the system is doing now
- what happens next

**Hidden or secondary**

- low-level review types
- diff-source modes
- widened-scope mechanics
- bundle format variants

## Structural redesign recommendations

### Information architecture

- Make `Home`, `Initiative`, `Ticket`, and `Run` the primary object hierarchy.
- Keep phase artifacts inside the initiative experience, not as semi-detached drawer and review flows.
- Treat Quick task as a first-class fast lane into either Ticket or Initiative.

### Navigation

- Keep the pipeline for orientation and phase switching only.
- Make the sidebar a stable hierarchy browser.
- Remove context-sensitive surprises from expanded navigation.

### Interaction model

- Use the main workspace for primary planning tasks.
- Reserve drawers for secondary detail only.
- Use one survey pattern across all planning phases.
- Use one document review pattern across all artifact phases.

### State model

- Reduce planning UI to five user-facing states per phase:
  - answering
  - checking
  - drafting
  - reviewing
  - complete
- Keep review artifacts in the backend workflow contract, but expose only user-meaningful outcomes in the default UI.
- Persist enough intent to restore the last meaningful surface, not just the next valid step.

### Copy and terminology

- Align the UI more strictly to `docs/product-language-spec.md`.
- Replace system-mechanics labels with user-task labels.
- Make every waiting state answer:
  - what is happening
  - why it is happening
  - what happens next

### Review and gating model

- Keep planning reviews as quality instrumentation, not a parallel journey.
- Only surface a hard interrupt when the user truly cannot move forward safely.
- Keep ticket coverage as the single major pre-execution readiness gate.

## Implementation roadmap

### Phase 1: critical fixes

- unify brief intake into the standard planning workspace
- replace current planning-phase branching with one explicit per-phase state model
- remove planning-phase checkpoint interruptions from the primary journey
- fix resume and back behavior around artifact review and question flows
- standardize compact loading and checking cards

### Phase 2: workflow cleanup

- make all artifact phases behave the same
- redesign Home and sidebar for clearer hierarchy and resume behavior
- simplify the Tickets phase into a clean planning-to-execution handoff
- clean up labels and transition copy to match the product language spec

### Phase 3: deeper product improvements

- productize audit as a guided review flow
- simplify execution-stage advanced controls with progressive disclosure
- improve settings and activation visibility across the app
- introduce stronger persisted resume intent and historical context rules

## Validation plan

### What to prototype first

- unified artifact-phase flow:
  - survey
  - checking state
  - document review
  - continue to next phase
- Home plus sidebar hierarchy
- simplified ticket execution flow
- audit entry and findings flow

### What to test

- a new user can start an initiative and reach reviewed Brief without confusion
- moving from Brief to Core flows does not produce dead-end or ambiguous intermediate screens
- revising answers after artifact generation is understandable and reversible
- resuming an initiative from Home lands the user in the expected place
- exporting, verifying, failing, retrying, and completing a ticket does not require understanding backend mechanics

### Signals the redesign is working

- fewer surprise transitions
- fewer “what now?” moments
- fewer navigation reversals and re-open loops
- faster time from idea to reviewed artifact
- faster time from ticket open to verification outcome
- lower need for override-style actions during planning

## Engineering mapping

The highest-value remediation work is concentrated in these areas:

- **Shell and navigation**
  - `packages/client/src/app/views/overview-panel.tsx`
  - `packages/client/src/app/layout/icon-rail.tsx`
  - `packages/client/src/app/layout/navigator.tsx`
- **Planning flow and state**
  - `packages/client/src/app/views/initiative-route-view.tsx`
  - `packages/client/src/app/views/initiative/planning-spec-section.tsx`
  - `packages/client/src/app/views/initiative-view.tsx`
  - `packages/client/src/app/views/initiative/use-initiative-planning-workspace.ts`
  - `packages/client/src/app/views/initiative/use-phase-auto-advance.ts`
- **Workflow semantics and copy**
  - `packages/client/src/app/utils/initiative-progress.ts`
  - `packages/client/src/app/utils/initiative-workflow.ts`
  - `packages/client/src/app/utils/ui-language.ts`
  - `packages/app/src/planner/workflow-contract.ts`
- **Execution and audit surfaces**
  - `packages/client/src/app/views/ticket-view.tsx`
  - `packages/client/src/app/views/ticket/export-section.tsx`
  - `packages/client/src/app/views/ticket/capture-verify-section.tsx`
  - `packages/client/src/app/views/ticket/verification-results-section.tsx`
  - `packages/client/src/app/views/run-view.tsx`
  - `packages/client/src/app/components/audit-panel.tsx`

## Final assessment

SpecFlow already has the right product spine. The problem is that the UI still exposes too much of the orchestration layer. The correct redesign is not a visual refresh. It is a simplification of phase state, review visibility, navigation hierarchy, and execution language so the product consistently behaves like one guided planning workspace from first idea through verified delivery.
