# Planning survey navigation redesign

Status: **Implemented** (commits 084d715..0b188af on main)

## Problem

The planning survey had five UX and reliability problems:

1. **Redundant navigation buttons.** "Back" (previous step) and "Previous question" (previous question) appeared side by side.
2. **No review gate after spec generation.** After answering all questions, the system auto-advanced to the next step without letting the user read the generated document.
3. **Validation did not auto-skip.** When validation passed with no follow-up questions, the user still saw a manual "Continue" screen.
4. **Step transition bounce-back.** Navigating to the next step bounced the user back because a stale auto-advance promise completed after the user moved on, calling `navigateToStep` for the old step.
5. **Validation intermediary card.** When validation had questions, an extra summary card appeared before the survey instead of launching directly into the questions.

## Implementation

### Change 1: Unified Back button

**File:** `packages/client/src/app/views/initiative/refinement-section.tsx`

Single "Back" button: if `previousQuestionId` exists, navigates to the previous question; else if `onBackToPreviousStep` exists, navigates to the previous step's review; else hidden.

### Change 2: Review gate after spec generation

**File:** `packages/client/src/app/views/initiative/planning-spec-section.tsx`

`shouldNavigateForwardAfterGeneration` changed to `false`. All five `beginAutoAdvance` call sites now use `navigateOnSuccess: false`. After generation, the user always lands on the current step's review surface. The existing "Continue to [next step]" button in the review surface is the explicit advance mechanism.

### Change 3: Validation auto-skip

**File:** `packages/client/src/app/views/initiative/use-initiative-planning-workspace.ts`

`navigateToStep("tickets")` added after `onRefresh()` in both the `continueInitiativeValidation` non-ask path and the `generateInitiativePlan` success path inside `handleGenerateTickets`.

### Change 4: Cancel stale auto-advance on step transition

**Files:** `planning-spec-section.tsx`, `use-phase-auto-advance.ts`

The "Continue" button in the review surface now calls `cancelAutoAdvance()` before `onAdvanceToNextStep()`, aborting the old step's pending LLM call. `beginAutoAdvance` checks `controller.signal.aborted` after every async boundary (`onRefresh`, `runPhaseGeneration`) and bails if the advance was cancelled. This prevents a completed LLM call from navigating back to a step the user already left.

### Change 5: Validation survey renders immediately

**File:** `packages/client/src/app/views/initiative/validation-section.tsx`

The survey condition changed from `(reviewBlocked && hasQuestions)` to `hasQuestions`. The intermediary summary card (title, badges, description) above the survey was removed. When questions exist, the survey card renders directly.

### Change 6: Workflow normalization consistency

**File:** `packages/app/src/planner/workflow-state.ts`

In `normalizeInitiativeWorkflow`, a persisted `"locked"` step status is promoted to the artifact-inferred status when the prerequisite step has already normalized to `"complete"`. This prevents the impossible `prerequisite-complete / downstream-locked` state caused by file-watcher reload races.

### Change 7: LLM resilience

**Files:** `planner/internal/job-executor.ts`, `planner/internal/plan-generation-job.ts`

- Plan and plan-repair job timeout raised from 180s to 300s
- Plan validation retry budget raised from 2 to 3 attempts
- Markdown heading sentence case auto-corrected instead of throwing (`normalizeMarkdownHeadingsSentenceCase`)
- Brief heading mismatch auto-corrected instead of throwing

## Files modified

| File | Changes |
|------|---------|
| `packages/client/src/app/views/initiative/refinement-section.tsx` | Unified Back button |
| `packages/client/src/app/views/initiative/use-refinement-state.ts` | New file: extracted hook from refinement-section |
| `packages/client/src/app/views/initiative/planning-spec-section.tsx` | Review gate, cancel auto-advance |
| `packages/client/src/app/views/initiative/use-phase-auto-advance.ts` | Abort guard after async boundaries |
| `packages/client/src/app/views/initiative/use-initiative-planning-workspace.ts` | Validation auto-skip, answer preservation |
| `packages/client/src/app/views/initiative/validation-section.tsx` | Direct survey rendering |
| `packages/client/src/app/views/initiative-view.tsx` | Wiring for onAdvanceToNextStep |
| `packages/app/src/planner/workflow-state.ts` | Normalization consistency fix |
| `packages/app/src/planner/internal/job-executor.ts` | Timeout increase |
| `packages/app/src/planner/internal/plan-generation-job.ts` | Retry budget increase |
| `packages/app/src/planner/internal/title-style.ts` | Sentence case normalize |
| `packages/app/src/planner/internal/validators.ts` | Heading auto-correction |
