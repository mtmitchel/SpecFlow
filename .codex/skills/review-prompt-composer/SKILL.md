---
name: review-prompt-composer
description: Create reusable review prompts and evaluation criteria tailored to the artifact under review. Use when Codex needs to turn vague review requests such as "review this", "look this over", "pressure-test this", or "sanity-check this" into a structured review frame for briefs, PRDs, specs, tickets, prompts, UI flows, code changes, architecture docs, or similar artifacts. Diagnose the artifact type, pick the right questions, scale review depth to risk, and make the review criteria explicit before or while performing the review.
---

# Review prompt composer

## Mission
Turn weak review asks into disciplined review frames. Choose the questions that are most likely to expose real defects in the artifact, not generic commentary.

## Quick start
1. Identify what artifact is being reviewed, what decision it supports, and what kind of failure matters most.
2. Choose one primary review lens for the artifact type.
3. Add only the secondary lenses needed for the actual risks, stage, or stakeholder concerns.
4. Convert those lenses into a reusable prompt with explicit deliverables and prioritization.
5. If the user also asked for the review itself, use that prompt internally and expose the chosen criteria briefly.

## Choose the review mode

### Compose only
Use when the user wants a reusable prompt, checklist, rubric, or evaluation frame.

### Compose and apply
Use when the user wants the artifact reviewed now. Build the review frame first, then perform the review against it.

### Repair the ask
Use when the request is too vague to support a useful review. Infer the artifact type from the material when possible. Ask one narrow question only when the artifact or decision cannot be identified from context.

## Build the review frame

### 1) Define the review objective
Determine:
- what the artifact is supposed to enable
- who will act on it
- what kind of mistake would be most expensive
- whether the review is early exploration, implementation readiness, or release hardening

Do not review a spec like a brief, or a ticket like an architecture proposal. Match the questions to the decision the artifact is meant to support.

### 2) Choose the primary lens
Pick one dominant lens based on artifact type. Use `references/artifact-lenses.md` for the question bank.

Use one of these as the primary lens:
- product brief or PRD
- technical spec or architecture
- ticket or implementation plan
- UI or UX artifact
- code change or pull request
- prompt or workflow instruction

### 3) Add secondary lenses carefully
Add at most two secondary lenses when they materially affect review quality:
- feasibility and implementation risk
- dependency and sequencing risk
- validation and testability
- operational or rollout risk
- language clarity and ambiguity

Do not pile on every possible dimension. A strong review prompt is selective.

### 4) Scale depth to risk
Use this default calibration:
- `light pass`: quick sanity check, obvious gaps only
- `standard pass`: readiness review for normal work
- `hardening pass`: failure-oriented review for high-risk or near-final artifacts

Increase depth when the artifact controls rollout, irreversible decisions, external commitments, migrations, security boundaries, or cross-team dependencies.

## Compose the prompt
Use this base shape unless the user asks for a different format:

```text
Review objective: <what decision this review should support>
Artifact type: <brief, spec, ticket, prompt, UI flow, code change, etc.>
Stage: <early exploration | implementation ready | hardening>
Context:
- <key background and constraints>
- <known risks, dependencies, or non-goals>
Evaluate this artifact for:
- <primary criterion 1>
- <primary criterion 2>
- <primary criterion 3>
- <secondary criterion(s) only if material>
Prioritize findings that would:
- cause incorrect implementation
- hide a major product or technical risk
- create ambiguity, missing states, or unverifiable requirements
Deliver:
- findings ordered by severity
- concrete examples or quoted evidence from the artifact
- missing information that blocks a confident review
- specific rewrite or follow-up recommendations when useful
Ignore:
- style-only concerns unless they change meaning, safety, or execution quality
If information is missing:
- state the gap explicitly instead of guessing
```

## Prompt design rules
- Prefer questions that expose failure modes, not broad prompts like "give feedback."
- Make criteria observable. Ask whether something is clear, testable, sequenced, or evidenced, not whether it "feels good."
- Bias toward implementation consequences when the artifact will drive work.
- Separate core correctness issues from polish.
- State what the reviewer should ignore so the review does not drift.
- Require findings to be prioritized, not listed as an undifferentiated dump.
- Require evidence from the artifact when the review should be grounded.

## Default outputs

### When the user wants a prompt
Return:
- `Review frame`: artifact type, objective, and review depth
- `Evaluation criteria`: concise bullets or grouped lenses
- `Reusable prompt`: the main deliverable
- `Open questions`: only if missing context materially changes the review

### When the user wants the review performed
Return:
- `Review frame`: short statement of the criteria used
- the review itself, structured by severity or the user's preferred format
- the reusable prompt only when the user asks for it or when it adds clear reuse value

## Use the reference file
Read `references/artifact-lenses.md` when selecting criteria. Pull only the sections relevant to the artifact under review. If the artifact spans multiple categories, choose the dominant category and borrow a few secondary questions instead of merging whole checklists.

## Final check
- Confirm the prompt matches the artifact type and decision stage.
- Confirm the criteria focus on the highest-risk failure modes.
- Confirm the prompt demands prioritized, evidence-based findings.
- Confirm the scope is narrow enough to be actionable.
- Confirm the prompt can be reused on the same artifact class with minimal edits.
