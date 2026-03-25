import { describe, expect, it } from "vitest";
import { getRefinementHistory } from "../src/planner/internal/context.js";
import {
  completeWorkflowStep,
  createInitiativeWorkflow,
  updateRefinementState,
} from "../src/planner/workflow-state.js";
import type { Initiative } from "../src/types/entities.js";

describe("refinement history persistence", () => {
  it("preserves asked questions after a phase completes", () => {
    const workflowWithQuestions = updateRefinementState(createInitiativeWorkflow(), "brief", {
      questions: [
        {
          id: "brief-problem",
          label: "What needs to get better first?",
          type: "select",
          whyThisBlocks: "The brief needs one primary problem before it can define scope.",
          affectedArtifact: "brief",
          decisionType: "problem",
          assumptionIfUnanswered: "Focus on the primary user problem.",
          options: ["Automate work", "Replace an existing workflow"],
          recommendedOption: null,
          allowCustomAnswer: true,
        },
      ],
      answers: {
        "brief-problem": "Automate work",
      },
      preferredSurface: "questions",
      checkedAt: "2026-03-18T10:00:00.000Z",
    });

    const completedWorkflow = completeWorkflowStep(
      workflowWithQuestions,
      "brief",
      "2026-03-18T10:05:00.000Z",
    );

    expect(completedWorkflow.refinements.brief.questions).toEqual([]);
    expect(completedWorkflow.refinements.brief.history).toHaveLength(1);
    expect(completedWorkflow.refinements.brief.preferredSurface).toBe("review");

    const initiative: Initiative = {
      id: "initiative-1",
      title: "Reliable sync",
      description: "Build reliable sync for field notes.",
      status: "active",
      phases: [],
      specIds: ["initiative-1:brief"],
      ticketIds: [],
      workflow: completedWorkflow,
      createdAt: "2026-03-18T09:50:00.000Z",
      updatedAt: "2026-03-18T10:05:00.000Z",
    };

    expect(getRefinementHistory(initiative, "brief")).toEqual([
      expect.objectContaining({
        step: "brief",
        questionId: "brief-problem",
        label: "What needs to get better first?",
        resolution: "answered",
        answer: "Automate work",
      }),
    ]);
  });
});
