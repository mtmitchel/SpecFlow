import { describe, expect, it } from "vitest";
import type { ArtifactsSnapshot, Initiative, PlanningReviewArtifact, Ticket } from "../../types.js";
import { getInitiativeProgressModel } from "./initiative-progress.js";

const baseInitiative: Initiative = {
  id: "initiative-12345678",
  title: "Linux Notes",
  description: "Build a Linux-first notes app.",
  status: "active",
  phases: [],
  specIds: [],
  ticketIds: [],
  workflow: {
    activeStep: "brief",
    steps: {
      brief: { status: "ready", updatedAt: null },
      "core-flows": { status: "locked", updatedAt: null },
      prd: { status: "locked", updatedAt: null },
      "tech-spec": { status: "locked", updatedAt: null },
      tickets: { status: "locked", updatedAt: null },
    },
    refinements: {
      brief: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "core-flows": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
    },
  },
  createdAt: "2026-03-16T10:00:00.000Z",
  updatedAt: "2026-03-16T10:00:00.000Z",
};

const createSnapshot = ({
  initiative = baseInitiative,
  tickets = [],
  planningReviews = [],
}: {
  initiative?: Initiative;
  tickets?: Ticket[];
  planningReviews?: PlanningReviewArtifact[];
} = {}): ArtifactsSnapshot => ({
  config: null,
  initiatives: [initiative],
  tickets,
  runs: [],
  runAttempts: [],
  specs: [],
  planningReviews,
  ticketCoverageArtifacts: [],
});

describe("getInitiativeProgressModel", () => {
  it("keeps a fresh initiative at brief intake", () => {
    const progress = getInitiativeProgressModel(baseInitiative, createSnapshot());

    expect(progress.currentKey).toBe("brief");
    expect(progress.nodes[0]?.state).toBe("active");
    expect(progress.statusLabel).toBe("Continue to brief intake");
  });

  it("shows a planning checkpoint when brief review is unresolved", () => {
    const initiative: Initiative = {
      ...baseInitiative,
      workflow: {
        ...baseInitiative.workflow,
        steps: {
          ...baseInitiative.workflow.steps,
          brief: { status: "stale", updatedAt: "2026-03-16T10:05:00.000Z" },
          "core-flows": { status: "ready", updatedAt: "2026-03-16T10:06:00.000Z" },
        },
      },
    };

    const progress = getInitiativeProgressModel(
      initiative,
      createSnapshot({
        initiative,
        planningReviews: [
          {
            id: `${initiative.id}:brief-review`,
            initiativeId: initiative.id,
            kind: "brief-review",
            status: "blocked",
            summary: "The brief still needs work.",
            findings: [],
            sourceUpdatedAts: { brief: "2026-03-16T10:05:00.000Z" },
            overrideReason: null,
            reviewedAt: "2026-03-16T10:07:00.000Z",
            updatedAt: "2026-03-16T10:07:00.000Z",
          },
        ],
      }),
    );

    expect(progress.currentKey).toBe("brief");
    expect(progress.nodes.find((node) => node.key === "brief")?.state).toBe("checkpoint");
    expect(progress.statusLabel).toBe("Review brief");
  });

  it("keeps the initiative at tickets when coverage is unresolved", () => {
    const initiative: Initiative = {
      ...baseInitiative,
      workflow: {
        ...baseInitiative.workflow,
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T10:00:00.000Z" },
          "core-flows": { status: "complete", updatedAt: "2026-03-16T10:05:00.000Z" },
          prd: { status: "complete", updatedAt: "2026-03-16T10:10:00.000Z" },
          "tech-spec": { status: "complete", updatedAt: "2026-03-16T10:15:00.000Z" },
          tickets: { status: "stale", updatedAt: "2026-03-16T10:20:00.000Z" },
        },
      },
      ticketIds: ["ticket-12345678"],
    };
    const tickets: Ticket[] = [
      {
        id: "ticket-12345678",
        initiativeId: initiative.id,
        phaseId: null,
        title: "Create the shell",
        description: "Build the initial ticket shell.",
        status: "backlog",
        acceptanceCriteria: [],
        implementationPlan: "",
        fileTargets: [],
        coverageItemIds: [],
        blockedBy: [],
        blocks: [],
        runId: null,
        createdAt: "2026-03-16T10:22:00.000Z",
        updatedAt: "2026-03-16T10:22:00.000Z",
      },
    ];
    const progress = getInitiativeProgressModel(
      initiative,
      createSnapshot({
        initiative,
        tickets,
        planningReviews: [
          {
            id: `${initiative.id}:ticket-coverage-review`,
            initiativeId: initiative.id,
            kind: "ticket-coverage-review",
            status: "blocked",
            summary: "Coverage gaps remain.",
            findings: [],
            sourceUpdatedAts: { tickets: "2026-03-16T10:20:00.000Z" },
            overrideReason: null,
            reviewedAt: "2026-03-16T10:25:00.000Z",
            updatedAt: "2026-03-16T10:25:00.000Z",
          },
        ],
      }),
    );

    expect(progress.currentKey).toBe("tickets");
    expect(progress.nodes.find((node) => node.key === "tickets")?.state).toBe("checkpoint");
    expect(progress.statusLabel).toBe("Run coverage check");
  });

  it("moves into execute and verify based on ticket state", () => {
    const initiative: Initiative = {
      ...baseInitiative,
      workflow: {
        ...baseInitiative.workflow,
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T10:00:00.000Z" },
          "core-flows": { status: "complete", updatedAt: "2026-03-16T10:05:00.000Z" },
          prd: { status: "complete", updatedAt: "2026-03-16T10:10:00.000Z" },
          "tech-spec": { status: "complete", updatedAt: "2026-03-16T10:15:00.000Z" },
          tickets: { status: "complete", updatedAt: "2026-03-16T10:20:00.000Z" },
        },
      },
    };

    const buildTicket = (status: Ticket["status"]): Ticket => ({
      id: `ticket-${status}`,
      initiativeId: initiative.id,
      phaseId: null,
      title: status,
      description: status,
      status,
      acceptanceCriteria: [],
      implementationPlan: "",
      fileTargets: [],
      coverageItemIds: [],
      blockedBy: [],
      blocks: [],
      runId: null,
      createdAt: "2026-03-16T10:22:00.000Z",
      updatedAt: "2026-03-16T10:22:00.000Z",
    });

    const reviews: PlanningReviewArtifact[] = [
      {
        id: `${initiative.id}:ticket-coverage-review`,
        initiativeId: initiative.id,
        kind: "ticket-coverage-review",
        status: "overridden",
        summary: "Accepted.",
        findings: [],
        sourceUpdatedAts: { tickets: "2026-03-16T10:20:00.000Z" },
        overrideReason: "Track follow-up work separately.",
        reviewedAt: "2026-03-16T10:25:00.000Z",
        updatedAt: "2026-03-16T10:25:00.000Z",
      },
    ];

    const executeProgress = getInitiativeProgressModel(
      initiative,
      createSnapshot({
        initiative,
        tickets: [buildTicket("in-progress")],
        planningReviews: reviews,
      }),
    );
    const verifyProgress = getInitiativeProgressModel(
      initiative,
      createSnapshot({
        initiative,
        tickets: [buildTicket("verify")],
        planningReviews: reviews,
      }),
    );

    expect(executeProgress.currentKey).toBe("execute");
    expect(verifyProgress.currentKey).toBe("verify");
    expect(verifyProgress.statusLabel).toBe("Needs verification");
  });

  it("marks the initiative done once every ticket is complete", () => {
    const initiative: Initiative = {
      ...baseInitiative,
      workflow: {
        ...baseInitiative.workflow,
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T10:00:00.000Z" },
          "core-flows": { status: "complete", updatedAt: "2026-03-16T10:05:00.000Z" },
          prd: { status: "complete", updatedAt: "2026-03-16T10:10:00.000Z" },
          "tech-spec": { status: "complete", updatedAt: "2026-03-16T10:15:00.000Z" },
          tickets: { status: "complete", updatedAt: "2026-03-16T10:20:00.000Z" },
        },
      },
    };

    const progress = getInitiativeProgressModel(
      initiative,
      createSnapshot({
        initiative,
        tickets: [
          {
            id: "ticket-done",
            initiativeId: initiative.id,
            phaseId: null,
            title: "done",
            description: "done",
            status: "done",
            acceptanceCriteria: [],
            implementationPlan: "",
            fileTargets: [],
            coverageItemIds: [],
            blockedBy: [],
            blocks: [],
            runId: null,
            createdAt: "2026-03-16T10:22:00.000Z",
            updatedAt: "2026-03-16T10:22:00.000Z",
          },
        ],
        planningReviews: [
          {
            id: `${initiative.id}:ticket-coverage-review`,
            initiativeId: initiative.id,
            kind: "ticket-coverage-review",
            status: "passed",
            summary: "Covered.",
            findings: [],
            sourceUpdatedAts: { tickets: "2026-03-16T10:20:00.000Z" },
            overrideReason: null,
            reviewedAt: "2026-03-16T10:25:00.000Z",
            updatedAt: "2026-03-16T10:25:00.000Z",
          },
        ],
      }),
    );

    expect(progress.currentKey).toBe("done");
    expect(progress.nodes.find((node) => node.key === "done")?.state).toBe("complete");
    expect(progress.statusLabel).toBe("Done");
  });
});

