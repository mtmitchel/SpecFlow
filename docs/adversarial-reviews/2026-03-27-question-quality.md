# Adversarial analysis of refinement question and option quality in SpecFlow

Repository analyzed: entity["people","mtmitchel","github username"]/SpecFlow on entity["company","GitHub","code hosting platform"]. fileciteturn2file0L1-L1

SpecFlow’s refinement questions are generated via a “phase check” LLM job per artifact step (brief, core-flows, prd, tech-spec). The orchestrator (`runPhaseCheckJob`) builds a phase-check payload containing the project description, prior artifact markdown, saved refinement context (answers + assumptions), and refinement history, then executes the step-specific check job and persists the returned questions + assumptions into the initiative workflow. fileciteturn2file0L1-L1 fileciteturn11file0L1-L1

Prompt construction happens in `buildPlannerPrompt` → `buildCheckPrompt`. This is where the JSON output contract for questions is defined and where most “quality rules” live (question budgets, anti-redundancy instructions, option count guidance, “no Other in options,” etc.). fileciteturn3file0L1-L1

Validation is enforced in a retry loop: each phase-check output is canonicalized, validated, and (on failure) retried up to 3 times with the validation error injected back into the next prompt as `validationFeedback`. fileciteturn14file0L1-L1 fileciteturn5file0L1-L1

Rendered UX comes from the client’s refinement components: `RefinementSection` shows questions (list mode or one-at-a-time “deck” mode), and `RefinementField`/`SelectChoiceCards` render options, help text, and the “Recommended” badge from `recommendedOption`. fileciteturn23file0L1-L1 fileciteturn18file0L1-L1

Answers flow back through `saveInitiativeRefinement` (server) and are later consumed by spec generation via `buildSpecGenerationInput` (which includes `savedContext`, `refinementHistory`, and an `assumptions` array derived from base assumptions + defaulted-question assumptions). fileciteturn21file0L1-L1 fileciteturn11file0L1-L1 fileciteturn12file0L1-L1

## Redundancy

**Finding: redundancy is discouraged in the prompt, but a key redundancy class is not enforceable by the current validator (options in one question that “answer” another question).**

- **Where it lives (code path)**
  Prompt: `packages/app/src/planner/prompt-builder.ts` adds an explicit instruction to drop questions where a select option would automatically answer another question in the same set. fileciteturn3file0L1-L1
  Validation: `packages/app/src/planner/internal/phase-check-question-validator.ts` validates structure and rejects duplicates primarily through `isDuplicateConcern`, which does not check cross-question “option-entails-question” redundancy. fileciteturn5file0L1-L1 fileciteturn6file0L1-L1

- **Concrete scenario (how it manifests)**
  Core flows check returns these in one batch:
  - Q1 (select): “Where should the app open on launch?” options include “Open to the last note”.
  - Q2 (boolean): “Should the app remember the last note you were editing?”
  This violates the prompt’s own “drop redundant questions” example logic, but it can pass validation because:
  - Q1 has options; Q2 is boolean with no options (so the duplicate check’s “identical options/both optionless” path won’t fire). fileciteturn5file0L1-L1
  - Their labels can be semantically redundant while having low token overlap (the duplicate heuristic is token-based and conservative). fileciteturn6file0L1-L1

- **Gap type**
  **Validation gap** (the prompt explicitly asks the model to remove this redundancy class, but the validator has no corresponding check) plus a **structural gap** (batch generation can’t condition later questions on earlier answers; it must anticipate entailments). fileciteturn3file0L1-L1 fileciteturn5file0L1-L1

- **Minimal fix (root cause, no new systems)**
  Add a lightweight, purely heuristic validator pass inside `validateQuestions` to catch “option-entails-question” redundancy within the same `questions` array:
  - For each pair (Qi, Qj), build normalized token sets for each **select/multi-select option text** in Qi and compare against Qj’s label (and optionally whyThisBlocks).
  - If ≥1 option phrase from Qi appears as a contained phrase in Qj’s label, reject Qj as redundant unless Qj explicitly `reopensQuestionIds` Qi and `materiallyNarrowsDecisionBoundary` holds.
  This stays inside the existing validation system and mirrors the prompt’s explicit rule. fileciteturn3file0L1-L1 fileciteturn5file0L1-L1

**Finding: duplicate detection is intentionally conservative and can miss paraphrases (even when redundancy is real).**

- **Where it lives (code path)**
  Duplicate detection is largely implemented in `refinement-question-comparison.ts` as `isDuplicateConcern`, and used during validation in `phase-check-question-validator.ts`. It relies on decision-type “family” matching plus label token overlap thresholds and (in some cases) identical options. fileciteturn6file0L1-L1 fileciteturn5file0L1-L1 fileciteturn13file0L1-L1

- **Concrete scenario (how it manifests)**
  In the same step, two questions can be paraphrases that won’t hit the current thresholds:
  - Q1: “Should the app reopen in the last view the user picked?”
  - Q2: “Should the app remember which view you were in?”
  Even though these are near-duplicates in meaning, token overlap can be <0.8 and the options structure can differ, so `isDuplicateConcern` can return false. fileciteturn6file0L1-L1

- **Gap type**
  **Validation gap** (heuristics are too strict for the failure mode you care about: overlapping design decisions phrased differently). fileciteturn6file0L1-L1

- **Minimal fix (root cause, no new systems)**
  Tighten redundancy rejection within a single phase-check batch by switching same-step duplicate detection from `isDuplicateConcern` to the broader `isSemanticallyRepeatedConcern` (which already includes additional reopen-reference logic) when comparing to `seenQuestions`. This is a one-line behavioral shift in `phase-check-question-validator.ts` and leverages already-present code paths rather than inventing new infrastructure. fileciteturn5file0L1-L1

## Option quality

**Finding: options are validated for formatting and completeness, but not for semantic distinctness, so “different-looking but equivalent” options are allowed.**

- **Where it lives (code path)**
  The validator ensures:
  - non-blank options,
  - case-insensitive uniqueness,
  - no literal “Other” in options,
  - and complete `optionHelp` coverage. fileciteturn5file0L1-L1
  There is no check for near-duplicate/overlapping meaning options (e.g., “Sync later” vs “Add sync later”). fileciteturn5file0L1-L1

- **Concrete scenario (how it manifests)**
  PRD check asks: “What offline behavior should v1 promise?” with options:
  - “Work offline with local drafts”
  - “Support offline drafting”
  - “Drafts available without network”
  All three are basically the same commitment; the survey collects minimal signal despite “multiple choice.” This will pass current validation because these are distinct strings with different casing/word order. fileciteturn5file0L1-L1 fileciteturn18file0L1-L1

- **Gap type**
  **Validation gap** (structure-only validation leaves your “options too similar” failure mode unchecked). fileciteturn5file0L1-L1

- **Minimal fix (root cause, no new systems)**
  Add an option-pair similarity check in `phase-check-question-validator.ts`:
  - Normalize each option by lowercasing and stripping punctuation (you already do something similar for labels). fileciteturn5file0L1-L1
  - Reject when (A contains B) or when token overlap ratio exceeds a threshold (e.g., ≥0.8), especially for options with ≥2 tokens (you already have an “isComparableOptionPhrase” helper for label restatement checking). fileciteturn5file0L1-L1
  This is minimal, deterministic, and directly addresses “too similar options.”

**Finding: the prompt encourages a recommended option, but there is no guardrail to prevent “Recommended” from being applied as a generic default, and the UI can silently drop it for multi-select.**

- **Where it lives (code path)**
  Prompt: “Include a recommendedOption when one choice is clearly best.” fileciteturn3file0L1-L1
  Validation: only checks that `recommendedOption` (if present) matches a provided option; it does not require any justification or “project-specificity.” fileciteturn5file0L1-L1
  Rendering: the “Recommended” badge is shown for select options (by comparing `question.recommendedOption === option`), but multi-select rendering does not display the badge at all. fileciteturn18file0L1-L1

- **Concrete scenario (how it manifests)**
  A question about “publishing scope” might get `recommendedOption: "Keep it internal"` purely because it’s a common default, not because the description implies it. The UI marks it “Recommended,” pushing users toward an unearned decision. For a multi-select, the model could supply a recommended option but the UI never shows it, so the “recommendation” has zero user-visible effect. fileciteturn3file0L1-L1 fileciteturn18file0L1-L1

- **Gap type**
  **Prompt gap** (no instruction to *withhold* recommendations unless grounded in user-provided context) plus **rendering fidelity gap** (multi-select drops the field). fileciteturn3file0L1-L1 fileciteturn18file0L1-L1

- **Minimal fix (root cause, no new systems)**
  - Prompt change: require `recommendedOption` be `null` unless the recommendation is directly supported by the project description or saved refinement context. (This is compatible with the existing output contract.) fileciteturn3file0L1-L1
  - UI change: either display the badge for multi-select too, or explicitly ignore the field for multi-select (and add a validator rule that disallows `recommendedOption` when `type === "multi-select"` to prevent silent drop). fileciteturn18file0L1-L1 fileciteturn5file0L1-L1

**Finding: your UI adds a custom “Other” escape hatch even when the LLM is instructed to avoid it and even when `allowCustomAnswer` is false. This makes “option quality” easier to evade and reduces structured signal extraction.**

- **Where it lives (code path)**
  Prompt rule for the model: do not include “Other” in options; set `allowCustomAnswer` only when needed. fileciteturn3file0L1-L1
  UI: for **select** questions, `SelectChoiceCards` always renders an “Other” button and a textarea when selected; it does not check `question.allowCustomAnswer`. fileciteturn18file0L1-L1
  UI: for **multi-select**, it always renders an “Other” checkbox and textarea, again without checking `allowCustomAnswer`. fileciteturn18file0L1-L1

- **Concrete scenario (how it manifests)**
  The LLM returns a well-shaped select question with 4 distinct options and intends a finite, comparable decision. The user clicks “Other” (always present), types nothing (or types a non-comparable answer), and the workflow proceeds with a low-signal response that’s hard to incorporate downstream. fileciteturn18file0L1-L1

- **Gap type**
  **Structural/UI gap**: even perfect LLM option sets don’t reliably yield structured answers because the UI offers a bypass regardless of the model’s intent. fileciteturn18file0L1-L1

- **Minimal fix (root cause, no new systems)**
  Respect `allowCustomAnswer` for select and multi-select in `refinement-fields.tsx`: only render “Other” when it’s true. Keep the prompt rule “do not include Other in options” (it’s still useful because you want “Other” to be UI-generated, not model-generated). fileciteturn3file0L1-L1 fileciteturn18file0L1-L1

## Question sequencing

**Finding: the system is iterative across phase-check runs, but not iterative within a single batch of questions, so later questions cannot truly “account for” earlier answers unless the model anticipates them during initial generation.**

- **Where it lives (code path)**
  - Phase-check input includes `savedContext` and `refinementHistory`, built from stored answers/assumptions up to the current step. fileciteturn11file0L1-L1
  - The check prompt serializes and includes that context (“Saved refinement context” + “Refinement history”) when present. fileciteturn3file0L1-L1
  - But each phase check returns a full `questions` array in one response, and the UI displays that fixed set (either list or deck UI) without re-running the check after each answer. fileciteturn14file0L1-L1 fileciteturn23file0L1-L1

- **Concrete scenario (how it manifests)**
  In a deck-style intake, the user answers Q1 with “Open to a blank editor.” Q3 still asks “Should we remember the last view?” because Q3 was generated before any answers were known. This only gets corrected if you run another phase check after capturing Q1 (which the current UI flow does not do mid-survey). fileciteturn23file0L1-L1 fileciteturn2file0L1-L1

- **Gap type**
  **Structural gap**: batch question generation cannot condition question N on answer to question 1 unless you introduce mid-survey regeneration. The prompt’s internal “drop redundancy” instruction can reduce this, but it can’t fully guarantee relevance because the actual answer is unknown at generation time. fileciteturn3file0L1-L1

- **Minimal fix (root cause, no new systems)**
  There are two minimal-but-real options, depending on how hard you want to lean into sequencing:
  1. **Prompt-side minimization**: add a rule that discourages conditional follow-up questions unless they are unavoidable, and instead encourages *bundling the decision into one question* with options that span the likely branches. This reduces “Q3 depends on Q1” situations without changing architecture. fileciteturn3file0L1-L1
  2. **Controlled mid-survey regeneration**: after each answered question in deck mode, re-run the phase check and replace the remaining question set (preserving answered questions in history). This uses your existing phase-check call path and existing `savedContext/refinementHistory` mechanism; it’s an orchestration change rather than a new subsystem. fileciteturn11file0L1-L1 fileciteturn2file0L1-L1

## Question count and depth

**Finding: question count is bounded per step, but there is no explicit quality policy that steers away from many shallow boolean questions when fewer deeper select questions would extract more signal.**

- **Where it lives (code path)**
  - Per-step question budgets are specified in `refinement-check-policy.ts` (e.g., maxQuestions = 4 for brief/core-flows/prd, 5 for tech-spec) and enforced during validation. fileciteturn8file0L1-L1 fileciteturn5file0L1-L1
  - The prompt enforces “select/multi-select/boolean only” and gives soft option-count guidance (“prefer 2 to 5 options”). fileciteturn3file0L1-L1
  - The validator enforces maxQuestions but does not enforce option count ranges or boolean-count limits; it only enforces structural rules (e.g., boolean questions must not include options, and must be grammatically yes/no). fileciteturn5file0L1-L1

- **Concrete scenario (how it manifests)**
  PRD check can legally return four boolean questions like:
  - “Should v1 support offline?”
  - “Should v1 support export?”
  - “Should v1 support multiple workspaces?”
  - “Should v1 have roles?”
  This stays within maxQuestions and passes boolean label validation, but it’s shallow: the “yes” answers don’t define boundaries or tradeoffs the way a well-shaped select question would (e.g., offline read-only vs offline edits vs offline-first conflict resolution). fileciteturn5file0L1-L1 fileciteturn8file0L1-L1

- **Gap type**
  **Prompt + validation gap**: you hint at depth (“highest-leverage blocker questions,” “prefer 2–5 options”) but do not enforce it, even for “starter” consultations where depth is especially valuable. fileciteturn3file0L1-L1 fileciteturn5file0L1-L1

- **Minimal fix (root cause, no new systems)**
  Add a small policy constraint for each step (or at least for required starter sets):
  - Example enforcement: “starter questions may not be boolean,” or “at least N of the questions must be select/multi-select.” Implement this as a validator rule when `requiredStarterQuestionCount > 0`, since that case is already explicitly recognized and enforced (count and decision-type group requirements). fileciteturn5file0L1-L1 fileciteturn8file0L1-L1
  This keeps the system simple while directly targeting “shallow yes/no sprawl.”

**Finding: the first Brief consultation behavior in code is optimized for minimal questioning (extract + assume), which can under-sample decisions compared to the workflow doc that describes a required four-question intake.**

- **Where it lives (code path)**
  - The check prompt contains explicit “extract, not interrogate” rules for `requiresInitialConsultation` and even states that “proceed with four assumptions and an empty questions array” is expected for well-written descriptions. fileciteturn3file0L1-L1
  - The user-facing workflow doc describes “a required four-question consultation before the first brief can be generated.” fileciteturn10file0L1-L1
  - Functionally, assumptions returned by a phase check are persisted as `baseAssumptions` and can satisfy the “initial consultation required” gate even with zero questions asked. fileciteturn2file0L1-L1 fileciteturn12file0L1-L1 fileciteturn21file0L1-L1

- **Concrete scenario (how it manifests)**
  A user enters a vague description (“Build a notes app for me”). The model may infer all four brief decisions and proceed with assumptions, resulting in a brief that feels “confident but wrong,” because the user never explicitly chose key framing. fileciteturn3file0L1-L1 fileciteturn12file0L1-L1

- **Gap type**
  **Prompt gap** relative to your stated UX goal of reliably extracting necessary info (you bias toward inference and assumptions over explicit decisions). fileciteturn3file0L1-L1

- **Minimal fix (root cause, no new systems)**
  Tighten the “extract vs ask” rule so “proceed with assumptions” is allowed only when the description contains *explicit signals* for the four required brief decisions. If a decision is missing, require at least one targeted question (still within maxQuestions=4). This remains a prompt-only change and doesn’t require new code paths. fileciteturn3file0L1-L1 fileciteturn8file0L1-L1

## Answer utilization

**Finding: answers are preserved and passed forward largely verbatim, but spec generation is not explicitly constrained to treat them as “hard requirements,” so a well-answered intake can still be ignored or contradicted by the generator.**

- **Where it lives (code path)**
  - Server stores answers and defaulted question IDs into `workflow.refinements[step]`. fileciteturn21file0L1-L1
  - `getSavedContext` exports answers and assumptions into a simple key/value map, and `getRefinementHistory` exports a structured array including question label, decisionType, resolution, answer, and default-assumption when defaulted. fileciteturn11file0L1-L1
  - Spec generation input includes `savedContext`, `refinementHistory`, and an `assumptions` list derived from stored base assumptions plus assumptionIfUnanswered for defaulted questions. fileciteturn11file0L1-L1 fileciteturn12file0L1-L1
  - Generation prompts include `Assumptions:` plus the artifact sections (project description, saved context, refinement history, prior specs). There is no explicit instruction that these are binding constraints that must not be contradicted. fileciteturn3file0L1-L1

- **Concrete scenario (how it manifests)**
  User answers: “Single-user only” and “Offline required.” The PRD generator could still draft “team workspaces” or “cloud-first sync” because it treats context as descriptive rather than mandatory, especially if the markdown from earlier artifacts contains contradictory hints or the model hallucinates common features. Nothing in validation checks PRD text against the refinement answers. fileciteturn3file0L1-L1

- **Gap type**
  **Prompt gap** (answers are present but not elevated to “must follow” constraints) plus an implicit **structural gap** (no downstream deterministic checker ties artifact content back to answers). fileciteturn3file0L1-L1

- **Minimal fix (root cause, no new systems)**
  Add a short, explicit rule to generation prompts (brief-gen/core-flows-gen/prd-gen/tech-spec-gen):
  - “Treat refinement answers, default assumptions, and saved refinement context as hard constraints. Do not contradict them; if they conflict, call it out as an assumption and keep the spec consistent with the answers.”
  This is a prompt-only change that directly targets “ignored/contradicted answers.” fileciteturn3file0L1-L1

**Finding: the “Other” sentinel can be stored as if it were a real answer, which pollutes downstream context and can produce contradictory or low-signal briefs/specs.**

- **Where it lives (code path)**
  - UI uses `CUSTOM_ANSWER_SENTINEL = "Other"` and can store `"Other"` as the answer when the user selects “Other” but doesn’t enter custom text. fileciteturn18file0L1-L1
  - Client-side “is answered?” logic treats any non-empty string—including `"Other"`—as answered, so the question is marked resolved and default assumptions are not used. fileciteturn46file0L1-L1
  - Server-side history/assumption derivation treats any non-empty string as answered as well (so `"Other"` is “answered,” not “unanswered/defaulted”). fileciteturn11file0L1-L1

- **Concrete scenario (how it manifests)**
  User selects “Other” to come back later, writes nothing, then proceeds. The system passes `"Other"` into `savedContext` and `refinementHistory` as if it were a meaningful decision. The generator now sees an “answer” that provides no constraint, and can fill the gap with its own assumptions—exactly the kind of “confident but wrong” behavior you want to avoid. fileciteturn18file0L1-L1 fileciteturn11file0L1-L1

- **Gap type**
  **Structural/UI gap** (the representation conflates “custom answer mode selected” with “custom answer provided”). fileciteturn18file0L1-L1

- **Minimal fix (root cause, no new systems)**
  Treat the sentinel value `"Other"` as **unanswered** unless accompanied by a real custom string:
  - Client: change `isQuestionAnswered` so `value === "Other"` is not considered answered (for string answers and array answers). fileciteturn46file0L1-L1
  - Server: when building refinement history entries, treat `"Other"` the same way (so resolution becomes “unanswered” unless custom text is present). fileciteturn11file0L1-L1
  This keeps the current schema but prevents “Other” from masquerading as a decision.

## Follow-up question quality

**Finding: validation-stage follow-ups are somewhat aware of prior Q&A and include loop guards, but they can still re-ask if semantic matching fails or if “materially narrowing” is too permissive.**

- **Where it lives (code path)**
  - Validation reruns phase checks with `validationFeedback` and tracks which questions were submitted in the current validation draft. It filters “looped” questions using semantic repeat detection and “materially narrows decision boundary.” fileciteturn9file0L1-L1
  - The loop suppression behavior is tested: paraphrased re-asks can be suppressed, and genuinely narrower follow-ups can remain. fileciteturn48file0L1-L1
  - Semantic matching relies on token-overlap heuristics in `refinement-question-comparison.ts`. fileciteturn6file0L1-L1

- **Concrete scenario (how it manifests)**
  During validation, the LLM might re-ask a prior decision with changed wording and slightly altered options. If token overlap drops below the thresholds, `isSemanticallyRepeatedConcern` may not match, and the question won’t be filtered. Alternatively, it *does* match, but it’s kept anyway because the “material narrowing” check treats any options change as narrowing—even if options are just rephrased. fileciteturn6file0L1-L1 fileciteturn9file0L1-L1

- **Gap type**
  **Validation gap** (semantic equivalence is hard, and the current heuristics are intentionally limited; “narrowing” is permissive). fileciteturn6file0L1-L1

- **Minimal fix (root cause, no new systems)**
  Tighten `materiallyNarrowsDecisionBoundary`:
  - Don’t treat “options differ” as automatically narrowing. Instead, require evidence of narrowing such as:
    - new options are a strict subset (reduces breadth), or
    - label adds ≥2 meaningful new tokens *and* whyThisBlocks adds ≥3 meaningful new tokens (you already do token-delta logic; just don’t short-circuit on option differences). fileciteturn6file0L1-L1
  This reduces “rephrased re-ask” loops without removing the ability to ask genuine narrower follow-ups (like the debug-build exception case already in tests). fileciteturn33file0L1-L1 fileciteturn48file0L1-L1

**Finding: cross-stage “reopen” correctness is enforced when the system recognizes the repeat, but repeats that the heuristic fails to recognize can still be re-asked without `reopensQuestionIds`.**

- **Where it lives (code path)**
  - When a new question is recognized as repeating an earlier concern, validators require `reopensQuestionIds` and reject unrelated reopen references. fileciteturn5file0L1-L1
  - Tests demonstrate this behavior for cross-stage duplicates and reopen references. fileciteturn34file0L1-L1

- **Concrete scenario (how it manifests)**
  If a prior concern was “Which existing system must v1 integrate with?” and a follow-up is phrased as “Which system is the source of truth we must sync from?”, token overlap might be too low to be detected as a repeat. The validator won’t demand `reopensQuestionIds`, so the user experiences it as a brand-new question (even though it’s functionally revisiting the same decision). fileciteturn6file0L1-L1 fileciteturn5file0L1-L1

- **Gap type**
  **Validation gap** (heuristic repeat detection is the gating factor). fileciteturn6file0L1-L1

- **Minimal fix (root cause, no new systems)**
  Expand the text used for semantic matching to include `whyThisBlocks` (and optionally optionHelp) when building comparison tokens for repeat detection. This increases recall for “same concern, different label” without requiring embeddings or external services. fileciteturn5file0L1-L1 fileciteturn6file0L1-L1

## Option rendering fidelity

**Finding: the data contract between LLM output and UI is only partially honored (custom answers and recommended rendering), which can directly degrade survey quality even when generation/validation are correct.**

- **Where it lives (code path)**
  - Prompt and validator treat `allowCustomAnswer` and “no ‘Other’ in options” as meaningful constraints. fileciteturn3file0L1-L1 fileciteturn5file0L1-L1
  - UI ignores `allowCustomAnswer` for select and multi-select, always adding “Other.” fileciteturn18file0L1-L1
  - UI displays “Recommended” only for select, not for multi-select. fileciteturn18file0L1-L1

- **Concrete scenario (how it manifests)**
  The LLM intends “finite select decision with no custom answer,” but the UI offers “Other” anyway. Users choose “Other” as a bypass, and the system records it as answered. For multi-select, the LLM’s recommended choice is silently ignored in UI, so the option guidance never reaches the user. fileciteturn18file0L1-L1 fileciteturn46file0L1-L1

- **Gap type**
  **Structural/UI gap**. fileciteturn18file0L1-L1

- **Minimal fix (root cause, no new systems)**
  - Respect `allowCustomAnswer` for select/multi-select rendering (only show “Other” when true). fileciteturn18file0L1-L1
  - Either render `recommendedOption` for multi-select, or forbid it at validation time for multi-select to prevent silent drop. fileciteturn5file0L1-L1 fileciteturn18file0L1-L1

**Finding: the validator does not explicitly validate `question.id` presence/type/uniqueness, which can produce confusing UI or broken answer binding from malformed (but otherwise valid-looking) LLM output.**

- **Where it lives (code path)**
  - `InitiativePlanningQuestion` requires `id: string` at the type level. fileciteturn32file0L1-L1
  - The runtime validator checks many fields but does not have a dedicated “id must be a non-empty string” check, and its duplicate logic can theoretically miss collisions when other heuristics don’t match (especially if decisionType family mismatches). fileciteturn5file0L1-L1 fileciteturn6file0L1-L1
  - UI uses `question.id` as a React key and uses it to index into `answers[question.id]`, so missing/duplicate ids are high-impact. fileciteturn23file0L1-L1

- **Concrete scenario (how it manifests)**
  If the model returns a question with `id: ""` (or omits it), the UI can:
  - render unstable lists,
  - overwrite answers for multiple questions bound to the same key,
  - and corrupt refinement history tracking. fileciteturn23file0L1-L1

- **Gap type**
  **Validation gap**. fileciteturn5file0L1-L1

- **Minimal fix (root cause, no new systems)**
  Add explicit checks in `validateQuestions`:
  - `typeof question.id === "string"` and `question.id.trim().length > 0`
  - uniqueness across the returned `questions` array (and optionally disallow collisions with prior question ids unless explicitly reopening). fileciteturn5file0L1-L1

**Reality check (limits and how to test the claims)**

- The analysis is structural and code-driven; it does not include empirical sampling of actual LLM outputs from your configured models/providers, so real-world frequency of each failure depends on model choice and prompt compliance. A concrete test is to log phase-check outputs and count: duplicate-ish labels, “Other”-only answers, and option similarity collisions. fileciteturn14file0L1-L1 fileciteturn18file0L1-L1
- Some “redundancy” is product-dependent: a boundary question (“offline required?”) and a flow question (“what happens when offline?”) can be legitimate distinct decisions. The validator currently can’t reliably separate “redundant” from “dependent but still needed,” so any stricter dedupe must be tuned to avoid false positives. fileciteturn6file0L1-L1
- The workflow doc’s description of “required four-question brief intake” appears misaligned with the phase-check prompt’s “often proceed with assumptions and no questions” guidance; if the doc is canonical, you’ll want to reconcile prompt + gating behavior accordingly before treating question-count behavior as a bug. fileciteturn10file0L1-L1 fileciteturn3file0L1-L1