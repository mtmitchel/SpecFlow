import { describe, expect, it, vi } from "vitest";
import {
  continueInitiativeArtifactStep,
  continueInitiativeValidation,
} from "../src/runtime/handlers/initiative-continue-handlers.js";
import type { Initiative } from "../src/types/entities.js";
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
});
