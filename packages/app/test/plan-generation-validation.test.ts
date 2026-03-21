import { describe, expect, it, vi } from "vitest";
import { resolveValidatedPlanResult } from "../src/planner/internal/plan-generation-job.js";
import {
  PlanValidationError,
  validateCoverageMappings,
} from "../src/planner/internal/plan-validation.js";
import type { PlanInput, PlanResult } from "../src/planner/types.js";
import {
  validatePhaseMarkdownResult,
  validatePlanResult,
  validateTriageResult,
} from "../src/planner/internal/validators.js";

const basePlanInput: PlanInput = {
  initiativeDescription: "Build a lightweight offline-first note-taking app",
  briefMarkdown: "# Brief",
  coreFlowsMarkdown: "# Core flows",
  prdMarkdown: "# PRD",
  techSpecMarkdown: "# Tech spec",
  coverageItems: []
};

const coverageItems = [
  {
    id: "coverage-brief-goals-1",
    sourceStep: "brief" as const,
    sectionKey: "goals",
    sectionLabel: "Goals",
    kind: "goal",
    text: "Preserve local note history.",
  },
];

const validPlanResult: PlanResult = {
  phases: [
    {
      name: "Build",
      order: 1,
      tickets: [
        {
          title: "Implement notes list",
          description: "Create the notes list surface.",
          acceptanceCriteria: ["The list renders saved notes."],
          fileTargets: ["packages/client/src/app/views/initiative-view.tsx"],
          coverageItemIds: ["coverage-1"]
        }
      ]
    }
  ],
  uncoveredCoverageItemIds: []
};

describe("resolveValidatedPlanResult", () => {
  it("retries once with validation feedback when the first plan result is invalid", async () => {
    const executePlan = vi
      .fn<(planInput: PlanInput) => Promise<PlanResult>>()
      .mockResolvedValueOnce({ uncoveredCoverageItemIds: [] } as PlanResult)
      .mockResolvedValueOnce(validPlanResult);
    const executePlanRepair = vi.fn<(planInput: PlanInput) => Promise<PlanResult>>();

    const result = await resolveValidatedPlanResult({
      planInput: basePlanInput,
      executePlan,
      executePlanRepair,
      validateResult: (planResult) => validatePlanResult(planResult)
    });

    expect(result).toEqual(validPlanResult);
    expect(executePlan).toHaveBeenCalledTimes(2);
    expect(executePlan).toHaveBeenNthCalledWith(1, basePlanInput);
    expect(executePlan).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining<Partial<PlanInput>>({
        validationFeedback: {
          summary: "Plan result missing phases array",
          issues: [],
        },
        previousInvalidResult: {
          uncoveredCoverageItemIds: [],
        },
      })
    );
    expect(executePlanRepair).not.toHaveBeenCalled();
  });

  it("throws the last validation error when the retry is still invalid", async () => {
    const executePlan = vi
      .fn<(planInput: PlanInput) => Promise<PlanResult>>()
      .mockResolvedValue({ uncoveredCoverageItemIds: [] } as PlanResult);
    const executePlanRepair = vi.fn<(planInput: PlanInput) => Promise<PlanResult>>();

    await expect(
      resolveValidatedPlanResult({
        planInput: basePlanInput,
        executePlan,
        executePlanRepair,
        validateResult: (planResult) => validatePlanResult(planResult)
      })
    ).rejects.toThrow("Plan result missing phases array");

    expect(executePlan).toHaveBeenCalledTimes(2);
    expect(executePlanRepair).not.toHaveBeenCalled();
  });

  it("captures structured missing-coverage issues for repair feedback", () => {
    const invalidPlanResult: PlanResult = {
      phases: [
        {
          name: "Build",
          order: 1,
          tickets: [
            {
              title: "Implement notes list",
              description: "Create the notes list surface.",
              acceptanceCriteria: ["The list renders saved notes."],
              fileTargets: ["packages/client/src/app/views/initiative-view.tsx"],
              coverageItemIds: [],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };

    let thrownError: unknown;
    try {
      validateCoverageMappings(invalidPlanResult, coverageItems);
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(PlanValidationError);
    expect((thrownError as PlanValidationError).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "ticket-missing-coverage",
          ticketTitle: "Implement notes list",
        }),
        expect.objectContaining({
          kind: "missing-coverage-item",
          coverageItemId: "coverage-brief-goals-1",
          message: "Missing Brief goal: Preserve local note history.",
          coverageItem: expect.objectContaining({
            text: "Preserve local note history.",
          }),
        }),
      ]),
    );
  });

  it("uses the focused repair job after a coverage validation failure", async () => {
    const invalidPlanResult: PlanResult = {
      phases: [
        {
          name: "Build",
          order: 1,
          tickets: [
            {
              title: "Implement notes list",
              description: "Create the notes list surface.",
              acceptanceCriteria: ["The list renders saved notes."],
              fileTargets: ["packages/client/src/app/views/initiative-view.tsx"],
              coverageItemIds: [],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };

    const executePlan = vi
      .fn<(planInput: PlanInput) => Promise<PlanResult>>()
      .mockResolvedValueOnce(invalidPlanResult);
    const executePlanRepair = vi
      .fn<(planInput: PlanInput) => Promise<PlanResult>>()
      .mockResolvedValueOnce({
        phases: [
          {
            name: "Build",
            order: 1,
            tickets: [
              {
                title: "Implement notes list",
                description: "Create the notes list surface.",
                acceptanceCriteria: ["The list renders saved notes."],
                fileTargets: ["packages/client/src/app/views/initiative-view.tsx"],
                coverageItemIds: ["coverage-brief-goals-1"],
              },
            ],
          },
        ],
        uncoveredCoverageItemIds: [],
      });

    const result = await resolveValidatedPlanResult({
      planInput: {
        ...basePlanInput,
        coverageItems,
      },
      executePlan,
      executePlanRepair,
      validateResult: (planResult) => {
        validatePlanResult(planResult);
        validateCoverageMappings(planResult, coverageItems);
      },
    });

    expect(result.phases[0]?.tickets[0]?.coverageItemIds).toEqual(["coverage-brief-goals-1"]);
    expect(executePlan).toHaveBeenCalledTimes(1);
    expect(executePlanRepair).toHaveBeenCalledTimes(1);
    expect(executePlanRepair).toHaveBeenCalledWith(
      expect.objectContaining<Partial<PlanInput>>({
        validationFeedback: expect.objectContaining({
          summary: expect.stringContaining("Missing Brief goal: Preserve local note history."),
        }),
        previousInvalidResult: invalidPlanResult,
      }),
    );
  });

  it("rejects phase and ticket titles that do not follow the short sentence-case contract", () => {
    const invalidPlanResult: PlanResult = {
      phases: [
        {
          name: "Project Setup",
          order: 1,
          tickets: [
            {
              title: "Fix Typo",
              description: "Create the repo scaffolding.",
              acceptanceCriteria: ["The repo scaffolding exists."],
              fileTargets: ["README.md"],
              coverageItemIds: [],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };

    expect(() => validatePlanResult(invalidPlanResult)).toThrow(
      'Phase name must use sentence case. Use "Project setup" instead of "Project Setup".',
    );
  });

  it("requires a compact initiativeTitle and sentence-case headings for brief generation", () => {
    expect(() =>
      validatePhaseMarkdownResult(
        {
          initiativeTitle: "Local Notes Workspace",
          markdown: "# Local notes workspace\n\n## Success criteria\n\nBody copy.",
          traceOutline: { sections: [] },
        },
        { requireInitiativeTitle: true },
      )
    ).toThrow('Project title must use sentence case. Use "Local notes workspace" instead of "Local Notes Workspace".');
  });

  it("rejects ampersands in generated markdown", () => {
    expect(() =>
      validatePhaseMarkdownResult(
        {
          initiativeTitle: "Local notes",
          markdown: "# Local notes\n\n## Goals and constraints\n\nCapture notes & sync changes.",
          traceOutline: { sections: [] },
        },
        { requireInitiativeTitle: true },
      )
    ).toThrow('Markdown must not use ampersands. Write "and" instead.');
  });

  it("rejects triage results with title-case task titles", () => {
    expect(() =>
      validateTriageResult({
        decision: "ok",
        reason: "Small task",
        ticketDraft: {
          title: "Fix Typo",
          description: "Fix the typo in docs.",
          acceptanceCriteria: ["Docs are updated."],
          implementationPlan: "Edit one file.",
          fileTargets: ["README.md"],
        },
      })
    ).toThrow('Ticket title must use sentence case. Use "Fix typo" instead of "Fix Typo".');
  });
});
