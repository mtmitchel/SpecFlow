# Adversarial Pipeline Fidelity Review of SpecFlow

## Answer

SpecFlow’s highest-leverage fidelity risks come from two structural properties of the system:

- **Intent compression across multiple LLM summarization layers**: spec markdown is repeatedly “distilled” into **trace outlines** (LLM-generated structured summaries), then into **ticket-coverage items**, and only *those distilled artifacts* (not the full specs) are used as the canonical planning inputs for ticket planning. This creates multiple points where constraints can be dropped, reworded, or normalized into something that still looks valid but is no longer the user’s intent. fileciteturn6file0L1-L1 fileciteturn34file0L1-L1 fileciteturn31file0L1-L1
- **Verifier “pass” is not deterministically coupled to drift/out-of-scope evidence**: SpecFlow computes drift flags (e.g., “unexpected-file”) in the diff engine, but the verifier prompt is not given those drift flags, and the code does not enforce the “no critical drift flags” rule when computing `overallPass`. This enables “passes” that a human reviewer would reject (especially with unexpected-file changes or snapshot-mode blind spots). fileciteturn53file0L1-L1 fileciteturn55file0L1-L1 fileciteturn49file0L1-L1

Everything else (spec drift, bundle completeness, recovery) tends to cascade from these two issues.

## Pipeline map and persisted artifacts

SpecFlow’s core pipeline (Groundwork + Milestone Run) is: **free-form project description → brief intake questions → Brief → Core flows → PRD → Tech spec → Validation (ticket plan + coverage ledger) → Tickets → Bundle export → Diff + LLM verification → Accept/override**. fileciteturn5file0L1-L1

On the backend, the planner persists:
- Each artifact as markdown (`brief.md`, `core-flows.md`, `prd.md`, `tech-spec.md`)
- Reviews per artifact/cross-check (e.g., `prd-tech-spec-crosscheck.yaml`)
- Per-artifact **trace outlines** (structured summaries) (`traces/*.yaml`)
- A derived **ticket coverage ledger** (`coverage/tickets.yaml`)
- A **pending ticket plan** during Validation, then committed tickets (YAML per ticket). fileciteturn6file0L1-L1 fileciteturn34file0L1-L1 fileciteturn67file0L1-L1

Execution/verification persists per run attempt:
- Bundle directory + flattened bundle string
- Optional export-time file snapshot baseline (no-git)
- Primary diff + drift diff
- LLM verification output (structured JSON) fileciteturn6file0L1-L1 fileciteturn56file0L1-L1 fileciteturn49file0L1-L1

This persistence model is key to fidelity: planning and verification don’t operate on “live conversation context,” they operate on stored markdown + stored derived summaries + a scoped diff. fileciteturn6file0L1-L1 fileciteturn31file0L1-L1

## Fidelity loss vectors

**Finding: Ticket planning does not see full spec markdown (by design), only distilled summaries.**

- **Where**: `packages/app/src/planner/internal/planner-service-plans.ts` → `runPlanJob()` builds `planInput` using `initiative.description`, `traceOutlines`, `coverageItems`, optional `repoContext`—but not Brief/Core flows/PRD/Tech spec markdown. fileciteturn31file0L1-L1
  Data path: spec markdown → `ensureArtifactTrace()` → `ArtifactTraceOutline.sections` → `buildTicketCoverageItems()` → `TicketCoverageItem.text` → `PlanInput.coverageItems` + `PlanInput.traceOutlines` → LLM plan. fileciteturn34file0L1-L1 fileciteturn35file0L1-L1 fileciteturn33file0L1-L1
- **Scenario**: The PRD has a nuanced constraint like “export must preserve ordering, stable IDs, and round-trip formatting,” but the trace outline collapses it into a single bullet “export works.” Coverage items then become too generic, so the plan produces tickets whose acceptance criteria can be met by implementing “some export,” missing the hard parts the user cared about. The ticket-coverage-review might not catch it if it primarily checks coverage IDs and “design presence,” not semantic completeness. fileciteturn62file0L1-L1 fileciteturn60file0L1-L1
- **Severity**: **Critical** (tickets can be “correct” relative to the compressed plan, while wrong relative to actual intent).
- **Gap type**: **Design gap** (this is explicitly intended to keep Validation payload small). fileciteturn6file0L1-L1

**Finding: Trace outlines are only validated for shape, not for completeness/coverage, so “dropped constraints” look valid.**

- **Where**: `packages/app/src/planner/internal/validators.ts` → `validatePhaseMarkdownResult()` checks that `traceOutline.sections` exists as an array, but does not validate required section keys, minimum content, or that important PRD/Tech spec items are represented. fileciteturn37file0L1-L1
- **Scenario**: A Tech spec includes a dedicated “Engineering foundations” section in markdown, but the trace outline omits the “engineering-foundations” section entirely (or includes it with 0 items). Ticket coverage then contains no “engineering-foundation” coverage items, so neither plan tickets nor bundles surface those constraints as “covered engineering foundations,” and agents will make plausible-but-wrong choices (e.g., skip atomic writes, skip recovery semantics). fileciteturn65file0L1-L1 fileciteturn35file0L1-L1 fileciteturn57file0L1-L1
- **Severity**: **Significant** (often caught by humans, but structurally easy to miss because everything still “passes validation”).
- **Gap type**: **Design gap** (validation is structural, not semantic). fileciteturn37file0L1-L1

**Finding: Ticket coverage depends on trace-outline keys matching an implied schema; mismatches degrade traceability quality silently.**

- **Where**: `packages/app/src/planner/ticket-coverage.ts` → `buildTicketCoverageItems()` prefers fixed section keys (`goals`, `constraints`, `success-criteria`, etc.) and falls back to using whatever keys exist if those aren’t present. fileciteturn35file0L1-L1
- **Scenario**: The trace-outline generator outputs PRD sections like `requirements-v1` instead of `requirements`. Coverage extraction falls back and produces kinds/sectionKeys that don’t align with downstream assumptions (e.g., engineering-foundation detection relies on `engineering-foundations`). Tickets still get coverage IDs and Validation can still “account for all coverage items,” but spec items aren’t categorized correctly, so review prompts and bundles surface less relevant “covered items,” increasing the chance of missing the real constraint. fileciteturn35file0L1-L1 fileciteturn55file0L1-L1 fileciteturn57file0L1-L1
- **Severity**: **Significant**.
- **Gap type**: **Implementation gap** (the design assumes stable trace-outline schema; enforcement is missing). fileciteturn35file0L1-L1 fileciteturn37file0L1-L1

**Finding: Plan-repair prompts drop repo context entirely, making fileTargets less grounded after the first attempt.**

- **Where**: `packages/app/src/planner/prompt-builder.ts` → in the `plan` / `plan-repair` branch, `repoSection` is appended only when `!isRepair`. For repair attempts, the model no longer gets the file tree/config summary. fileciteturn62file0L1-L1
- **Scenario**: First plan attempt outputs mostly-correct tickets but misses some coverage mapping. Validation triggers repair. The repair attempt must introduce a new ticket or add fileTargets for uncovered items. Without repo context, the repair model guesses paths (e.g., `src/storage/yaml.ts`) that don’t exist. No validator checks that the paths exist; only “array of strings” is validated. Later, bundle export captures snapshot baselines for these non-existent paths as “.missing,” and verification scope becomes misconfigured, increasing false positives. fileciteturn62file0L1-L1 fileciteturn37file0L1-L1 fileciteturn81file0L1-L1
- **Severity**: **Critical** (this directly poisons execution scope and verification inputs).
- **Gap type**: **Implementation gap** (design goal is “accurate fileTargets grounded in the repo,” but the repair path removes the grounding). fileciteturn62file0L1-L1 fileciteturn6file0L1-L1

**Finding: The plan prompt explicitly optimizes acceptance criteria to be judged “from a code diff,” which can under-specify user intent.**

- **Where**: `packages/app/src/planner/prompt-builder.ts` (plan rules) instruct: “Write acceptance criteria as specific, observable outcomes that can be judged from a code diff.” fileciteturn62file0L1-L1
- **Scenario**: User intent includes experiential requirements (e.g., “fast enough,” “no perceived lag,” “smooth rollback,” “no data loss under interruption”). “Diff-judgeable” acceptance criteria tend to become surrogates (“adds debounce,” “writes file atomically”), which can be satisfied while still failing real-world constraints (e.g., debounce delay is too long, atomic write isn’t used on all paths). Verification then checks the surrogate criteria and passes. fileciteturn62file0L1-L1 fileciteturn55file0L1-L1
- **Severity**: **Critical** (this is exactly the “tickets technically satisfy acceptance criteria but miss intent” failure mode).
- **Gap type**: **Design gap** (diff-only verification is a constraint that shapes what criteria can express). fileciteturn62file0L1-L1

## False confidence modes

**Finding: Verifier `overallPass` is not deterministically enforced against drift flags, and the prompt is not given diff-engine drift flags.**

- **Where**:
  - Diff engine computes `driftFlags` like `unexpected-file` when git detects changed files outside scope. fileciteturn53file0L1-L1
  - Verifier prompt (`packages/app/src/verify/internal/prompt.ts`) asks the model to output drift flags and says `overallPass` must be false if “critical drift flags exist,” but the prompt **does not include** `diffResult.driftFlags` or `changedFiles`. It only includes `primaryDiff` and `driftDiff`. fileciteturn55file0L1-L1
  - Service computes `overallPass = allCriteriaPass && parsed.overallPass`, without checking drift flags itself. fileciteturn49file0L1-L1
- **Scenario**: Agent changes `package.json` (outside scope) to “fix” something, accidentally loosening constraints or changing build behavior. Git diff strategy flags it as `unexpected-file`, but the primary diff shown to the model excludes that file (scope-limited). The model never sees the problematic diff, returns `overallPass: true`, and SpecFlow marks the attempt as passed. A human reviewer would reject immediately upon seeing the out-of-scope config change. fileciteturn53file0L1-L1 fileciteturn55file0L1-L1 fileciteturn49file0L1-L1
- **Severity**: **Critical** (pipeline can produce confidently wrong “Pass”).
- **Gap type**: **Implementation gap** (the stated rule exists in the prompt, but the enforcement is missing in code and inputs). fileciteturn55file0L1-L1 fileciteturn49file0L1-L1

**Finding: Snapshot diff mode cannot detect changes outside scope at all, enabling silent out-of-scope regressions.**

- **Where**: `packages/app/src/verify/diff/snapshot-strategy.ts` computes patches only for `initialScopePaths` and `widenedScopePaths`. It does not scan the repo for other changes, so `changedFiles` is limited to those paths. fileciteturn54file0L1-L1
- **Scenario**: In a non-git directory, the agent edits `src/auth.ts` even though it wasn’t in fileTargets and wasn’t manually added to scope. Snapshot diff never includes it, so verifier never sees it; verification can pass while major side effects exist. A human reviewer looking at the repo would see the change immediately. fileciteturn54file0L1-L1 fileciteturn52file0L1-L1
- **Severity**: **Critical**.
- **Gap type**: **Design gap** (baseline capture is intentionally limited to fileTargets in `snapshot-before`). fileciteturn81file0L1-L1 fileciteturn6file0L1-L1

**Finding: Git diff strategy flags unexpected files but does not include their diffs anywhere for the model to evaluate.**

- **Where**: `packages/app/src/verify/diff/git-strategy.ts` computes `primaryDiff` scoped to target paths, and uses `--name-only` to flag out-of-scope changes as drift flags, but does not include patches for those unexpected files in either primary diff or drift diff. fileciteturn53file0L1-L1
- **Scenario**: Agent touches a small but critical out-of-scope file. SpecFlow flags it, but the verifier can’t inspect it because it isn’t in the provided diffs. This increases reliance on the user to notice drift flags and manually investigate, while the system might still produce a “Pass.” fileciteturn53file0L1-L1 fileciteturn49file0L1-L1
- **Severity**: **Critical** when combined with the `overallPass` issue; otherwise **Significant**.
- **Gap type**: **Design gap** in diff strategy + **Implementation gap** in pass enforcement. fileciteturn53file0L1-L1 fileciteturn49file0L1-L1

**Finding: Verifier evidence strings are not checked against the diff; hallucinated evidence can still produce a “Pass.”**

- **Where**: `packages/app/src/verify/internal/prompt.ts` requires evidence quality, but `runVerifierPrompt()` simply parses JSON and passes through `evidence` strings; no post-check enforces that mentioned files/functions exist in the diffs. fileciteturn55file0L1-L1
- **Scenario**: The model claims “Pass: implemented in `src/foo.ts` in `saveConfig()`,” but that function isn’t in the diff. If all criteria are marked pass and the model says `overallPass: true`, SpecFlow accepts the pass. A human reviewer would reject once they look at the diff. fileciteturn55file0L1-L1 fileciteturn49file0L1-L1
- **Severity**: **Significant** (models usually comply, but adversarially this is an obvious “reward hacking” vector).
- **Gap type**: **Design gap** (no deterministic evidence verification exists). fileciteturn55file0L1-L1

## Spec drift controls and gaps

**Finding: Cross-check reviews exist, but they are advisory and LLM-only—no hard contradiction detection exists between PRD and Tech spec.**

- **Where**:
  - Review artifacts are auto-run after generation (`runAutoReviews`) using review kinds like `prd-tech-spec-crosscheck` and `spec-set-review`. fileciteturn30file0L1-L1
  - Those reviews are produced by the same `review` job and only gate progress if the user treats them as gates; the design explicitly describes them as “secondary review artifacts instead of primary navigation gates.” fileciteturn5file0L1-L1
- **Scenario**: PRD says “no network calls; local-only,” but Tech spec proposes a cloud sync component. If the cross-check model misses the contradiction (or frames it as a “warning” rather than a “blocker”), the pipeline can proceed to Validation and tickets that implement the contradiction. fileciteturn60file0L1-L1 fileciteturn5file0L1-L1
- **Severity**: **Critical**.
- **Gap type**: **Design gap** (spec alignment is not deterministically enforced). fileciteturn60file0L1-L1

**Finding: Validation’s “coverage proof” can succeed even if the coverage ledger itself is missing constraints.**

- **Where**: Coverage validation checks only mapping completeness:
  - `packages/app/src/planner/internal/plan-validation.ts` validates that all coverage IDs are either assigned to a ticket or listed as uncovered, and that ticket coverage IDs exist. fileciteturn19file0L1-L1
  - It cannot detect “coverage items missing from the ledger” because those items never existed. Coverage items originate from trace outlines. fileciteturn35file0L1-L1
- **Scenario**: A subtle constraint (“must preserve backward compatibility with existing YAML schema”) is present only in markdown and is omitted from trace outline/ledger. Coverage validation succeeds (all ledger items accounted for) and ticket coverage review can still pass if it doesn’t notice the missing concept. The resulting tickets can all “cover everything” and still violate the omitted constraint. fileciteturn19file0L1-L1 fileciteturn31file0L1-L1
- **Severity**: **Critical**.
- **Gap type**: **Design gap** (coverage is treated as “truth” but is derived from summaries). fileciteturn35file0L1-L1

**Finding: PRD generation never receives repo context; only PRD checks might—leading to repo/PRD inconsistency later.**

- **Where**: `packages/app/src/planner/internal/planner-service-refinement.ts`:
  - `generateArtifact()` includes `repoContext` only for `tech-spec`, never for PRD generation. fileciteturn44file0L1-L1
  - PRD phase checks may include repo context only if `shouldIncludePrdRepoContext()` keyword triggers match. fileciteturn44file0L1-L1 fileciteturn30file0L1-L1
- **Scenario**: The codebase has hard constraints (e.g., existing boundary modules, existing file formats) that should shape PRD-level promises. PRD generation can make promises incompatible with the repo. Tech spec later sees repo context and “fixes” by contradicting the PRD. Cross-check may miss it or treat it as acceptable evolution. fileciteturn44file0L1-L1 fileciteturn42file0L1-L1
- **Severity**: **Significant** (often caught, but structurally likely in real repos).
- **Gap type**: **Design gap** (repo context is treated as “engineering only,” but it affects product promises too). fileciteturn44file0L1-L1

**Finding: Validation’s loop suppression can “force proceed” by filtering all asked questions, even when the model wanted to block.**

- **Where**: `packages/app/src/runtime/handlers/initiative-continue-handlers.ts`:
  - `rerunValidationBlockedSteps()` runs stage phase checks and filters “looped” questions via `isSemanticallyRepeatedConcern()` and `materiallyNarrowsDecisionBoundary()`.
  - If filtering removes all questions, the step is treated as not blocked (`suppressedLoopSteps`), allowing Validation to proceed. fileciteturn47file0L1-L1
- **Scenario**: Phase checks keep asking for a missing decision (e.g., data retention policy) but phrase it similarly. The heuristics decide it’s semantically repeated and not narrower, so the questions get suppressed. Validation proceeds to plan generation without the decision actually being made. Tickets get generated with implicit assumptions, which might pass later verification relative to those assumptions but violate the user’s real constraints. fileciteturn47file0L1-L1 fileciteturn70file0L1-L1
- **Severity**: **Critical**.
- **Gap type**: **Implementation gap** (the intent is to avoid infinite loops, but the mechanism can suppress legitimate blockers). fileciteturn47file0L1-L1 fileciteturn70file0L1-L1

## Closed-loop evaluation risks

**Finding: The same model family can “self-grade” its own plan, especially because it writes the acceptance criteria that it later verifies.**

- **Where**:
  - Planner generates ticket acceptance criteria in the `plan` job. fileciteturn62file0L1-L1
  - Verifier uses those acceptance criteria as the primary truth source. fileciteturn49file0L1-L1 fileciteturn55file0L1-L1
- **Scenario**: In planning, the model accidentally omits a key user constraint when writing criteria. In verification, the same model evaluates against the same missing criteria and passes. A human reviewer rejects because the user intent (captured in earlier artifacts) wasn’t satisfied, but the pipeline never forces the verifier to consult the full PRD/Tech spec as “ground truth,” only the ticket. fileciteturn55file0L1-L1 fileciteturn31file0L1-L1
- **Severity**: **Critical** (this is the closed-loop failure mode).
- **Gap type**: **Design gap** (spec is not independently binding at verification time; verification is ticket-centric). fileciteturn55file0L1-L1

**Finding: The best “second opinion” checkpoints are the ones where compression happens or where scope is chosen.**

- **Where to add value (concrete insertion points)**:
  - After `ensureArtifactTrace()` / coverage derivation (before plan): independent critique of trace outline completeness relative to markdown. fileciteturn34file0L1-L1
  - After plan repair (before committing pending plan): enforce grounded `fileTargets` and re-check drift risk deterministically. fileciteturn62file0L1-L1 fileciteturn67file0L1-L1
  - During verification: deterministic pass computation that incorporates drift flags and/or changed-file lists (especially `unexpected-file`) rather than trusting `parsed.overallPass`. fileciteturn49file0L1-L1
- **Scenario**: A second model (or deterministic rule set) flags “this PRD constraint was not represented in coverage items,” or “you have unexpected-file changes; you must inspect or fail,” preventing a closed-loop pass. fileciteturn53file0L1-L1 fileciteturn35file0L1-L1
- **Severity**: **Significant** (mitigation leverage is high).
- **Gap type**: **Design gap** (no second-opinion mechanism exists today). fileciteturn6file0L1-L1

**Finding: Review-resolution routing is keyword-heuristic and domain-biased, weakening second-order “repair” effectiveness on non-template projects.**

- **Where**: `packages/app/src/planner/review-resolution.ts` routes findings to steps based on keyword lists (including many note-taking-specific tokens), and defaults to `tech-spec` or `prd`. fileciteturn92file0L1-L1
- **Scenario**: For a project unrelated to note-taking, a coverage-review blocker message doesn’t match the domain keywords, so it routes to the wrong step. Validation then asks the wrong follow-up questions (or shows the wrong “fix here” UI), reducing the probability that the user repairs the right upstream decision and increasing drift. fileciteturn92file0L1-L1 fileciteturn47file0L1-L1
- **Severity**: **Significant**.
- **Gap type**: **Implementation gap** (the design expects correct “resolution step” routing; current heuristic is brittle). fileciteturn6file0L1-L1 fileciteturn92file0L1-L1

## Bundle completeness and recovery

**Finding: Decision specs exist, but bundles exclude them—agents can violate architectural decisions without seeing them.**

- **Where**:
  - Spec model includes `SpecType = InitiativeArtifactStep | "decision"`. fileciteturn90file0L1-L1
  - `packages/app/src/bundle/internal/context-files.ts` filters out decision specs (`spec.type !== "decision"`). fileciteturn58file0L1-L1
- **Scenario**: You record a key decision in `specflow/decisions/*.md` (e.g., “Do not introduce a database; YAML is canonical,” or “All writes must be atomic with staged commit semantics”). Planned tickets and bundles omit this decision doc; an external agent makes a reasonable-looking choice that violates it. The verifier may still pass if acceptance criteria didn’t encode the decision. fileciteturn58file0L1-L1 fileciteturn55file0L1-L1
- **Severity**: **Critical** when “decision docs” are actually used as binding constraints; otherwise **Significant**.
- **Gap type**: **Design gap** (bundle definition omits a spec class that can encode highest-priority constraints). fileciteturn58file0L1-L1

**Finding: Project tickets typically have no implementation plan, so the bundle often lacks “how,” forcing agents to guess.**

- **Where**:
  - Plan job output contract includes tickets with title/description/acceptanceCriteria/fileTargets/coverageItemIds, but no `implementationPlan`. fileciteturn33file0L1-L1 fileciteturn62file0L1-L1
  - Ticket factory only sets `implementationPlan` when the draft is a `TriageTicketDraft` (Quick Build), not when it’s a plan ticket. fileciteturn68file0L1-L1
  - Bundle renderer shows `(not provided)` when ticket implementationPlan is empty. fileciteturn57file0L1-L1
- **Scenario**: A ticket includes a few diff-judgeable acceptance criteria and fileTargets, but the “engineering approach” (e.g., exactly which abstraction boundary to extend, migration plan, compatibility strategy) is not encoded. An agent chooses an implementation that passes criteria but violates architecture boundaries or future maintainability expectations that were present in Tech spec but not emphasized in the ticket. fileciteturn57file0L1-L1 fileciteturn65file0L1-L1
- **Severity**: **Significant**.
- **Gap type**: **Design gap** (plan tickets are intentionally lightweight; but that’s exactly what makes “reasonable-looking wrong choices” more likely). fileciteturn33file0L1-L1 fileciteturn68file0L1-L1

**Finding: Snapshot baselines are captured only for `fileTargets`, so both agent context and no-git verification are fragile when fileTargets are wrong.**

- **Where**: `packages/app/src/bundle/internal/snapshot.ts` captures `snapshot-before/*` for each fileTarget path (file read as UTF-8; missing files become `.missing`). fileciteturn81file0L1-L1
- **Scenario**: Planner outputs a directory path or a non-existent file as a fileTarget. Snapshot baseline becomes missing or meaningless, so no-git diff/verification cannot faithfully compare changes. This can cause either false positives (changes aren’t shown) or false negatives (missing baseline triggers drift noise). fileciteturn81file0L1-L1 fileciteturn54file0L1-L1
- **Severity**: **Critical** in non-git workflows; **Significant** in git workflows (because git can still diff).
- **Gap type**: **Implementation gap** (the design assumes fileTargets are accurate and represent the correct scope). fileciteturn6file0L1-L1 fileciteturn62file0L1-L1

**Finding: The “Export fix bundle” path described in docs is not clearly grounded in verification failures in the code, making recovery from false positives/negatives ambiguous.**

- **Where**:
  - Workflows expect on verification failure: “Export fix bundle” with remediation hints and failure context. fileciteturn5file0L1-L1
  - Runtime handler `tickets.exportFixBundle` takes `(runId, findingId)` and is validated with `finding-{digits}` format—this aligns with Drift Audit findings, not verifier criteria failures. fileciteturn76file0L1-L1 fileciteturn78file0L1-L1
  - Bundle rendering uses only ticket content + covered items + spec files; it does not ingest verifier attempt results or remediation hints. (It prints `sourceRunId/sourceFindingId` but does not attach “failed criteria context” automatically.) fileciteturn56file0L1-L1 fileciteturn57file0L1-L1
- **Scenario**: Verification fails on criterion 2 with a remediation hint (“add migration guardrail”), but the user chooses “Export fix bundle.” The generated bundle does not automatically include “failed criterion + hint + evidence,” so the agent is not actually “pre-loaded with failure context.” Agents then repeatedly fix the wrong thing or reintroduce the same failure mode. fileciteturn5file0L1-L1 fileciteturn57file0L1-L1
- **Severity**: **Significant** (recovery friction and repeated failure loops).
- **Gap type**: **Implementation gap** (design calls for failure-context bundles; current export path appears aligned to audit findings rather than verifier failures, and the renderer doesn’t incorporate verifier outputs). fileciteturn5file0L1-L1 fileciteturn76file0L1-L1

**Finding: Planning re-entry is relatively clean; verification re-entry is scope-fragile and user-driven.**

- **Where (planning re-entry)**:
  - `initiatives.continueArtifactStep` persists draft answers, reruns phase check, and generates artifact if unblocked. fileciteturn47file0L1-L1
  - `initiatives.continueValidation` reruns blocked steps and then runs plan generation; it supports feedback-specified reruns via `validationFeedbackByStep`. fileciteturn47file0L1-L1
  - Spec edits invalidate downstream steps and mark reviews stale (`invalidateWorkflowFromStep`, `markPlanningArtifactsStale`). fileciteturn48file0L1-L1 fileciteturn46file0L1-L1
- **Where (verification re-entry)**:
  - Verification capture uses user-specified `scopePaths` and `widenedScopePaths`, defaulting to ticket fileTargets if none are provided. fileciteturn76file0L1-L1 fileciteturn49file0L1-L1
- **Scenario**:
  - **Bad plan**: If tickets haven’t started, you can modify upstream specs/answers and rerun validation to regenerate plan (though replanning deletes and recreates tickets when allowed). fileciteturn67file0L1-L1 fileciteturn48file0L1-L1
  - **False positive verification**: recovery is mostly “human-in-the-loop”—review changes, rerun verification with a wider scope, or create follow-up work via Drift Audit. There is no deterministic “force fail on drift” safety net in the pass computation today. fileciteturn76file0L1-L1 fileciteturn49file0L1-L1
- **Severity**: **Significant** (planning) / **Critical** (verification) depending on drift becoming “pass.”
- **Gap type**: **Design gap** (verification depends on correct scoping and human review; enforcement is intentionally light but currently undercuts trust). fileciteturn49file0L1-L1

## Reality check

- **Risk: Some “critical” outcomes rely on how the UI presents drift flags and whether a user is expected to always inspect them.** If the UI reliably forces a human to review drift flags before accepting a pass, the practical severity of the drift/pass coupling bug drops. **Concrete test**: create a run where an out-of-scope file changes; verify whether the UI allows “Accept” without forcing inspection. fileciteturn5file0L1-L1 fileciteturn76file0L1-L1
- **Risk: Some failures depend on LLM quality (e.g., hallucinated evidence), which might be rare in practice with strong models and guardrails.** **Concrete test**: build a regression suite of “adversarial diffs” (empty diff, misleading refactors, drift-only changes) and measure pass rates across providers configured in `Config.provider`. fileciteturn55file0L1-L1 fileciteturn90file0L1-L1
- **Risk: Repo-specific conventions in AGENTS.md could compensate for missing decision-doc inclusion and weak plan tickets.** **Concrete test**: create two tickets that depend on an architectural decision recorded only in `decisions/*.md`, then export bundles and see whether the agent succeeds without that file. fileciteturn85file0L1-L1 fileciteturn58file0L1-L1