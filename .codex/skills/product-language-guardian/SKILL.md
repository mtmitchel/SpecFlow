---
name: product-language-guardian
description: Keep SpecFlow terminology, workflow wording, artifact labels, and concept framing consistent across docs, UI copy, tickets, specs, and planning prompts. Use when Codex needs to audit naming drift, normalize user-facing language, protect the canonical mental model, or rewrite overlapping terms so the app presents one clear workflow instead of conflicting vocabularies.
---

# Product language guardian

## Mission
Keep SpecFlow speaking one coherent language across workflow docs, planning prompts, UI copy, and implementation artifacts.

## Start here
1. Load the canonical language docs before suggesting rewrites.
2. Build a small term map: approved terms, internal-only terms, discouraged terms, and concept pairs that must stay distinct.
3. Audit the target artifact for wording drift, concept collisions, leakage of technical language, or domain bias.
4. Rewrite only where the wording changes meaning, clarity, or consistency.
5. Return exact replacements plus any deeper concept-model conflicts that wording alone cannot solve.

## Source-of-truth order
1. `docs/product-language-spec.md`
2. `docs/workflows.md`
3. `packages/app/src/planner/brief-consultation.ts` when the question is about Brief intake wording
4. Existing shipped UI copy when it already matches the documented model
5. Code, schemas, and internal implementation language as context only

## Protect these distinctions
- `guided planning workspace` is the dominant mental model. Do not drift toward `intake questionnaire`, `document archive`, or `agent control panel`.
- Keep the Brief intake decisions distinct: primary problem, primary user, success qualities, and hard boundaries.
- Keep Brief intake language domain-neutral. The first questions must work for greenfield products, integrations, reliability fixes, compliance work, and existing-system changes.
- Keep `Coverage check`, `Verify work`, `Runs`, `Needs review`, and artifact names aligned with the product-language spec.
- Use internal terms only where technical precision is necessary. Do not leak planner or storage vocabulary into default product copy.

## Review modes
### Terminology audit
- Find different names for the same concept.
- Find one term being used for multiple concepts.
- Find vague labels that do not communicate user meaning.

### Rewrite and normalization
- Replace drifted terms with canonical ones.
- Normalize headings, labels, status copy, CTAs, and artifact names.
- Preserve intent while removing synonym churn.

### Concept-model review
- Identify where wording reveals a deeper workflow or mental-model conflict.
- Escalate concept collisions instead of papering over them with softer copy.

## Output
- `Source of truth`
- `Canonical term map`
- `Findings`
- `Recommended rewrites`
- `Concept decisions`
- `Next steps`
