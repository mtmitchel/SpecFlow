# Product Language Spec - SpecFlow

Related docs:

- For the docs index, see [`README.md`](README.md)
- For user workflow behavior, see [`workflows.md`](workflows.md)
- For runtime and architecture context, see [`runtime-modes.md`](runtime-modes.md) and [`architecture.md`](architecture.md)
- For tone, sentence mechanics, and component-level microcopy rules, see [`ux-copy-guidelines.md`](ux-copy-guidelines.md)

## Purpose

This document defines the user-facing language system for SpecFlow.

Its job is to keep the app coherent across planning, execution, and review. It covers:

- product framing
- phase language
- status language
- CTA hierarchy
- empty states
- transition messages
- copy rules

This spec is authoritative for user-facing UI text. Internal implementation terms may still exist in code, routes, APIs, and artifact paths, but they should not leak into the default product experience unless they are necessary for expert users.

Use [`ux-copy-guidelines.md`](ux-copy-guidelines.md) as the companion style guide for tone, grammar, button labels, empty states, errors, and other component-level copy patterns.

## Product framing

### Core product definition

SpecFlow is a guided planning workspace for turning an idea into executable, verifiable work.

The app should feel like one continuous workflow:

`Idea -> Brief -> Core flows -> PRD -> Tech spec -> Validation -> Tickets -> Runs`

### Product promise

SpecFlow should help the user:

1. turn a rough idea into a first draft quickly
2. refine the plan only where ambiguity matters
3. break the plan into execution-ready tickets
4. verify that delivery matches the plan

### Primary mental model

The dominant mental model is:

`guided planning workspace`

The app must not default to these weaker mental models:

- intake questionnaire
- document archive
- internal agent control panel

Those may exist as supporting behaviors, but the UI should always anchor the user in planning progress.

## Workflow model

### Canonical phase sequence

The user-facing workflow is:

1. Project
2. Brief
3. Core flows
4. PRD
5. Tech spec
6. Validation
7. Tickets
8. Runs

### Pipeline model

The UI may render a wider project pipeline than the canonical noun sequence when that helps orientation.

The current project pipeline is:

1. Brief
2. Core flows
3. PRD
4. Tech spec
5. Validation
6. Tickets
7. Execute
8. Verify
9. Done

Rules:

- `Execute`, `Verify`, and `Done` are UI progress zones derived from ticket and run state.
- `Run` remains the canonical object name for execution reports.
- The pipeline is navigation and orientation chrome, not a second workflow contract.
- Home and run history should not present the full project pipeline as the primary navigation model.

### Clarification model

Clarification is not a named top-level phase.

Clarification is a refinement mechanism that can appear:

- before the Brief, always as the required brief intake for a fresh project
- before Core flows, as the required first consultation that locks the primary flow, a meaningful branch, and a flow condition that changes the map
- before the PRD, as the required first scope-setting question before the initial PRD draft, with up to three additional targeted blockers when the product contract is still ambiguous
- before the Tech spec, as the required first architecture question before the initial Tech spec draft, with up to four additional targeted blockers when implementation consequences are still ambiguous
- inside Validation, when the draft ticket plan exposes unresolved gaps that can be turned back into targeted artifact-level follow-up questions without sending the user backward through the pipeline

The UI should present clarification as help for improving the next artifact, not as a separate workflow destination.
When an artifact already exists, the review screen should still be able to reopen that same step's answered clarification history inline. `Back` should always mean "go to the previous stage." Reopening the current step's answered questions should use an explicit action such as `Revise answers`, not `Back`. Resume behavior should remember that deliberate choice: artifact generation defaults the phase back to review, but if the user deliberately reopens the answered questions, Home and bare project routes should restore that questions surface until the user returns to review or leaves the phase.

For a fresh project, the required Brief intake always captures four framing decisions:

- the primary problem
- the primary user
- the success qualities that should feel true if v1 works
- the hard boundaries that constrain the first release

Those four decisions must stay distinct. The intake should not restate the primary problem as a success criterion, and hard boundaries should not be phrased like implementation choices unless they are truly non-negotiable.
The option language should stay domain-neutral so the intake works for new products, reliability fixes, integrations, compliance work, and existing-system changes without signaling one product category by default.
Select and multi-select questions should always preserve an `Other` path so the user is not trapped by a finite option list that misses their case.
If a later stage must revisit one of those earlier concerns, it should do so explicitly as a downstream consequence rather than silently asking the same thing again with new wording.
When that happens, the UI should name the earlier step and question it is reopening so the user understands why the blocker came back.

### Phase framing copy

Use these descriptions wherever the app introduces a phase.

- `Brief`: Define the problem, audience, goals, and scope.
- `Core flows`: Define the primary flows, alternate paths, flow conditions, and failure or degraded paths.
- `PRD`: Define the user-visible behavior, rules, priorities, scope, compatibility promises, and failure behavior.
- `Tech spec`: Define how it should be built, integrated, operated, and validated for quality.
- `Validation`: Validate the draft ticket plan and resolve the last planning blockers before tickets are committed.
- `Tickets`: Break the work into ordered execution phases, keep those phases visible, and show the selected phase as a status-based ticket board with a labeled phase selector.
- `Runs`: Review delivery and verification for a ticket.

### Ticket page framing

The ticket page should feel like a guided task workspace, not a system console.

Rules:

- Keep a compact hybrid anchor at the top: project context plus a local execution strip.
- Use one dominant current-step card at a time.
- Keep the collapsed ticket brief human-first.
- Push raw implementation detail behind a secondary disclosure.

## Vocabulary

### Canonical user-facing terms

Use these terms consistently.

- `Project`
- `Brief`
- `PRD`
- `Core flows`
- `Tech spec`
- `Validation`
- `Ticket`
- `Run`
- `Review`
- `Brief intake`
- `Covered spec items`
- `Verification`
- `Needs review`
- `Up next`
- `Done`
- `Close ticket`

### Terms to avoid in default UI copy

Avoid these unless the context is explicitly technical or advanced.

- `Clarification` as a standalone page title
- `Locked`
- `Ready`
- `Stale`
- `Generate plan`
- `Capture results`
- `Run audit`
- `Operation superseded`
- `Context bundle`
- `Bundle manifest`
- `Export mode`

### Preferred replacements

- `Clarification` -> `Questions before the brief` or `Refine the brief`
- `Locked` -> `Not ready`
- `Ready` -> `Up next`
- `Stale` -> `Needs review`
- `Generate Brief` -> `Generate brief`
- `Generate PRD` -> `Generate PRD`
- `Generate Core Flows` -> `Generate core flows`
- `Generate Tech Spec` -> `Generate tech spec`
- `Validate plan` -> `Validate plan`
- `Generate Tickets` -> `Generate tickets`
- `Ticket coverage review` -> `Validation`
- `Regenerate` -> `Refresh`
- `Run Audit` -> `Review changes`
- `Capture Results` -> `Review changes` or `Verify work`
- `Create fix bundle` -> `Export fix bundle`
- `Context Bundle Contents` -> `Included files`

## Status language

### Planning phases

Internal planning statuses should map to this user-facing language.

| Internal state | User-facing label |
| -------------- | ----------------- |
| `locked`       | `Not ready`       |
| `ready`        | `Up next`         |
| `complete`     | `Done`            |
| `stale`        | `Needs review`    |

### Planning phase badges

Use short, human-readable badge labels.

- `Current`
- `Up next`
- `Done`
- `Needs review`
- `Not ready`

Do not expose raw workflow-state terms by default.

### Ticket and run statuses

Keep existing statuses where needed, but frame them around user meaning.

- `Backlog`: Not started
- `Ready`: Ready to work
- `In progress`: Work in progress
- `Verify`: Needs verification
- `Done`: Complete

For runs:

- `Pending`: Waiting for review or verification
- `Complete`: Run captured
- `Pass`: Meets requirements
- `Fail`: Needs fixes

## CTA hierarchy

### General rules

Every screen should have one clear primary action.

The primary action should answer:

- what the user is doing now
- what artifact or object it affects
- what happens next

### Button rules

- Use explicit verbs.
- Name the object when the action is high impact.
- Avoid generic labels like `Edit`, `View`, `Move`, and `Delete` without context.
- Avoid `Yes` and `No` for confirmations.
- In the project planning shell, use `Back` and `Continue` for stage-navigation buttons on review and handoff surfaces. The pipeline already provides the stage context, so repeating the destination in the button label adds noise.
- Keep explicit labels such as `Validate plan`, `Generate tickets`, `Open tickets`, `Refresh tickets`, or `Review validation` for Home, empty states, queue surfaces, and other contexts where the pipeline is not already visible.

### Planning shell stage navigation

- `Back`
- `Continue`

### Canonical planning CTAs

- `Back`
- `Continue`
- `Start brief intake`
- `Generate brief`
- `Generate core flows`
- `Generate PRD`
- `Generate tech spec`
- `Validate plan`
- `Generate tickets`
- `Open tickets`
- `Refresh tickets`
- `Review validation`
- `Open checkpoint`
- `Open first ticket`
- `Open ticket`

### Secondary planning CTAs

- `Review questions`
- `Edit answer`
- `Edit brief`
- `Summary`
- `Document`
- `Refresh brief`
- `Refresh brief intake`
- `Refresh PRD`
- `Refresh tech spec`
- `Refresh tickets`
- `Accept risk`
- `Get guidance`
- `Skip`

### Destructive CTAs

Use explicit object names.

- `Delete project`
- `Delete ticket`
- `Keep project`
- `Keep ticket`

## Autosave and persistence language

### Product rule

Users should not be asked to manage routine persistence in planning flows.

The default model is autosave.

### Allowed status copy

- `Saving...`
- `Saved`
- `Changes saved`
- `Saving failed. Try again.`

### Disallowed default patterns

Do not use these in the normal planning path:

- `Save Progress`
- `Save Answers`
- `Save Brief`
- `Save PRD`
- `Save Tech Spec`

Manual save actions are acceptable only in explicitly advanced or recovery contexts.

## Empty-state system

### Rules

Every empty state should include:

1. what this area is
2. why it is empty
3. the next useful action

Avoid empty states that only state absence.

### Canonical empty states

#### Home

- Title: `No work is in motion yet`
- Body: `Start planning for multi-step work, use a quick task for something small, or import an issue.`
- Primary action: `Start new project`
- Secondary action: `Quick task`

#### Project without a brief

- Title: `No brief yet`
- Body: `Start brief intake to lock the problem, goals, and scope before the first brief is generated.`
- Primary action: `Start brief intake`

#### Project without tickets

- Title: `No tickets yet`
- Body: `Validate the plan before tickets are created.`
- Primary action: `Validate plan`

#### No runs

- Title: `No runs yet`
- Body: `Runs appear after you export a ticket and review the work.`
- Primary action: `Open a ticket`

#### No specs

- Title: `No planning docs yet`
- Body: `Briefs, PRDs, and tech specs appear as you shape a project.`
- Primary action: `Open project`

## Transition messaging

### Goal

When a phase completes, the app should explicitly tell the user what changed and what to do next.

Waiting states need the same precision. During entry checks, follow-up checks, and artifact generation, the user should know which phase is active, what the system is doing, and what will happen next.

### Pattern

Use this structure:

- success label
- one-sentence summary
- next-step CTA

For in-progress planning states, use this structure:

- phase-specific action heading
- one-sentence explanation of why the work is happening now

Avoid generic copy such as `Preparing questions...`, `Generating...`, or `Stay here...` when the phase and next step are knowable.

### Canonical in-progress planning examples

#### Entry check

- Heading: `Preparing PRD questions...`
- Body: `Gathering the decisions needed before the first PRD draft.`

#### Follow-up check

- Heading: `Checking PRD questions...`
- Body: `Reviewing your answers before drafting the PRD.`

#### Artifact generation

- Heading: `Generating PRD...`
- Body: `Drafting the PRD from the decisions you confirmed.`

### Canonical examples

#### Brief complete

- Heading: `Brief ready`
- Body: `The brief now defines the problem, audience, goals, and scope.`
- Primary action: `Continue`

#### Core flows complete

- Heading: `Core flows ready`
- Body: `The primary journeys and states are ready for product requirements.`
- Primary action: `Continue`

#### PRD complete

- Heading: `PRD ready`
- Body: `The product requirements are ready for implementation planning.`
- Primary action: `Continue`

#### Tech spec complete

- Heading: `Tech spec ready`
- Body: `The implementation approach is ready for ticket validation.`
- Primary action: `Continue`

#### Validation complete

- Heading: `Validation`
- Status badge: `Passed`
- Body: `Validation is complete. The ticket plan is committed and ready in Tickets.`
- Primary action: `Continue`
- Secondary action: `Revise answers`

#### Tickets complete

- Heading: `Tickets ready`
- Body: `The ticket board is ready. Open the next ticket when you are ready to start work.`
- Primary action: `Open first ticket`

## Guidance and question copy

### Question framing

Questions should explain why they are being asked.

Preferred framing:

- `Step 2 of 4`
- `This answer shapes the brief.`
- `Choose the option that best fits this project.`

### Guidance CTA

Use:

- `Get guidance`

Avoid:

- `Help Me Choose`

### Defer CTA

Use:

- `Skip`

Avoid:

- `Skip for Now`

### Review CTA

Use:

- `Review questions`
- `Revise answers`
- `Previous question`

Avoid:

- `Back to questions`

## Ticket and run language

### Ticket page

The ticket page should read like an execution workflow, not an internal tool panel.

Preferred section names:

- `Preflight`
- `Execution timeline`
- `Covered spec items`
- `Acceptance criteria`
- `Implementation plan`
- `File targets`
- `Run history`

Avoid:

- `Context Bundle Contents`
- `Capture Results`
- `Verification Results` as the only framing

Resume behavior should treat the ticket as the primary execution object. If a project-backed ticket is the active work item, Home's resume actions should reopen that ticket. Project cards and sidebar shortcuts should stay stable object entry points that open the project shell instead. Run detail should reopen only when the user explicitly opens history.

### Run page

The run page should answer:

- what ticket this run belongs to
- whether the work passed review
- what changed
- what to do next

The run page should read like a report and history surface first. It should not behave like a second project navigator.
`Review changes` should open a guided review flow. Advanced compare controls and raw diff detail should stay behind secondary disclosure until the user explicitly asks for them.

Preferred action labels:

- `Open ticket`
- `Review changes`
- `Show changes`
- `Show drift`
- `Hide drift`

Avoid backend-state phrasing in the main message when a simpler user meaning exists.

## List-view language

### Home

The home view should be action-oriented, not just archival.

Preferred section names:

- `Up next`
- `Recent runs`
- `Projects`

Home queue items should use short status labels that point toward action, for example:

- `Review brief`
- `Generating tech spec`
- `Verify ticket`
- `Ready to run`

Project cards should read like stable entry points into the project shell rather than like a second resume queue.

### Aggregate pages

`All Tickets`, `All Runs`, and `All Specs` are acceptable as page titles, but they should include subcopy that explains how to use the page.

Examples:

- `All Tickets` -> `Track execution across projects and quick tasks.`
- `All Runs` -> `Review delivery and verification history.`
- `All Specs` -> `Browse planning documents across projects.`

## Tone and style rules

### Required

- sentence case
- active voice
- concise, front-loaded phrasing
- explicit action labels
- no blame

### Avoid

- dev-speak
- implementation jargon unless required
- generic button labels
- vague success and error messages
- keyboard shortcuts as the only path to act

## Implementation rules

### When product language and internal language differ

The UI should prefer product language.

Examples:

- store `stale`, display `Needs review`
- store `locked`, display `Not ready`
- store `complete`, display `Done`

### Consistency rule

If a term is introduced in one major screen, use the same term everywhere else unless there is a strong contextual reason not to.

The app should not rename the same concept from screen to screen.

## High-sensitivity surfaces

These screens carry the most product-language risk and should stay aligned first when the UI changes.

1. [initiative-view.tsx](/home/mason/Projects/SpecFlow/packages/client/src/app/views/initiative-view.tsx)
2. [planning-spec-section.tsx](/home/mason/Projects/SpecFlow/packages/client/src/app/views/initiative/planning-spec-section.tsx)
3. [initiative-creator.tsx](/home/mason/Projects/SpecFlow/packages/client/src/app/views/initiative-creator.tsx)
4. [overview-panel.tsx](/home/mason/Projects/SpecFlow/packages/client/src/app/views/overview-panel.tsx)
5. [ticket-view.tsx](/home/mason/Projects/SpecFlow/packages/client/src/app/views/ticket-view.tsx)
6. [run-view.tsx](/home/mason/Projects/SpecFlow/packages/client/src/app/views/run-view.tsx)

## Non-goals

This document does not define:

- visual design tokens
- layout structure
- information architecture
- backend workflow rules

Those should align with this spec, but they are not owned by it.
