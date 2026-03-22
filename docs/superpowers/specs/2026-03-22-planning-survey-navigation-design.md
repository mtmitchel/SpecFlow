# Planning survey navigation redesign

## Problem

The planning survey has three UX problems:

1. **Redundant navigation buttons.** "Back" (previous step) and "Previous question" (previous question) appear side by side. They serve different scopes but look like peers, creating confusion.

2. **No review gate after spec generation.** After answering all questions for a step (e.g., core flows), the system auto-generates the artifact and immediately navigates to the next step's questions. The user never reads the generated document before being pushed forward.

3. **Validation does not auto-skip.** When validation passes with no follow-up questions, the user still sees a validation completed screen with a manual "Continue" button. If nothing needs attention, go straight to tickets.

## Design

### Change 1: Unified Back button

Replace the two separate "Back" and "Previous question" buttons with a single "Back" button.

**Logic (evaluated in order):**

1. If there is a previous question in the current survey, navigate to that question.
2. Else if there is a previous planning step, navigate to that step's review surface.
3. Else the button is hidden (first question of the first step).

This means on question 2+ the user walks backward through questions. Only after reaching question 1 and clicking "Back" again does it go to the previous step. The user cannot jump directly from an arbitrary question to the previous step -- they must walk back first.

**File:** `packages/client/src/app/views/initiative/refinement-section.tsx`

In the survey question action row (inside the `questionDeck && !showSurveyLoading && currentQuestion` branch), two adjacent conditional button blocks render "Back" (`onBackToPreviousStep`) and "Previous question" (`previousQuestionId`). Replace both with a single conditional:

```tsx
{previousQuestionId ? (
  <button type="button" onClick={() => setOpenQuestionId(previousQuestionId)}>
    Back
  </button>
) : onBackToPreviousStep ? (
  <button type="button" onClick={() => onBackToPreviousStep()}>
    Back
  </button>
) : null}
```

The "all questions answered" completion card also renders an `onBackToPreviousStep` button. That block has no `previousQuestionId` rendering, so it is unaffected by this change -- it stays as-is.

### Change 2: Review gate after spec generation

After generating a spec artifact, always navigate to the current step's review surface instead of auto-advancing to the next step.

The review surface already exists. It renders the generated document with action buttons including "Continue to [next step]". The user reads the document and explicitly clicks to advance.

**File:** `packages/client/src/app/views/initiative/planning-spec-section.tsx`

The constant `shouldNavigateForwardAfterGeneration` (currently `!hasActiveContent`) controls whether survey completion and error-retry paths auto-advance. Change it to always be `false`:

```typescript
// Before:
const shouldNavigateForwardAfterGeneration = !hasActiveContent;

// After:
const shouldNavigateForwardAfterGeneration = false;
```

This covers the survey completion call at `handleCompleteSurvey` (which passes `navigateOnSuccess: shouldNavigateForwardAfterGeneration`) and the error-retry button for non-brief steps (which also reads `shouldNavigateForwardAfterGeneration`).

Additionally, three other `beginAutoAdvance` calls pass `navigateOnSuccess: true` directly:

| Call site | Context | Change |
|-----------|---------|--------|
| Brief auto-start effect (`shouldAutoStartBrief`) | `navigateOnSuccess: true` | Change to `false` |
| Downstream entry generation effect (`shouldAutoGenerateAfterEntryCheck`) | `navigateOnSuccess: true` | Change to `false` |
| Error-retry button for brief step | `navigateOnSuccess: true` | Change to `false` |

After all five sites use `false`, `use-phase-auto-advance.ts` always takes the existing `navigateToStep(step, "review")` fallback path (present in both the draft and non-draft branches of `beginAutoAdvance`). No changes needed in that file.

### Change 3: Validation auto-skip when no questions

When validation runs and completes without producing follow-up questions, navigate directly to the tickets step instead of showing the validation completed view.

**File:** `packages/client/src/app/views/initiative/use-initiative-planning-workspace.ts`

In `handleGenerateTickets`, there are two success paths. Both need a `navigateToStep("tickets")` call after `onRefresh()`.

**Path A -- `activeStep === "validation"` (continuation check):**

When `continueInitiativeValidation` returns `decision === "ask"`, the user stays on validation (questions appear after refresh). When `decision !== "ask"`, tickets have been generated. Add `navigateToStep("tickets")` before the return:

```typescript
if (result.decision === "ask") {
  await onRefresh();
  return;
}
await onRefresh();
navigateToStep("tickets");
return;
```

**Path B -- initial plan generation:**

After `generateInitiativePlan` succeeds and `onRefresh()` completes, tickets have been generated. Add `navigateToStep("tickets")` inside the `try` block, after `await onRefresh()`:

```typescript
try {
  await generateInitiativePlan(initiative.id, { signal });
  await onRefresh();
  navigateToStep("tickets");
} catch (error) {
  // ... existing recovery logic unchanged
}
```

`navigateToStep` is already in scope inside the workspace hook (destructured from `useInitiativePlanningRoute`). The surface parameter is optional and tickets have no surface, so `navigateToStep("tickets")` is correct.

**validation-section.tsx impact:** The validation survey's `handleCompleteSurvey` calls `onValidatePlan()` (which is `handleGenerateTickets`), then calls `setShowRevisionSurvey(false)`. After Change 3, `handleGenerateTickets` navigates away on success, so `setShowRevisionSurvey(false)` runs on an unmounting component. This is harmless (React does not error on state updates during unmount cleanup), but for clarity, the `setShowRevisionSurvey(false)` call can be moved before `onValidatePlan()` or guarded -- this is a minor cleanup, not a correctness issue.

The completed/passed validation view with the manual "Continue" button becomes unreachable during normal flow. Cleanup is deferred.

## Scope

- Client-side only. No backend changes.
- No new components or files.
- No CSS changes.
- Three files modified: `refinement-section.tsx`, `planning-spec-section.tsx`, `use-initiative-planning-workspace.ts`.

## Testing

**refinement-section.test.tsx:**
- The test "keeps Back for the previous stage and uses a separate button for the previous question" asserts both "Back" and "Previous question" buttons appear simultaneously and have distinct click targets. This test must be rewritten to verify the unified behavior: on question 2, "Back" goes to question 1; on question 1, "Back" goes to the previous step's review.

**planning-spec-section.test.tsx:**
- Tests that assert auto-navigation to the next step after generation must be updated to expect navigation to the current step's review surface.

**initiative-view.test.tsx:**
- Tests covering the auto-advance flow (e.g., "auto-continues into core flow questions after brief generation") must be updated to expect the user lands on the brief review surface instead.

No new test files needed.

## Out of scope

- The sidecar timeout error visible in the second screenshot is unrelated to navigation flow.
- Cleanup of now-unreachable validation completed view is deferred.
