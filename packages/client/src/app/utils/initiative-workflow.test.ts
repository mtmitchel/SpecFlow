import { describe, expect, it } from "vitest";
import type { InitiativeWorkflow, PlanningReviewArtifact } from "../../types.js";
import { canOpenInitiativeStep } from "./initiative-workflow.js";

const workflow: InitiativeWorkflow = {
  activeStep: "validation",
  steps: {
    brief: { status: "complete", updatedAt: "2026-03-16T10:00:00.000Z" },
    "core-flows": { status: "complete", updatedAt: "2026-03-16T10:10:00.000Z" },
    prd: { status: "complete", updatedAt: "2026-03-16T10:20:00.000Z" },
    "tech-spec": { status: "complete", updatedAt: "2026-03-16T10:30:00.000Z" },
    validation: { status: "ready", updatedAt: "2026-03-16T10:35:00.000Z" },
    tickets: { status: "ready", updatedAt: "2026-03-16T10:40:00.000Z" },
  },
  refinements: {
    brief: { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
    "core-flows": { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
    prd: { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
    "tech-spec": { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
  },
  resumeTicketId: null,
};

describe("canOpenInitiativeStep", () => {
  it("keeps blocked validation openable so the user can review it", () => {
    const blockedValidationReview: PlanningReviewArtifact = {
      id: "initiative-12345678:ticket-coverage-review",
      initiativeId: "initiative-12345678",
      kind: "ticket-coverage-review",
      status: "blocked",
      summary: "Coverage gaps remain.",
      findings: [],
      sourceUpdatedAts: { validation: "2026-03-16T10:35:00.000Z" },
      overrideReason: null,
      reviewedAt: "2026-03-16T10:45:00.000Z",
      updatedAt: "2026-03-16T10:45:00.000Z",
    };

    expect(
      canOpenInitiativeStep(
        workflow,
        [blockedValidationReview],
        "initiative-12345678",
        "validation",
      ),
    ).toBe(true);
  });
});
