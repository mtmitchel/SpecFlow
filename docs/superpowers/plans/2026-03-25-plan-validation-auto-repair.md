# Plan validation auto-repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the "Incomplete ticket plan" error by auto-repairing fixable LLM output before validation, and programmatically assigning unmatched coverage items instead of burning LLM retries.

**Architecture:** Two new pure functions inserted into the existing validation pipeline: `normalizePlanResult` fixes structural issues (sentence case, ampersands, trailing punctuation) before `validatePlanResult` runs; `autoAssignMissingCoverageItems` fills coverage gaps after validation identifies them, avoiding a full LLM retry for the most common failure mode.

**Tech Stack:** TypeScript, Vitest

---

## File structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/app/src/planner/internal/plan-normalizer.ts` | `normalizePlanResult` -- mutates a `PlanResult` to fix sentence case, ampersands, trailing punctuation |
| Create | `packages/app/src/planner/internal/coverage-auto-repair.ts` | `autoAssignMissingCoverageItems` -- programmatically assigns unmatched coverage items to best-matching tickets |
| Create | `packages/app/test/plan-normalizer.test.ts` | Tests for plan normalization |
| Create | `packages/app/test/coverage-auto-repair.test.ts` | Tests for coverage auto-repair |
| Modify | `packages/app/src/planner/internal/planner-service-plans.ts:141-143` | Wire `normalizePlanResult` + `autoAssignMissingCoverageItems` into the `validateResult` callback |
| Modify | `packages/app/test/plan-generation-validation.test.ts` | Add integration tests for the combined normalize + validate + auto-repair pipeline |

---

### Task 1: `normalizePlanResult` -- auto-fix structural issues

**Files:**
- Create: `packages/app/src/planner/internal/plan-normalizer.ts`
- Create: `packages/app/test/plan-normalizer.test.ts`
- Read: `packages/app/src/planner/internal/title-style.ts` (imports `normalizePhaseName`, `normalizeTicketTitle`, `toSentenceCaseLabel`)

This function mutates a `PlanResult` in place to fix issues the LLM commonly gets wrong. It runs BEFORE `validatePlanResult`, so validation only sees the normalized output.

- [ ] **Step 1: Write failing tests for plan normalization**

```typescript
// packages/app/test/plan-normalizer.test.ts
import { describe, expect, it } from "vitest";
import { normalizePlanResult } from "../src/planner/internal/plan-normalizer.js";
import type { PlanResult } from "../src/planner/types.js";

describe("normalizePlanResult", () => {
  it("normalizes phase names to sentence case", () => {
    const result: PlanResult = {
      phases: [
        {
          name: "Project Setup",
          order: 1,
          tickets: [
            {
              title: "Initialize repo",
              description: "Set up the repo.",
              acceptanceCriteria: ["Repo exists."],
              fileTargets: ["README.md"],
              coverageItemIds: ["coverage-brief-goals-1"],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };

    normalizePlanResult(result);
    expect(result.phases[0].name).toBe("Project setup");
  });

  it("normalizes ticket titles to sentence case", () => {
    const result: PlanResult = {
      phases: [
        {
          name: "Build",
          order: 1,
          tickets: [
            {
              title: "Implement Notes List",
              description: "Create the notes list.",
              acceptanceCriteria: ["Notes display."],
              fileTargets: [],
              coverageItemIds: [],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };

    normalizePlanResult(result);
    expect(result.phases[0].tickets[0].title).toBe("Implement notes list");
  });

  it("replaces ampersands in descriptions and acceptance criteria", () => {
    const result: PlanResult = {
      phases: [
        {
          name: "Build",
          order: 1,
          tickets: [
            {
              title: "Add search",
              description: "Search & filter notes.",
              acceptanceCriteria: ["Search & filter work."],
              fileTargets: [],
              coverageItemIds: [],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };

    normalizePlanResult(result);
    expect(result.phases[0].tickets[0].description).toBe(
      "Search and filter notes."
    );
    expect(result.phases[0].tickets[0].acceptanceCriteria[0]).toBe(
      "Search and filter work."
    );
  });

  it("strips wrapping quotes and trailing punctuation from titles", () => {
    const result: PlanResult = {
      phases: [
        {
          name: '"Core features."',
          order: 1,
          tickets: [
            {
              title: '"Build tag system."',
              description: "Tags.",
              acceptanceCriteria: [],
              fileTargets: [],
              coverageItemIds: [],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };

    normalizePlanResult(result);
    expect(result.phases[0].name).toBe("Core features");
    expect(result.phases[0].tickets[0].title).toBe("Build tag system");
  });

  it("preserves special-cased words like API and UI", () => {
    const result: PlanResult = {
      phases: [
        {
          name: "api layer",
          order: 1,
          tickets: [
            {
              title: "Build ui components",
              description: "UI work.",
              acceptanceCriteria: [],
              fileTargets: [],
              coverageItemIds: [],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };

    normalizePlanResult(result);
    expect(result.phases[0].name).toBe("API layer");
    expect(result.phases[0].tickets[0].title).toBe("Build UI components");
  });

  it("defaults missing uncoveredCoverageItemIds to empty array", () => {
    const result = {
      phases: [],
    } as unknown as PlanResult;

    normalizePlanResult(result);
    expect(result.uncoveredCoverageItemIds).toEqual([]);
  });

  it("defaults missing coverageItemIds on tickets to empty array", () => {
    const result: PlanResult = {
      phases: [
        {
          name: "Build",
          order: 1,
          tickets: [
            {
              title: "Add notes",
              description: "Notes.",
              acceptanceCriteria: [],
              fileTargets: [],
            } as PlanResult["phases"][0]["tickets"][0],
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };

    normalizePlanResult(result);
    expect(result.phases[0].tickets[0].coverageItemIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/app/test/plan-normalizer.test.ts`
Expected: FAIL -- module not found

- [ ] **Step 3: Implement `normalizePlanResult`**

```typescript
// packages/app/src/planner/internal/plan-normalizer.ts
import { normalizePhaseName, normalizeTicketTitle } from "./title-style.js";
import type { PlanResult } from "../types.js";

const replaceAmpersands = (value: string): string =>
  value.replace(/\s*&\s*/g, " and ");

export const normalizePlanResult = (result: PlanResult): void => {
  if (!Array.isArray(result.uncoveredCoverageItemIds)) {
    result.uncoveredCoverageItemIds = [];
  }

  if (!Array.isArray(result.phases)) {
    return;
  }

  for (const phase of result.phases) {
    if (typeof phase.name === "string") {
      phase.name = normalizePhaseName(phase.name);
    }

    if (!Array.isArray(phase.tickets)) {
      continue;
    }

    for (const ticket of phase.tickets) {
      if (typeof ticket.title === "string") {
        ticket.title = normalizeTicketTitle(ticket.title);
      }

      if (typeof ticket.description === "string") {
        ticket.description = replaceAmpersands(ticket.description);
      }

      if (Array.isArray(ticket.acceptanceCriteria)) {
        ticket.acceptanceCriteria = ticket.acceptanceCriteria.map((criterion) =>
          typeof criterion === "string" ? replaceAmpersands(criterion) : criterion
        );
      }

      if (!Array.isArray(ticket.coverageItemIds)) {
        ticket.coverageItemIds = [];
      }
    }
  }
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/app/test/plan-normalizer.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/planner/internal/plan-normalizer.ts packages/app/test/plan-normalizer.test.ts
git commit -m "Add normalizePlanResult to auto-fix LLM plan output before validation"
```

---

### Task 2: `autoAssignMissingCoverageItems` -- programmatic coverage repair

**Files:**
- Create: `packages/app/src/planner/internal/coverage-auto-repair.ts`
- Create: `packages/app/test/coverage-auto-repair.test.ts`
- Read: `packages/app/src/planner/internal/plan-validation.ts` (understand validation issue types)
- Read: `packages/app/src/planner/ticket-coverage.ts` (understand `TicketCoverageItem` shape)

This function takes a `PlanResult` and the known coverage items. For each coverage item that is neither assigned to a ticket nor listed in `uncoveredCoverageItemIds`, it finds the best-matching ticket by text similarity and assigns the item there. This runs AFTER `validatePlanResult` (structural) passes but BEFORE `validateCoverageMappings` (coverage), catching the most common coverage failure without an LLM retry.

- [ ] **Step 1: Write failing tests for coverage auto-repair**

```typescript
// packages/app/test/coverage-auto-repair.test.ts
import { describe, expect, it } from "vitest";
import { autoAssignMissingCoverageItems } from "../src/planner/internal/coverage-auto-repair.js";
import type { PlanResult } from "../src/planner/types.js";
import type { TicketCoverageItem } from "../src/types/entities.js";

const makeCoverageItem = (
  overrides: Partial<TicketCoverageItem> & { id: string; text: string }
): TicketCoverageItem => ({
  sourceStep: "brief",
  sectionKey: "goals",
  sectionLabel: "Goals",
  kind: "goal",
  ...overrides,
});

describe("autoAssignMissingCoverageItems", () => {
  it("assigns unmatched coverage item to the best-matching ticket", () => {
    const coverageItems: TicketCoverageItem[] = [
      makeCoverageItem({ id: "coverage-brief-goals-1", text: "Offline note storage" }),
      makeCoverageItem({ id: "coverage-brief-goals-2", text: "Tag-based organization" }),
    ];

    const result: PlanResult = {
      phases: [
        {
          name: "Build",
          order: 1,
          tickets: [
            {
              title: "Implement offline storage",
              description: "Store notes locally for offline access.",
              acceptanceCriteria: ["Notes persist offline."],
              fileTargets: [],
              coverageItemIds: ["coverage-brief-goals-1"],
            },
            {
              title: "Add tag system",
              description: "Organize notes using tags.",
              acceptanceCriteria: ["Tags can be assigned."],
              fileTargets: [],
              coverageItemIds: [],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };

    const assigned = autoAssignMissingCoverageItems(result, coverageItems);
    expect(assigned).toBe(1);
    expect(result.phases[0].tickets[1].coverageItemIds).toContain(
      "coverage-brief-goals-2"
    );
  });

  it("does not reassign already-assigned coverage items", () => {
    const coverageItems: TicketCoverageItem[] = [
      makeCoverageItem({ id: "coverage-brief-goals-1", text: "Offline note storage" }),
    ];

    const result: PlanResult = {
      phases: [
        {
          name: "Build",
          order: 1,
          tickets: [
            {
              title: "Implement offline storage",
              description: "Store notes locally.",
              acceptanceCriteria: [],
              fileTargets: [],
              coverageItemIds: ["coverage-brief-goals-1"],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };

    const assigned = autoAssignMissingCoverageItems(result, coverageItems);
    expect(assigned).toBe(0);
  });

  it("does not reassign items already in uncoveredCoverageItemIds", () => {
    const coverageItems: TicketCoverageItem[] = [
      makeCoverageItem({ id: "coverage-brief-goals-1", text: "Offline note storage" }),
    ];

    const result: PlanResult = {
      phases: [
        {
          name: "Build",
          order: 1,
          tickets: [
            {
              title: "Add notes",
              description: "Notes.",
              acceptanceCriteria: [],
              fileTargets: [],
              coverageItemIds: [],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: ["coverage-brief-goals-1"],
    };

    const assigned = autoAssignMissingCoverageItems(result, coverageItems);
    expect(assigned).toBe(0);
  });

  it("removes unknown coverage item ids from tickets", () => {
    const coverageItems: TicketCoverageItem[] = [
      makeCoverageItem({ id: "coverage-brief-goals-1", text: "Offline note storage" }),
    ];

    const result: PlanResult = {
      phases: [
        {
          name: "Build",
          order: 1,
          tickets: [
            {
              title: "Implement storage",
              description: "Store notes locally.",
              acceptanceCriteria: [],
              fileTargets: [],
              coverageItemIds: ["coverage-brief-goals-1", "coverage-nonexistent-99"],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };

    autoAssignMissingCoverageItems(result, coverageItems);
    expect(result.phases[0].tickets[0].coverageItemIds).toEqual([
      "coverage-brief-goals-1",
    ]);
  });

  it("removes unknown ids from uncoveredCoverageItemIds", () => {
    const coverageItems: TicketCoverageItem[] = [
      makeCoverageItem({ id: "coverage-brief-goals-1", text: "Offline note storage" }),
    ];

    const result: PlanResult = {
      phases: [
        {
          name: "Build",
          order: 1,
          tickets: [
            {
              title: "Add notes",
              description: "Notes.",
              acceptanceCriteria: [],
              fileTargets: [],
              coverageItemIds: ["coverage-brief-goals-1"],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: ["coverage-nonexistent-42"],
    };

    autoAssignMissingCoverageItems(result, coverageItems);
    expect(result.uncoveredCoverageItemIds).toEqual([]);
  });

  it("assigns multiple missing items to their best-matching tickets", () => {
    const coverageItems: TicketCoverageItem[] = [
      makeCoverageItem({ id: "c-1", text: "User authentication" }),
      makeCoverageItem({ id: "c-2", text: "Password reset flow" }),
      makeCoverageItem({ id: "c-3", text: "Note export as PDF" }),
    ];

    const result: PlanResult = {
      phases: [
        {
          name: "Auth",
          order: 1,
          tickets: [
            {
              title: "Build auth system",
              description: "Implement user authentication and password management.",
              acceptanceCriteria: ["Users can log in.", "Users can reset passwords."],
              fileTargets: [],
              coverageItemIds: [],
            },
          ],
        },
        {
          name: "Export",
          order: 2,
          tickets: [
            {
              title: "Add PDF export",
              description: "Export notes as PDF documents.",
              acceptanceCriteria: ["PDF downloads work."],
              fileTargets: [],
              coverageItemIds: [],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };

    const assigned = autoAssignMissingCoverageItems(result, coverageItems);
    expect(assigned).toBe(3);
    expect(result.phases[0].tickets[0].coverageItemIds).toContain("c-1");
    expect(result.phases[0].tickets[0].coverageItemIds).toContain("c-2");
    expect(result.phases[1].tickets[0].coverageItemIds).toContain("c-3");
  });

  it("returns 0 when there are no coverage items", () => {
    const result: PlanResult = {
      phases: [
        {
          name: "Build",
          order: 1,
          tickets: [
            {
              title: "Add notes",
              description: "Notes.",
              acceptanceCriteria: [],
              fileTargets: [],
              coverageItemIds: [],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };

    const assigned = autoAssignMissingCoverageItems(result, []);
    expect(assigned).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/app/test/coverage-auto-repair.test.ts`
Expected: FAIL -- module not found

- [ ] **Step 3: Implement `autoAssignMissingCoverageItems`**

The matching strategy uses word overlap scoring: tokenize the coverage item text and each ticket's title + description + acceptance criteria into lowercase words, then count shared words. The ticket with the highest overlap wins.

```typescript
// packages/app/src/planner/internal/coverage-auto-repair.ts
import type { TicketCoverageItem } from "../../types/entities.js";
import type { PlanResult, PlanTicketStub } from "../types.js";

const WORD_PATTERN = /[a-z0-9]+/gi;

const tokenize = (text: string): Set<string> =>
  new Set((text.toLowerCase().match(WORD_PATTERN) ?? []).filter((word) => word.length > 2));

const scoreTicketMatch = (coverageTokens: Set<string>, ticket: PlanTicketStub): number => {
  const ticketText = [
    ticket.title,
    ticket.description,
    ...ticket.acceptanceCriteria,
  ].join(" ");
  const ticketTokens = tokenize(ticketText);

  let overlap = 0;
  for (const token of coverageTokens) {
    if (ticketTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
};

/**
 * Mutates `result` to fix coverage mapping issues:
 * 1. Removes unknown coverage item IDs from tickets and uncoveredCoverageItemIds
 * 2. Assigns unmatched coverage items to the best-matching ticket by word overlap
 *
 * Returns the number of coverage items auto-assigned.
 */
export const autoAssignMissingCoverageItems = (
  result: PlanResult,
  coverageItems: TicketCoverageItem[],
): number => {
  if (coverageItems.length === 0) {
    return 0;
  }

  const knownIds = new Set(coverageItems.map((item) => item.id));
  const allTickets: PlanTicketStub[] = result.phases.flatMap((phase) => phase.tickets);

  // Strip unknown IDs from tickets
  for (const ticket of allTickets) {
    ticket.coverageItemIds = ticket.coverageItemIds.filter((id) => knownIds.has(id));
  }

  // Strip unknown IDs from uncoveredCoverageItemIds
  result.uncoveredCoverageItemIds = result.uncoveredCoverageItemIds.filter((id) =>
    knownIds.has(id)
  );

  // Find unmatched coverage items
  const assignedIds = new Set<string>();
  for (const ticket of allTickets) {
    for (const id of ticket.coverageItemIds) {
      assignedIds.add(id);
    }
  }

  const uncoveredIds = new Set(result.uncoveredCoverageItemIds);
  const unmatchedItems = coverageItems.filter(
    (item) => !assignedIds.has(item.id) && !uncoveredIds.has(item.id)
  );

  if (unmatchedItems.length === 0 || allTickets.length === 0) {
    return 0;
  }

  // Auto-assign each unmatched item to the best-matching ticket
  let assignedCount = 0;
  for (const item of unmatchedItems) {
    const itemTokens = tokenize(item.text);
    let bestTicket: PlanTicketStub | null = null;
    let bestScore = 0;

    for (const ticket of allTickets) {
      const score = scoreTicketMatch(itemTokens, ticket);
      if (score > bestScore) {
        bestScore = score;
        bestTicket = ticket;
      }
    }

    // Assign to best match, or to the first ticket as fallback
    const target = bestTicket ?? allTickets[0];
    target.coverageItemIds.push(item.id);
    assignedCount += 1;
  }

  return assignedCount;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/app/test/coverage-auto-repair.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/planner/internal/coverage-auto-repair.ts packages/app/test/coverage-auto-repair.test.ts
git commit -m "Add autoAssignMissingCoverageItems for programmatic coverage repair"
```

---

### Task 3: Wire both functions into the validation pipeline

**Files:**
- Modify: `packages/app/src/planner/internal/planner-service-plans.ts:141-143` (the `validateResult` callback in both `resolveValidatedPlanResult` calls)

The `validateResult` callback currently does:
```typescript
validateResult: (nextResult) => {
  validatePlanResult(nextResult);
  validateCoverageMappings(nextResult, coverageInput.items);
},
```

Change it to normalize first, then auto-repair coverage, then validate. This means the first attempt is far more likely to pass, and the LLM retry loop is reserved for genuinely broken output.

- [ ] **Step 1: Write integration tests for the combined pipeline**

Add to the existing `packages/app/test/plan-generation-validation.test.ts`:

```typescript
// Add these imports at the top:
import { normalizePlanResult } from "../src/planner/internal/plan-normalizer.js";
import { autoAssignMissingCoverageItems } from "../src/planner/internal/coverage-auto-repair.js";

// Add a new describe block:
describe("normalization + auto-repair pipeline", () => {
  it("passes validation after normalizing title case and auto-assigning coverage", async () => {
    const items = [
      {
        id: "coverage-brief-goals-1",
        sourceStep: "brief" as const,
        sectionKey: "goals",
        sectionLabel: "Goals",
        kind: "goal",
        text: "Offline note storage",
      },
    ];

    const llmResult: PlanResult = {
      phases: [
        {
          name: "Project Setup",
          order: 1,
          tickets: [
            {
              title: "Implement Offline Storage",
              description: "Store notes & sync them offline.",
              acceptanceCriteria: ["Notes persist."],
              fileTargets: ["src/storage.ts"],
              coverageItemIds: [],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };

    const executePlan = vi
      .fn<(planInput: PlanInput) => Promise<PlanResult>>()
      .mockResolvedValueOnce(llmResult);
    const executePlanRepair = vi
      .fn<(planInput: PlanInput) => Promise<PlanResult>>();

    const result = await resolveValidatedPlanResult({
      planInput: { ...basePlanInput, coverageItems: items },
      executePlan,
      executePlanRepair,
      validateResult: (nextResult) => {
        normalizePlanResult(nextResult);
        validatePlanResult(nextResult);
        autoAssignMissingCoverageItems(nextResult, items);
        validateCoverageMappings(nextResult, items);
      },
    });

    expect(result.phases[0].name).toBe("Project setup");
    expect(result.phases[0].tickets[0].title).toBe("Implement offline storage");
    expect(result.phases[0].tickets[0].description).toBe("Store notes and sync them offline.");
    expect(result.phases[0].tickets[0].coverageItemIds).toEqual(["coverage-brief-goals-1"]);
    expect(executePlan).toHaveBeenCalledTimes(1);
    expect(executePlanRepair).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npx vitest run packages/app/test/plan-generation-validation.test.ts`
Expected: The new test FAILS because `planner-service-plans.ts` does not yet call `normalizePlanResult` or `autoAssignMissingCoverageItems`. The test itself calls them directly, so it should PASS. Verify the unit test works.

- [ ] **Step 3: Wire into `planner-service-plans.ts`**

In `packages/app/src/planner/internal/planner-service-plans.ts`, update both `validateResult` callbacks.

Add imports at the top:
```typescript
import { normalizePlanResult } from "./plan-normalizer.js";
import { autoAssignMissingCoverageItems } from "./coverage-auto-repair.js";
```

Replace the first `validateResult` callback (around line 141):
```typescript
// Before:
validateResult: (nextResult) => {
  validatePlanResult(nextResult);
  validateCoverageMappings(nextResult, coverageInput.items);
},

// After:
validateResult: (nextResult) => {
  normalizePlanResult(nextResult);
  validatePlanResult(nextResult);
  autoAssignMissingCoverageItems(nextResult, coverageInput.items);
  validateCoverageMappings(nextResult, coverageInput.items);
},
```

Replace the second `validateResult` callback (around line 233, in the review-repair block):
```typescript
// Before:
validateResult: (nextResult) => {
  validatePlanResult(nextResult);
  validateCoverageMappings(nextResult, coverageInput.items);
},

// After:
validateResult: (nextResult) => {
  normalizePlanResult(nextResult);
  validatePlanResult(nextResult);
  autoAssignMissingCoverageItems(nextResult, coverageInput.items);
  validateCoverageMappings(nextResult, coverageInput.items);
},
```

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All 320+ tests pass, including the new integration test.

- [ ] **Step 5: Run full check**

Run: `npm run check`
Expected: Clean (lint + tsc + UI dedupe gate)

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/planner/internal/planner-service-plans.ts packages/app/test/plan-generation-validation.test.ts
git commit -m "Wire plan normalization and coverage auto-repair into validation pipeline"
```

---

### Task 4: Remove redundant downstream normalization

**Files:**
- Modify: `packages/app/src/planner/internal/plan-job.ts:89` (remove redundant `normalizePhaseName` call)

Since `normalizePlanResult` now normalizes phase names before validation, the `normalizePhaseName` call in `commitPendingTicketPlanArtifact` at line 89 is redundant. The data is already normalized by the time it reaches commit. Remove it to avoid confusion about where normalization happens.

Note: `createTicketFromDraft` in `ticket-factory.ts:30` also calls `normalizeTicketTitle`. This one should stay because `createTicketFromDraft` is called from other paths (triage, not just plan generation). The plan normalizer only runs in the plan validation pipeline.

- [ ] **Step 1: Verify `normalizePhaseName` is only called in plan-job.ts for the plan pipeline path**

Check that `normalizePhaseName` in `plan-job.ts:89` is inside `commitPendingTicketPlanArtifact`, which is only reached after `runPlanJob` succeeds (i.e., after normalization already ran).

- [ ] **Step 2: Remove the redundant call**

In `packages/app/src/planner/internal/plan-job.ts`, line 89:
```typescript
// Before:
name: normalizePhaseName(phase.name),

// After:
name: phase.name,
```

Remove the unused import of `normalizePhaseName` from line 10.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Run full check**

Run: `npm run check`
Expected: Clean.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/planner/internal/plan-job.ts
git commit -m "Remove redundant normalizePhaseName from plan commit (now handled upstream)"
```
