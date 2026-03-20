import { describe, expect, it } from "vitest";
import type {
  Initiative,
  PlanningReviewArtifact,
  SpecDocumentSummary,
} from "../../../types.js";
import { resolveInitiativePlanningRouteState } from "./planning-route-state.js";

const baseInitiative: Initiative = {
  id: "initiative-12345678",
  title: "Linux notes",
  description: "Offline-first notes for Fedora.",
  status: "active",
  phases: [{ id: "phase-1", name: "Foundation", order: 1, status: "active" }],
  specIds: [],
  ticketIds: ["ticket-12345678"],
  workflow: {
    activeStep: "tickets",
    steps: {
      brief: { status: "complete", updatedAt: "2026-03-16T10:00:00.000Z" },
      "core-flows": { status: "complete", updatedAt: "2026-03-16T10:10:00.000Z" },
      prd: { status: "complete", updatedAt: "2026-03-16T10:20:00.000Z" },
      "tech-spec": { status: "complete", updatedAt: "2026-03-16T10:30:00.000Z" },
      validation: { status: "complete", updatedAt: "2026-03-16T10:35:00.000Z" },
      tickets: { status: "ready", updatedAt: "2026-03-16T10:40:00.000Z" },
    },
    refinements: {
      brief: { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "core-flows": { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
    },
    resumeTicketId: null,
  },
  createdAt: "2026-03-16T10:00:00.000Z",
  updatedAt: "2026-03-16T10:40:00.000Z",
};

const emptySpecs: SpecDocumentSummary[] = [];

describe("resolveInitiativePlanningRouteState", () => {
  it("keeps an explicit validation route after validation completes", () => {
    const routeState = resolveInitiativePlanningRouteState({
      initiative: baseInitiative,
      planningReviews: [],
      requestedStep: "validation",
      requestedSurface: null,
      specSummaries: emptySpecs,
    });

    expect(routeState.activeStep).toBe("validation");
    expect(routeState.canonicalSearchParams.toString()).toBe("step=validation");
  });

  it("routes later requested steps back to blocked validation", () => {
    const blockedValidationReview: PlanningReviewArtifact = {
      id: `${baseInitiative.id}:ticket-coverage-review`,
      initiativeId: baseInitiative.id,
      kind: "ticket-coverage-review",
      status: "blocked",
      summary: "Coverage gaps remain.",
      findings: [],
      sourceUpdatedAts: { validation: "2026-03-16T10:35:00.000Z" },
      overrideReason: null,
      reviewedAt: "2026-03-16T10:45:00.000Z",
      updatedAt: "2026-03-16T10:45:00.000Z",
    };

    const routeState = resolveInitiativePlanningRouteState({
      initiative: baseInitiative,
      planningReviews: [blockedValidationReview],
      requestedStep: "tickets",
      requestedSurface: null,
      specSummaries: emptySpecs,
    });

    expect(routeState.activeStep).toBe("validation");
    expect(routeState.canonicalSearchParams.toString()).toBe("step=validation");
  });
});
