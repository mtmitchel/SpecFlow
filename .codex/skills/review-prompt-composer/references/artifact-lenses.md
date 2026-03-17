# Artifact lenses

## How to use this file
- Choose one primary artifact type.
- Pull 4 to 7 questions from that primary lens.
- Add 1 to 3 cross-cutting questions only when the risk is real.
- Rewrite the questions into direct review criteria rather than pasting every bullet verbatim.

## Cross-cutting lenses

### Objective fit
- Is the artifact clear about what decision or action it is meant to support?
- Does it stay aligned to the stated problem, user need, or operational goal?
- Are success criteria or intended outcomes explicit enough to judge quality?

### Completeness and edge cases
- What critical states, scenarios, or exceptions are missing?
- Does the artifact cover failure paths, not just happy paths?
- Would an implementer or reviewer have to guess about important behavior?

### Sequencing and dependencies
- Are prerequisites, blockers, and downstream impacts explicit?
- Does the artifact assume work, data, approvals, or systems that are not named?
- Is the ordering realistic for execution or rollout?

### Validation and evidence
- Does the artifact explain how the idea will be validated or verified?
- Are claims grounded in evidence, examples, or measurable checks where needed?
- Could a reviewer tell when the work is done or acceptable?

### Operational risk
- Does the artifact address rollout, observability, migration, recovery, or support needs when relevant?
- Are there hidden reliability, security, or maintainability risks?
- Does it make irreversible or high-cost decisions without enough justification?

## Product brief or PRD
- Is the problem real, specific, and worth solving?
- Is the target user or workflow defined sharply enough to guide decisions?
- Does the scope distinguish must-haves, non-goals, and deferred ideas?
- Are key flows, states, and user outcomes concrete rather than aspirational?
- Are success measures meaningful and attributable to the proposed change?
- Does the brief make hidden product decisions without calling them out?
- Would design, engineering, and QA derive the same implementation from this document?

## Technical spec or architecture
- Are the core invariants, interfaces, and data flows explicit?
- Does the design explain why this approach is chosen over plausible alternatives?
- Are failure handling, retries, fallbacks, or error boundaries defined where they matter?
- Are performance, scale, consistency, or concurrency assumptions stated?
- Are migrations, backwards compatibility, and rollout constraints covered?
- Can the design be implemented without making undocumented decisions?
- Does the verification plan actually prove the important properties?

## Ticket or implementation plan
- Is the task small and coherent enough for one execution unit?
- Are acceptance criteria specific, testable, and behavior-oriented?
- Are dependencies, blockers, and handoffs explicit?
- Are edge cases, non-happy paths, or rollback expectations included when needed?
- Does the ticket say what to verify, not just what to build?
- Is the scope realistic for the intended assignee or milestone?
- Would two engineers implement the same thing from this ticket?

## UI or UX artifact
- Is the user task obvious from the screen, flow, or interaction description?
- Are the key states covered: loading, empty, error, success, and permissions where relevant?
- Does the interaction model reduce user confusion rather than add steps or ambiguity?
- Are hierarchy, labels, and calls to action aligned to the intended mental model?
- Are accessibility requirements implied or specified where they matter?
- Does the design create hidden implementation or content requirements?
- Would the artifact still make sense on smaller screens, slower networks, or partial data?

## Code change or pull request
- Does the change actually satisfy the intended behavior without regressions?
- Are the highest-risk paths, invariants, and side effects handled correctly?
- Does the diff introduce hidden coupling, dead code, or brittle abstractions?
- Are error handling, logging, and recovery behavior adequate?
- Are tests targeted at the real risk rather than only the easy paths?
- Does the change preserve compatibility, data integrity, and security expectations?
- Would a future maintainer understand why the code is shaped this way?

## Prompt or workflow instruction
- Is the task explicit about what to do and what not to do?
- Is the context sufficient, relevant, and free of contradictions?
- Are constraints, output format, and completion criteria precise?
- Does the prompt reduce hallucination risk by requiring grounding, uncertainty handling, or verification?
- Are ambiguous terms, overloaded concepts, or missing assumptions exposed?
- Does the prompt ask for the right depth, not just more verbosity?
- Will two strong models produce materially similar outputs from this prompt?
