import { describe, expect, it, vi } from "vitest";
import {
  continueInitiativeArtifactStep,
  continueInitiativeValidation,
} from "../src/runtime/handlers/initiative-continue-handlers.js";
import type {
  Initiative,
  PlanningReviewArtifact,
} from "../src/types/entities.js";
import type { SpecFlowRuntime } from "../src/runtime/types.js";

const createInitiative = (): Initiative => ({
  id: "initiative-12345678",
  title: "Notes",
  description: "Build a desktop notes app.",
  projectRoot: "/tmp/specflow",
  status: "draft",
  phases: [],
  specIds: [],
  ticketIds: [],
  workflow: {
    activeStep: "core-flows",
    steps: {
      brief: { status: "complete", updatedAt: "2026-03-22T08:00:00.000Z" },
      "core-flows": { status: "ready", updatedAt: null },
      prd: { status: "ready", updatedAt: null },
      "tech-spec": { status: "ready", updatedAt: null },
      validation: { status: "ready", updatedAt: null },
      tickets: { status: "locked", updatedAt: null },
    },
    refinements: {
      brief: {
        questions: [],
        history: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: "2026-03-22T08:00:00.000Z",
      },
      "core-flows": {
        questions: [
          {
            id: "core-entry",
            label: "Where should note capture start?",
            type: "select",
            whyThisBlocks: "The core flow needs one primary entry.",
            affectedArtifact: "core-flows",
            decisionType: "journey",
            assumptionIfUnanswered: "Start in the notes list.",
            options: ["Open in capture", "Open in list"],
            recommendedOption: "Open in capture",
            allowCustomAnswer: false,
          },
        ],
        history: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: null,
      },
      prd: {
        questions: [],
        history: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: null,
      },
      "tech-spec": {
        questions: [],
        history: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: null,
      },
    },
  },
  createdAt: "2026-03-22T08:00:00.000Z",
  updatedAt: "2026-03-22T08:00:00.000Z",
});

const createRuntime = (initiative: Initiative) => {
  const initiatives = new Map([[initiative.id, initiative]]);
  const runPhaseCheckJob = vi.fn();
  const runCoreFlowsJob = vi.fn();
  const runPlanJob = vi.fn();

  const runtime = {
    rootDir: "/tmp/specflow",
    store: {
      initiatives,
      specs: new Map(),
      tickets: new Map(),
      planningReviews: new Map(),
      upsertInitiative: vi.fn(async (updated: Initiative) => {
        initiatives.set(updated.id, updated);
      }),
    },
    plannerService: {
      runPhaseCheckJob,
      runCoreFlowsJob,
      runPlanJob,
      toStructuredError: (error: unknown) => ({
        code: "planner_error",
        message: (error as Error).message,
        statusCode: 500,
      }),
    },
  } as unknown as SpecFlowRuntime;

  return {
    runtime,
    initiatives,
    runPhaseCheckJob,
    runCoreFlowsJob,
    runPlanJob,
  };
};

describe("initiative continuation handlers", () => {
  it("persists the supplied artifact draft before running the combined continue flow", async () => {
    const initiative = createInitiative();
    const { runtime, initiatives, runPhaseCheckJob, runCoreFlowsJob } =
      createRuntime(initiative);

    runPhaseCheckJob.mockResolvedValue({
      decision: "proceed",
      questions: [],
      assumptions: ["Capture first"],
    });
    runCoreFlowsJob.mockResolvedValue({
      markdown: "# Core flows",
      reviews: [],
    });

    const result = await continueInitiativeArtifactStep(
      runtime,
      initiative.id,
      "core-flows",
      {
        draft: {
          answers: {
            "core-entry": "Open in capture",
          },
          defaultAnswerQuestionIds: [],
          preferredSurface: "questions",
        },
      }
    );

    expect(initiatives.get(initiative.id)?.workflow.refinements["core-flows"].answers).toEqual({
      "core-entry": "Open in capture",
    });
    expect(runPhaseCheckJob).toHaveBeenCalledTimes(1);
    expect(runCoreFlowsJob).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      decision: "proceed",
      generated: true,
      markdown: "# Core flows",
    });
  });

  it("persists validation drafts before rerunning blockers and generating tickets", async () => {
    const initiative = createInitiative();
    initiative.workflow.activeStep = "validation";
    initiative.workflow.steps["core-flows"] = {
      status: "complete",
      updatedAt: "2026-03-22T08:10:00.000Z",
    };
    initiative.workflow.steps.prd = {
      status: "complete",
      updatedAt: "2026-03-22T08:20:00.000Z",
    };
    initiative.workflow.steps["tech-spec"] = {
      status: "complete",
      updatedAt: "2026-03-22T08:30:00.000Z",
    };
    initiative.workflow.steps.validation = {
      status: "ready",
      updatedAt: null,
    };
    const { runtime, initiatives, runPhaseCheckJob, runPlanJob } =
      createRuntime(initiative);

    runPhaseCheckJob.mockResolvedValue({
      decision: "proceed",
      questions: [],
      assumptions: ["Use server timestamps"],
    });
    runPlanJob.mockResolvedValue({
      phases: [
        {
          name: "Phase 1",
          order: 1,
          tickets: [],
        },
      ],
      uncoveredCoverageItemIds: [],
    });

    const result = await continueInitiativeValidation(runtime, initiative.id, {
      draftByStep: {
        "tech-spec": {
          answers: {
            "validation-lww-source": "Use server timestamps",
          },
          defaultAnswerQuestionIds: [],
          preferredSurface: "questions",
        },
      },
      validationFeedbackByStep: {
        "tech-spec": "Pick the authoritative timestamp source before ticket generation.",
      },
      validationFeedback: "Pick the authoritative timestamp source before ticket generation.",
    });

    expect(initiatives.get(initiative.id)?.workflow.refinements["tech-spec"].answers).toEqual({
      "validation-lww-source": "Use server timestamps",
    });
    expect(runPhaseCheckJob).toHaveBeenCalledTimes(1);
    expect(runPhaseCheckJob).toHaveBeenCalledWith(
      {
        initiativeId: initiative.id,
        step: "tech-spec",
        validationFeedback:
          "Pick the authoritative timestamp source before ticket generation.",
      },
      undefined,
      undefined
    );
    expect(runPlanJob).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      decision: "proceed",
      generated: true,
      blockedSteps: [],
      phases: [
        {
          name: "Phase 1",
          order: 1,
          tickets: [],
        },
      ],
    });
  });

  it("reruns validation questions immediately when ticket review still blocks after plan generation", async () => {
    const initiative = createInitiative();
    initiative.workflow.activeStep = "validation";
    initiative.workflow.steps["core-flows"] = {
      status: "complete",
      updatedAt: "2026-03-22T08:10:00.000Z",
    };
    initiative.workflow.steps.prd = {
      status: "complete",
      updatedAt: "2026-03-22T08:20:00.000Z",
    };
    initiative.workflow.steps["tech-spec"] = {
      status: "complete",
      updatedAt: "2026-03-22T08:30:00.000Z",
    };
    initiative.workflow.steps.validation = {
      status: "ready",
      updatedAt: null,
    };

    const { runtime, runPhaseCheckJob, runPlanJob } = createRuntime(initiative);
    const blockedReview: PlanningReviewArtifact = {
      id: `${initiative.id}:ticket-coverage-review`,
      initiativeId: initiative.id,
      kind: "ticket-coverage-review",
      status: "blocked",
      summary: "Validation needs one remaining tech spec decision.",
      findings: [
        {
          id: "finding-1",
          type: "blocker",
          message: "Pick the authoritative timestamp source before ticket generation.",
          relatedArtifacts: ["tech-spec"],
        },
      ],
      sourceUpdatedAts: {
        validation: "2026-03-22T08:40:00.000Z",
      },
      overrideReason: null,
      reviewedAt: "2026-03-22T08:40:00.000Z",
      updatedAt: "2026-03-22T08:40:00.000Z",
    };

    runPhaseCheckJob
      .mockResolvedValueOnce({
        decision: "proceed",
        questions: [],
        assumptions: [],
      })
      .mockResolvedValueOnce({
        decision: "proceed",
        questions: [],
        assumptions: [],
      })
      .mockResolvedValueOnce({
        decision: "proceed",
        questions: [],
        assumptions: [],
      })
      .mockResolvedValueOnce({
        decision: "proceed",
        questions: [],
        assumptions: [],
      })
      .mockResolvedValueOnce({
        decision: "ask",
        questions: [
          {
            id: "tech-spec-timestamp-source",
            label: "Which timestamp source should autosave trust?",
            type: "select",
            whyThisBlocks: "The ticket plan needs one authoritative timestamp rule.",
            affectedArtifact: "tech-spec",
            decisionType: "architecture",
            assumptionIfUnanswered: "Use one local monotonic source.",
            options: ["One local monotonic source", "Filesystem mtime"],
            recommendedOption: "One local monotonic source",
            allowCustomAnswer: false,
          },
        ],
        assumptions: [],
      });
    runPlanJob.mockImplementation(async () => {
      runtime.store.planningReviews.set(blockedReview.id, blockedReview);
      return {
        phases: [
          {
            name: "Phase 1",
            order: 1,
            tickets: [],
          },
        ],
        uncoveredCoverageItemIds: [],
      };
    });

    const result = await continueInitiativeValidation(runtime, initiative.id, {
      draftByStep: {},
      validationFeedbackByStep: {},
      validationFeedback: null,
    });

    expect(runPlanJob).toHaveBeenCalledTimes(1);
    expect(runPhaseCheckJob).toHaveBeenCalledTimes(5);
    expect(runPhaseCheckJob).toHaveBeenNthCalledWith(
      5,
      {
        initiativeId: initiative.id,
        step: "tech-spec",
        validationFeedback: "Pick the authoritative timestamp source before ticket generation.",
      },
      undefined,
      undefined
    );
    expect(result).toMatchObject({
      decision: "ask",
      generated: false,
      blockedSteps: ["tech-spec"],
    });
  });

  it("suppresses paraphrased validation re-asks after a submitted answer and falls back to the blocked summary", async () => {
    const initiative = createInitiative();
    initiative.workflow.activeStep = "validation";
    initiative.workflow.steps["core-flows"] = {
      status: "complete",
      updatedAt: "2026-03-22T08:10:00.000Z",
    };
    initiative.workflow.steps.prd = {
      status: "complete",
      updatedAt: "2026-03-22T08:20:00.000Z",
    };
    initiative.workflow.steps["tech-spec"] = {
      status: "complete",
      updatedAt: "2026-03-22T08:30:00.000Z",
    };
    initiative.workflow.steps.validation = {
      status: "ready",
      updatedAt: null,
    };
    initiative.workflow.refinements["tech-spec"] = {
      questions: [
        {
          id: "tech-safe-logging-policy",
          label: "Which safe-logging policy should the PRD mandate for v1?",
          type: "select",
          whyThisBlocks: "Validation needs one logging rule before the ticket plan is safe.",
          affectedArtifact: "tech-spec",
          decisionType: "operations",
          assumptionIfUnanswered: "Never log note content.",
          options: ["Never log note content", "Allow note titles in logs"],
          recommendedOption: "Never log note content",
          allowCustomAnswer: false,
        },
      ],
      history: [
        {
          id: "tech-safe-logging-policy",
          label: "Which safe-logging policy should the PRD mandate for v1?",
          type: "select",
          whyThisBlocks: "Validation needs one logging rule before the ticket plan is safe.",
          affectedArtifact: "tech-spec",
          decisionType: "operations",
          assumptionIfUnanswered: "Never log note content.",
          options: ["Never log note content", "Allow note titles in logs"],
          recommendedOption: "Never log note content",
          allowCustomAnswer: false,
        },
      ],
      answers: {},
      defaultAnswerQuestionIds: [],
      baseAssumptions: [],
      preferredSurface: "questions",
      checkedAt: "2026-03-22T08:30:00.000Z",
    };

    const { runtime, initiatives, runPhaseCheckJob, runPlanJob } = createRuntime(initiative);
    const blockedReview: PlanningReviewArtifact = {
      id: `${initiative.id}:ticket-coverage-review`,
      initiativeId: initiative.id,
      kind: "ticket-coverage-review",
      status: "blocked",
      summary: "Validation still needs a logging decision before tickets can commit.",
      findings: [
        {
          id: "finding-1",
          type: "blocker",
          message: "Clarify the safe-logging rule before ticket generation.",
          relatedArtifacts: ["tech-spec"],
        },
      ],
      sourceUpdatedAts: {
        validation: "2026-03-22T08:40:00.000Z",
      },
      overrideReason: null,
      reviewedAt: "2026-03-22T08:40:00.000Z",
      updatedAt: "2026-03-22T08:40:00.000Z",
    };

    runPhaseCheckJob
      .mockResolvedValueOnce({
        decision: "proceed",
        questions: [],
        assumptions: [],
      })
      .mockResolvedValueOnce({
        decision: "proceed",
        questions: [],
        assumptions: [],
      })
      .mockResolvedValueOnce({
        decision: "proceed",
        questions: [],
        assumptions: [],
      })
      .mockResolvedValueOnce({
        decision: "ask",
        questions: [
          {
            id: "tech-safe-logging-policy-follow-up",
            label: "Which safe logging policy should the PRD mandate for v1?",
            type: "select",
            whyThisBlocks: "Validation needs one logging rule before the ticket plan is safe.",
            affectedArtifact: "tech-spec",
            decisionType: "operations",
            assumptionIfUnanswered: "Never log note content.",
            options: ["Never log note content", "Allow note titles in logs"],
            recommendedOption: "Never log note content",
            allowCustomAnswer: false,
            reopensQuestionIds: ["tech-safe-logging-policy"],
          },
        ],
        assumptions: [],
      })
      .mockResolvedValueOnce({
        decision: "ask",
        questions: [
          {
            id: "tech-safe-logging-policy-review-loop",
            label: "Which safe logging policy should the PRD mandate for v1?",
            type: "select",
            whyThisBlocks: "Validation needs one logging rule before the ticket plan is safe.",
            affectedArtifact: "tech-spec",
            decisionType: "operations",
            assumptionIfUnanswered: "Never log note content.",
            options: ["Never log note content", "Allow note titles in logs"],
            recommendedOption: "Never log note content",
            allowCustomAnswer: false,
            reopensQuestionIds: ["tech-safe-logging-policy"],
          },
        ],
        assumptions: [],
      });
    runPlanJob.mockImplementation(async () => {
      runtime.store.planningReviews.set(blockedReview.id, blockedReview);
      return {
        phases: [
          {
            name: "Phase 1",
            order: 1,
            tickets: [],
          },
        ],
        uncoveredCoverageItemIds: [],
      };
    });

    const result = await continueInitiativeValidation(runtime, initiative.id, {
      draftByStep: {
        "tech-spec": {
          answers: {
            "tech-safe-logging-policy": "Never log note content",
          },
          defaultAnswerQuestionIds: [],
          preferredSurface: "questions",
        },
      },
      validationFeedbackByStep: {},
      validationFeedback: null,
    });

    expect(result).toMatchObject({
      decision: "ask",
      generated: false,
      blockedSteps: [],
    });
    expect(initiatives.get(initiative.id)?.workflow.refinements["tech-spec"].questions).toEqual([]);
    expect(
      initiatives.get(initiative.id)?.workflow.refinements["tech-spec"].history?.map((question) => question.id),
    ).toEqual(["tech-safe-logging-policy"]);
    expect(initiatives.get(initiative.id)?.workflow.refinements["tech-spec"].preferredSurface).toBe("review");
  });

  it("keeps a genuinely narrower validation follow-up after a submitted answer", async () => {
    const initiative = createInitiative();
    initiative.workflow.activeStep = "validation";
    initiative.workflow.steps["core-flows"] = {
      status: "complete",
      updatedAt: "2026-03-22T08:10:00.000Z",
    };
    initiative.workflow.steps.prd = {
      status: "complete",
      updatedAt: "2026-03-22T08:20:00.000Z",
    };
    initiative.workflow.steps["tech-spec"] = {
      status: "complete",
      updatedAt: "2026-03-22T08:30:00.000Z",
    };
    initiative.workflow.steps.validation = {
      status: "ready",
      updatedAt: null,
    };
    initiative.workflow.refinements["tech-spec"] = {
      questions: [
        {
          id: "tech-safe-logging-policy",
          label: "Which safe-logging policy should the PRD mandate for v1?",
          type: "select",
          whyThisBlocks: "Validation needs one logging rule before the ticket plan is safe.",
          affectedArtifact: "tech-spec",
          decisionType: "operations",
          assumptionIfUnanswered: "Never log note content.",
          options: ["Never log note content", "Allow note titles in logs"],
          recommendedOption: "Never log note content",
          allowCustomAnswer: false,
        },
      ],
      history: [
        {
          id: "tech-safe-logging-policy",
          label: "Which safe-logging policy should the PRD mandate for v1?",
          type: "select",
          whyThisBlocks: "Validation needs one logging rule before the ticket plan is safe.",
          affectedArtifact: "tech-spec",
          decisionType: "operations",
          assumptionIfUnanswered: "Never log note content.",
          options: ["Never log note content", "Allow note titles in logs"],
          recommendedOption: "Never log note content",
          allowCustomAnswer: false,
        },
      ],
      answers: {},
      defaultAnswerQuestionIds: [],
      baseAssumptions: [],
      preferredSurface: "questions",
      checkedAt: "2026-03-22T08:30:00.000Z",
    };

    const narrowerQuestion = {
      id: "tech-safe-logging-debug-builds",
      label:
        "In developer-only debug builds, may logs include note titles while production still logs no note content?",
      type: "select" as const,
      whyThisBlocks:
        "Validation needs the debug-build logging exception before the ticket plan can lock support diagnostics safely.",
      affectedArtifact: "tech-spec" as const,
      decisionType: "operations" as const,
      assumptionIfUnanswered: "Use metadata-only logs in every build.",
      options: [
        "No, metadata-only in every build",
        "Yes, note titles in debug builds only",
      ],
      recommendedOption: "No, metadata-only in every build",
      allowCustomAnswer: false,
      reopensQuestionIds: ["tech-safe-logging-policy"],
    };

    const { runtime, initiatives, runPhaseCheckJob, runPlanJob } = createRuntime(initiative);
    runPhaseCheckJob.mockImplementationOnce(async () => {
      const current = initiatives.get(initiative.id)!;
      current.workflow.refinements["tech-spec"] = {
        ...current.workflow.refinements["tech-spec"],
        questions: [narrowerQuestion],
        history: [
          ...(current.workflow.refinements["tech-spec"].history ?? []),
          narrowerQuestion,
        ],
        preferredSurface: "questions",
      };
      initiatives.set(current.id, current);

      return {
        decision: "ask",
        questions: [narrowerQuestion],
        assumptions: [],
      };
    });

    const result = await continueInitiativeValidation(runtime, initiative.id, {
      draftByStep: {
        "tech-spec": {
          answers: {
            "tech-safe-logging-policy": "Never log note content",
          },
          defaultAnswerQuestionIds: [],
          preferredSurface: "questions",
        },
      },
      validationFeedbackByStep: {
        "tech-spec": "Clarify the debug-build logging exception before ticket generation.",
      },
      validationFeedback: "Clarify the debug-build logging exception before ticket generation.",
    });

    expect(result).toMatchObject({
      decision: "ask",
      generated: false,
      blockedSteps: ["tech-spec"],
    });
    expect(runPlanJob).not.toHaveBeenCalled();
    expect(initiatives.get(initiative.id)?.workflow.refinements["tech-spec"].questions).toEqual([
      narrowerQuestion,
    ]);
    expect(
      initiatives.get(initiative.id)?.workflow.refinements["tech-spec"].history?.map((question) => question.id),
    ).toEqual(["tech-safe-logging-policy", "tech-safe-logging-debug-builds"]);
    expect(initiatives.get(initiative.id)?.workflow.refinements["tech-spec"].preferredSurface).toBe(
      "questions",
    );
  });
});
