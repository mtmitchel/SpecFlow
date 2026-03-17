---
name: groundwork-artifact-designer
description: Transform rough product ideas, early feature requests, initiative briefs, and fragmented planning notes into coherent foundational artifacts that establish scope, flows, requirements, states, dependencies, and implementation direction before ticketing begins. Use when Codex needs to create or critique the groundwork documents that later specs, tickets, bundles, or execution plans will depend on, especially during early-phase planning, workflow definition, requirement shaping, or ambiguity reduction.
---

# Groundwork artifact designer

## Mission
Turn early-stage product ambiguity into a small, coherent planning foundation that downstream work can trust. Produce artifact packs that make scope, language, flows, requirements, and execution direction explicit before decomposition into tickets or code.

## Quick start
1. Identify what already exists: raw idea, partial brief, conflicting planning docs, or early tickets.
2. Choose the lightest artifact pack that can remove ambiguity without creating document sprawl. Use `references/artifact-pack-blueprint.md` when deciding the pack shape.
3. Normalize actors, objects, terms, and success criteria before expanding requirements.
4. Move in dependency order: framing, concept model, flows, requirements, implementation direction.
5. Separate decisions, assumptions, risks, and open questions. Do not let them blur together.

## Working modes
### Design mode
Use when the user needs new groundwork artifacts from rough or partial inputs.
- Build the smallest coherent artifact pack that makes downstream planning safe.
- Prefer consolidation over generating multiple overlapping documents.

### Critique mode
Use when the user already has groundwork artifacts and wants them reviewed or pressure-tested.
- Evaluate whether scope, concept model, flows, requirements, and execution direction are complete enough for downstream planning.
- Flag contradictions, missing states, overloaded terms, and unresolved decisions before suggesting rewrites.

## Choose the artifact pack
### Minimal foundation
Use when the request is a raw idea or early opportunity.
- Create: problem statement, target user, goals, non-goals, core flow, key unknowns.
- Stop when later work can confidently begin spec or ticket planning.

### Standard foundation
Use when the team needs a durable base for spec and ticket creation.
- Create: foundation brief, canonical terminology, actor and object model, primary and alternate flows, requirements, edge cases, implementation direction.
- Prefer this pack unless the user clearly needs less or more.

### Expanded foundation
Use when the problem space is complex, cross-functional, or risky.
- Add: state matrix, permissions, dependency map, rollout assumptions, instrumentation or success measures, ticket-seeding guidance.
- Expand only when the added detail materially reduces downstream confusion.

## Build the artifacts in order
### 1. Frame the initiative
- Define the user problem, business outcome, target audience, trigger, context, and constraints.
- State what is known, assumed, excluded, and still missing.
- Keep the scope proportional to the problem.

### 2. Normalize the concept model
- Choose one canonical term for each core concept.
- Define actors, objects, statuses, and lifecycle transitions.
- Remove conflicting names before writing detailed requirements.

### 3. Map the critical flows
- Write the primary journey from entry to successful outcome.
- Add alternate, failure, first-time, admin, or recovery paths only when they matter.
- Make handoffs, permissions, confirmations, and irreversible moments explicit.

### 4. Specify requirements and rules
- Translate the flow into concrete behavior, validation, state changes, data dependencies, and system responses.
- Cover empty, loading, error, success, permission, and edge states where relevant.
- Distinguish user-facing requirements from implementation notes.

### 5. Define execution direction
- Recommend the simplest coherent slice sequence for implementation.
- Call out dependencies, technical constraints, migration concerns, and areas that need research.
- Seed later ticketing with clear boundaries, not premature task breakdowns.

### 6. Package the final artifact set
- Collapse duplicates and contradictions into one canonical set of planning artifacts.
- Use section headers that a downstream PM, designer, or engineer can scan quickly.
- End with explicit decisions, open questions, and next planning actions.

## Protect artifact quality
- Prefer one well-structured artifact pack over several overlapping docs.
- Prefer explicit assumptions over silent inference.
- Prefer concrete behavioral rules over vague intent language.
- Prefer canonical terms over stylistic synonyms.
- Refuse to hide unresolved product decisions inside vague requirements.
- Do not jump to tickets until the concept model, scope, and critical flows are stable.

## Output requirements
Match the output to the selected pack unless the user asks for a different format or the repo has an established artifact template.

- `Minimal foundation`: `Foundation summary`, `Scope and boundaries`, `Flow set`, `Risks and open questions`, `Next artifact steps`.
- `Standard foundation`: `Foundation summary`, `Scope and boundaries`, `Concept model`, `Flow set`, `Requirements and behavior rules`, `Implementation direction`, `Risks and open questions`, `Next artifact steps`.
- `Expanded foundation`: use the standard foundation and add `State matrix`, `Permissions map`, `Dependency map`, `Rollout assumptions`, and `Ticket-seeding guidance` only where they materially reduce downstream ambiguity.
- `Critique mode`: `Current pack assessment`, `Findings`, `Recommended revisions`, `Open questions`, `Next artifact steps`.

## Review before finalizing
- Confirm every major concept has one name.
- Confirm the scope excludes as much as it includes.
- Confirm the main flow is complete enough for a downstream spec.
- Confirm critical states and failure paths are not missing.
- Confirm requirements describe behavior, not just aspirations.
- Confirm open questions are visible and cannot be mistaken for decisions.
- Confirm the artifact pack is small enough to stay maintainable.
