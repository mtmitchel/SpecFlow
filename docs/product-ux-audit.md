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

1. Navigation authority is still split across Home, the sidebar, the pipeline, and in-view status treatment. The user can resume correctly more often now, but the shell still asks them to infer which surface is in charge.
2. Tickets still mix planning handoff, readiness, management, and history. The page is better grounded than before, but the planning-to-execution transition is not framed clearly enough as one deliberate handoff.
3. Ticket execution is functionally strong but still too technical in the default path. Advanced bundle, diff, and verification mechanics still compete with the primary user decision at each stage.
4. Run detail and audit are still too coupled. Historical review and guided change review are closer than before, but they still read more like embedded tooling than a clean product flow.
5. Transition and state messaging are still uneven across shell, execution, and audit. Planning-phase handoffs are more consistent now, but the final UX still needs a stronger shared explanation of what is happening, why, and what comes next once the user leaves the planning loop.

### Top 5 highest-leverage improvements

1. Rebuild the shell around one stable hierarchy: `Home -> Initiative -> Phase/Ticket -> Run`.
2. Reframe Tickets as the explicit planning-to-execution handoff.
3. Simplify ticket execution around the three user decisions that matter most.
4. Separate historical run inspection from guided audit review.
5. Finish the cross-surface copy and transition-state alignment pass.

## Status update

Several of the highest-risk workflow flaws from the first audit have already landed on `main`:

- planning phases now use a much more consistent shared state model instead of fragmented special-case handoff routes
- review `Back` can reopen the answered question history inline for targeted revisions
- planner stage boundaries and question contracts are substantially tighter
- planning re-entry now restores the last meaningful planning surface
- initiative execution re-entry now restores the active initiative ticket, and run detail stays explicit history rather than replacing that resume target
- planning transition states now name the active phase and the next action instead of falling back to generic waiting copy
- browser E2E coverage now exercises the main initiative workflow plus the core-flows review-back/update path against a deterministic harness

The remaining work is narrower than the original audit implied. The main product risk is now shell authority and downstream execution/audit productization, not whether planning itself has a coherent spine.

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
- Browser E2E now covers the main initiative workflow and the core-flows review-back/update path, but it still uses a deterministic fake planner/verifier instead of the live desktop provider path.

## End-to-end journey audit

### Home, shell, and navigation

**User goal:** understand what matters now and resume or start work fast.

**Current experience:** Home now combines a stronger `Up next` queue, initiative cards with clearer resume targets, an icon rail, an expandable sidebar, a pipeline in downstream views, and a command palette.

**Friction points:**

- too many orientation systems
- the queue is clearer than it was, but the shell still does not give one consistently authoritative answer to “where am I?” and “what should I do next?”
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

**Current experience:** the product now uses the shared planning surface for Brief, with a survey card, inline revision, durable answered-question history, and resume behavior that can return to either review or the reopened questions surface.

**Friction points:**

- some shell-level framing still makes the first-run flow feel denser than the phase loop itself
- the strongest remaining complexity is in how planning status is narrated around the surface, not inside the Brief interaction itself

**UX and system risk:** the first planning phase is now much more durable, but the surrounding shell still needs to reinforce that simplicity instead of reintroducing competing explanations.

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

- The app has the right high-level workflow and the planning phases are materially more repeatable than they were.
- The remaining workflow problem is downstream: Tickets, execution, and audit still expose too much product-internal machinery in the default path.
- Some shell surfaces still narrate workflow state in parallel instead of deferring to one primary object and action.

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
- Planning waiting states are more consistent than they were, but shell, execution, and audit still do not always tell the user what the system is doing and what happens next.

### State-model problems

- Planning-phase state is substantially cleaner than it was at the start of this audit.
- The remaining state-model risk is now split across shell authority, execution resume intent, history surfaces, and transition messaging.
- The user-facing result is improved, but not yet fully simplified once they leave the planning phases.

### Navigation problems

- The product needs one dominant hierarchy, not several partial ones.
- The pipeline should be orientation plus phase switching, not a second workflow system.
- Resume behavior should restore the last meaningful work surface, not just the next computable workflow step.

### Trust, clarity, and feedback problems

- Hidden auto-transitions have damaged trust.
- Blank or oversized loading cards make the product feel unstable even when backend logic is correct.
- Waiting states are not always tied to a clear promise about what the system will do next.

### Resume, back, and recovery problems

- Planning re-entry and initiative execution resume now preserve much more task intent than before.
- The remaining gap is consistency on lower-value historical surfaces and recovery moments, especially where ticket, run, and audit flows still overlap.
- Recovery states exist in the system model, but not every degraded or historical path is translated into one obvious next step yet.

## Prioritized findings

| Severity | Area | Issue | Why it matters | Recommended fix | Expected impact |
|---|---|---|---|---|---|
| High | Navigation | Too many parallel navigation systems still compete for authority | Users can resume more reliably, but still have to infer which shell element is primary | Rebuild shell around one hierarchy: `Home -> Initiative -> Phase/Ticket -> Run` | Better orientation and lower navigation noise |
| High | Tickets phase | Tickets still reads as a mixed planning-management surface | Weakens the planning-to-execution handoff | Reframe Tickets as readiness handoff, not mixed management view | Better execution start clarity |
| High | Execution UX | Ticket flow still exposes too much engine detail | Raises cognitive load at the point of action | Keep the 3-step structure but hide advanced mechanics behind disclosure | Faster execution and verification |
| High | Audit UX | Drift audit is still too tool-like in the default framing | Feels bolted on, not productized | Turn audit into a guided review flow with a default path and advanced options secondary | Better usability and adoption |
| Medium | Transition copy | State and waiting messages are still uneven outside the stabilized planning loop | Users still have to parse system mechanics instead of user intent in some shell, execution, and audit states | Finish the cross-surface product-language pass | Better trust and fewer “what now?” moments |
| Medium | Resume and recovery | Resume is stronger, but lower-value history and recovery paths still need clearer defaults | Historical surfaces can still compete with active work in edge cases | Keep active work primary and make history clearly secondary | Better re-entry and failure recovery |
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

### Landed since the first audit pass

- unified brief intake into the standard planning workspace
- replaced planning-phase branching with a more explicit shared per-phase model
- removed planning-phase checkpoint interruptions from the primary journey
- fixed review `Back` and planning-surface re-entry around artifact review and question flows
- introduced stronger persisted resume intent for planning surfaces and active initiative tickets
- normalized planning transition copy so phase entry checks, follow-up checks, and artifact generation name the current phase directly
- added browser E2E coverage for the main initiative workflow and the core-flows review-back/update path

### Remaining workflow cleanup

- redesign Home and sidebar for clearer hierarchy and authority
- reframe the Tickets phase into a clean planning-to-execution handoff
- clean up labels and transition copy to match the product language spec across shell, tickets, runs, and audit

### Remaining deeper product improvements

- simplify execution-stage advanced controls with progressive disclosure
- productize audit as a guided review flow distinct from historical run detail
- improve settings and activation visibility across the app

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
- resuming an initiative from Home lands the user in the expected active planning surface or initiative ticket
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
