# Artifact pack blueprint

Use this reference when deciding how much planning structure to create or when the user wants a default artifact shape.

## Choose the pack
### Minimal foundation
Use when the request is still a rough idea.
- Signals: one primary actor, one core workflow, few dependencies, major unknowns still open.
- Produce: `foundation summary`, `scope and boundaries`, `core flow`, `open questions`.

### Standard foundation
Use for most feature and initiative planning.
- Signals: multiple states or alternate paths, enough clarity to define rules, downstream specs or tickets are expected soon.
- Produce: `foundation summary`, `scope and boundaries`, `concept model`, `flow set`, `requirements and behavior rules`, `implementation direction`, `risks and open questions`.

### Expanded foundation
Use when complexity will otherwise leak into downstream work.
- Signals: multiple roles, permissions, migration or rollout concerns, integration boundaries, compliance or audit needs, many failure paths.
- Add: `state matrix`, `permissions map`, `dependency map`, `rollout assumptions`, `ticket-seeding guidance`.

## Use the default single-document structure
Prefer one document with these sections when the artifact pack can stay coherent in one place.

### Foundation summary
- Name the problem, user, objective, and success signal.
- Separate goals from non-goals.

### Scope and boundaries
- State included scenarios, excluded scenarios, constraints, and assumptions.
- Make explicit what this effort will not solve yet.

### Concept model
- Define canonical terms, actors, objects, and statuses.
- Note any lifecycle transitions or permissions that shape the flow.

### Flow set
- Write the primary flow first.
- Add only the alternate and failure paths that materially affect requirements or implementation.

### Requirements and behavior rules
- Convert each important step or state into explicit behavior.
- Capture validation, state transitions, feedback, integrations, and business rules.

### Implementation direction
- Suggest logical slices, dependencies, technical considerations, and migration or rollout notes.
- Keep this directional. Do not explode it into premature task lists unless the user asks.

### Risks and open questions
- Separate unresolved decisions from already-approved behavior.
- Highlight the questions most likely to block ticketing or implementation.

## Split the artifact set only when necessary
Break the work into separate artifacts only when they have different audiences or will evolve independently.

Use this split:
1. `foundation-brief`
2. `flow-spec`
3. `requirements-and-rules`
4. `implementation-direction`

Keep terminology and scope identical across all split artifacts.

## Check quality before handing off
- Confirm each requirement traces back to a scoped scenario or flow step.
- Confirm no term is overloaded across multiple concepts.
- Confirm open questions are visible and do not masquerade as decisions.
- Confirm the artifact pack is detailed enough for downstream work without becoming a document pile.
- Confirm the output makes the next planning step obvious.
