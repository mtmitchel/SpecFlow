---
name: product-language-guardian
description: Keep product terminology, artifact wording, and concept framing consistent across briefs, flows, PRDs, specs, tickets, reviews, and user-facing copy. Use when Codex needs to audit naming, normalize labels, enforce a canonical vocabulary, prevent naming drift, resolve overlapping concepts, or rewrite product language so the system presents one clear mental model instead of conflicting terms.
---

# Product language guardian

## Mission
Keep the product speaking one consistent language across artifacts and interfaces. Detect terminology drift early, protect the intended mental model, and prevent wording that creates planning or implementation confusion.

## Quick start
1. Find the source of truth for product language before suggesting rewrites.
2. Build a small term map: approved terms, internal-only terms, discouraged terms, and aliases.
3. Audit the target brief, flow, PRD, spec, ticket, or review for naming drift and concept overlap.
4. Rewrite only where wording changes meaning, clarity, or consistency.
5. Return concrete findings, recommended replacements, and any unresolved concept decisions.

## Source-of-truth order
Use the strongest available source in this order:
1. Canonical language docs such as `product-language-spec`, `glossary`, vocabulary docs, naming docs, or copy standards.
2. Current product brief, workflow model, IA docs, or approved PRDs that define the intended mental model.
3. Existing UI copy and shipped labels when they are already consistent with the product model.
4. Code, schemas, API terms, and internal implementation language as context only.

If internal and user-facing terms differ, prefer product language for default UI and planning artifacts unless the user explicitly asks for technical language.

## Working modes
### Terminology audit
Use when reviewing existing docs, tickets, UI copy, or comments.
- Find inconsistent names for the same concept.
- Find one term being used for multiple concepts.
- Find vague labels that do not communicate user meaning.

### Rewrite and normalization
Use when the user wants wording corrected.
- Replace drifted terms with canonical terms.
- Normalize headings, labels, statuses, CTAs, and artifact names.
- Preserve intent while removing synonym churn.

### Concept-model review
Use when the problem is not just wording.
- Identify where naming reveals an unclear or competing mental model.
- Distinguish true concept collisions from harmless copy variation.
- Recommend one canonical framing when concepts overlap.

### Spec and ticket protection
Use when implementation artifacts may inherit bad language.
- Prevent ambiguous names from propagating into acceptance criteria and review comments.
- Keep requirements, states, and responsibilities aligned to the same concept model.
- Flag terms that will cause engineering or QA to misread scope.

## Workflow
### 1) Load the language system
- Search for product-language docs, glossaries, status vocabularies, CTA standards, and naming rules.
- If a repo has a canonical file such as `docs/product-language-spec.md`, treat it as authoritative until contradicted by the user.
- Extract the primary mental model, canonical artifact names, status names, and forbidden or discouraged terms.

### 2) Build the term map
- List the canonical term for each core concept.
- Record acceptable aliases only when the system intentionally supports them.
- Mark internal-only terms that should not leak into default product language.
- Note terms that look similar but represent different concepts and therefore must stay distinct.

### 3) Audit the target artifact
- Review titles, headings, body copy, status labels, button text, table labels, comments, and acceptance criteria.
- Flag four kinds of problems:
  - `drift`: different names for the same concept
  - `collision`: one name used for multiple concepts
  - `vagueness`: wording too weak or abstract to guide work
  - `leakage`: internal or technical terminology exposed as default product language

### 4) Rewrite with discipline
- Prefer exact replacements over broad rewrites when the concept is already correct.
- Do not introduce new terminology unless the current set cannot represent the product model cleanly.
- Do not use synonyms for variety when consistency matters more than tone.
- Keep object names, phase names, statuses, and CTA wording stable across all artifacts that refer to the same concept.

### 5) Resolve concept framing
- If two terms compete, choose the term that best matches user understanding, product promise, and workflow structure.
- If a term is vague because the concept is vague, say so explicitly instead of polishing the copy.
- If no canonical language exists, propose a minimal controlled vocabulary before rewriting the artifact broadly.

### 6) Produce implementation-safe guidance
- Explain which replacements are mandatory for consistency and which are optional copy improvements.
- Flag any rename that would affect navigation, documentation, tickets, test names, or code identifiers.
- End with the decisions that require alignment before more content gets written.

## Output requirements
Use this default structure unless the user asks for a different format.

- **Source of truth**: documents or signals used to determine canonical language.
- **Canonical term map**: concept, approved term, discouraged terms, and notes.
- **Findings**: ordered list of drift, collision, vagueness, and leakage issues.
- **Recommended rewrites**: exact wording changes for headings, labels, or passages.
- **Concept decisions**: places where the product model itself needs alignment.
- **Next steps**: what to update first to stop the drift from spreading.

## Decision rules
- Prefer one canonical term per concept.
- Allow internal implementation terms only where technical precision is necessary.
- Keep user-facing artifact names aligned with the workflow model.
- Treat status names, CTAs, and navigation labels as system language, not disposable microcopy.
- Escalate wording issues that imply product-structure confusion instead of fixing them silently.

## Review checklist
Before finalizing, confirm that the response:
- names the source of truth it relied on
- distinguishes wording issues from concept-model issues
- identifies the highest-risk terminology conflicts first
- recommends exact replacements instead of vague editorial advice
- preserves user-facing clarity while preventing technical leakage
- makes it obvious what should change across docs, tickets, and UI
