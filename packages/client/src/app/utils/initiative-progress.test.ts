import { describe, expect, it } from "vitest";
import type { ArtifactsSnapshot, Initiative, PlanningReviewArtifact, Ticket } from "../../types.js";
import {
  getInitiativeProgressModel,
  getInitiativeResumeHref,
  getInitiativeShellHref,
} from "./initiative-progress.js";
import { getInitiativeQueueActionLabel } from "./ui-language.js";

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
      validation: { status: "locked", updatedAt: null },
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
  specs = [],
}: {
  initiative?: Initiative;
  tickets?: Ticket[];
  planningReviews?: PlanningReviewArtifact[];
  specs?: ArtifactsSnapshot["specs"];
} = {}): ArtifactsSnapshot => ({
  config: null,
  initiatives: [initiative],
  tickets,
  runs: [],
  runAttempts: [],
  specs,
  planningReviews,
  ticketCoverageArtifacts: [],
});

describe("getInitiativeProgressModel", () => {
  it("keeps a fresh project at brief intake", () => {
    const progress = getInitiativeProgressModel(baseInitiative, createSnapshot());

    expect(progress.currentKey).toBe("brief");
    expect(progress.nodes[0]?.state).toBe("active");
    expect(progress.currentNodeState).toBe("active");
    expect(progress.currentReviewKind).toBeNull();
    expect(getInitiativeQueueActionLabel(baseInitiative, progress)).toBe("Start brief intake");
  });

  it("keeps brief stale active when it needs more work, without exposing a planning review gate", () => {
    const initiative: Initiative = {
      ...baseInitiative,
      workflow: {
        ...baseInitiative.workflow,
        steps: {
          ...baseInitiative.workflow.steps,
          brief: { status: "stale", updatedAt: "2026-03-16T10:05:00.000Z" },
          "core-flows": { status: "ready", updatedAt: "2026-03-16T10:06:00.000Z" },
        },
        refinements: {
          ...baseInitiative.workflow.refinements,
          brief: {
            ...baseInitiative.workflow.refinements.brief,
            checkedAt: "2026-03-16T10:05:00.000Z",
          },
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
    expect(progress.nodes.find((node) => node.key === "brief")?.state).toBe("active");
    expect(progress.currentNodeState).toBe("active");
    expect(progress.currentReviewKind).toBeNull();
    expect(getInitiativeQueueActionLabel(initiative, progress)).toBe("Review brief");
  });

  it("builds resume hrefs for active planning questions when no artifact exists", () => {
    const snapshot = createSnapshot();
    const progress = getInitiativeProgressModel(baseInitiative, snapshot);

    expect(getInitiativeResumeHref(baseInitiative, progress, snapshot)).toBe(
      `/initiative/${baseInitiative.id}?step=brief&surface=questions`,
    );
  });

  it("builds resume hrefs for artifact review when the current planning step already has a document", () => {
    const initiative: Initiative = {
      ...baseInitiative,
      workflow: {
        ...baseInitiative.workflow,
        steps: {
          ...baseInitiative.workflow.steps,
          brief: { status: "stale", updatedAt: "2026-03-16T10:05:00.000Z" },
          "core-flows": { status: "ready", updatedAt: "2026-03-16T10:06:00.000Z" },
        },
        refinements: {
          ...baseInitiative.workflow.refinements,
          brief: {
            ...baseInitiative.workflow.refinements.brief,
            questions: [
              {
                id: "brief-user",
                label: "Who is this for?",
                type: "select",
                whyThisBlocks: "The brief needs one clear audience.",
                affectedArtifact: "brief",
                decisionType: "user",
                assumptionIfUnanswered: "This is for a solo note-taker.",
                options: ["Just me", "A small team"],
              },
            ],
            checkedAt: "2026-03-16T10:05:00.000Z",
          },
        },
      },
    };
    const snapshot = createSnapshot({
      initiative,
      specs: [
        {
          id: `${initiative.id}:brief`,
          initiativeId: initiative.id,
          type: "brief",
          title: "Brief",
          sourcePath: "specflow/initiatives/initiative-12345678/brief.md",
          createdAt: "2026-03-16T10:05:00.000Z",
          updatedAt: "2026-03-16T10:05:00.000Z",
        },
      ],
    });
    const progress = getInitiativeProgressModel(initiative, snapshot);

    expect(getInitiativeResumeHref(initiative, progress, snapshot)).toBe(
      `/initiative/${initiative.id}?step=brief&surface=review`,
    );
  });

  it("restores the review surface when a completed step has a saved artifact", () => {
    const initiative: Initiative = {
      ...baseInitiative,
      workflow: {
        ...baseInitiative.workflow,
        steps: {
          ...baseInitiative.workflow.steps,
          brief: { status: "stale", updatedAt: "2026-03-16T10:05:00.000Z" },
          "core-flows": { status: "ready", updatedAt: "2026-03-16T10:06:00.000Z" },
        },
        refinements: {
          ...baseInitiative.workflow.refinements,
          brief: {
            ...baseInitiative.workflow.refinements.brief,
            history: [
              {
                id: "brief-user",
                label: "Who is this for?",
                type: "select",
                whyThisBlocks: "The brief needs one clear audience.",
                affectedArtifact: "brief",
                decisionType: "user",
                assumptionIfUnanswered: "This is for a solo note-taker.",
                options: ["Just me", "A small team"],
              },
            ],
            preferredSurface: "questions",
            checkedAt: "2026-03-16T10:05:00.000Z",
          },
        },
      },
    };
    const snapshot = createSnapshot({
      initiative,
      specs: [
        {
          id: `${initiative.id}:brief`,
          initiativeId: initiative.id,
          type: "brief",
          title: "Brief",
          sourcePath: "specflow/initiatives/initiative-12345678/brief.md",
          createdAt: "2026-03-16T10:05:00.000Z",
          updatedAt: "2026-03-16T10:05:00.000Z",
        },
      ],
    });
    const progress = getInitiativeProgressModel(initiative, snapshot);

    expect(getInitiativeResumeHref(initiative, progress, snapshot)).toBe(
      `/initiative/${initiative.id}?step=brief&surface=review`,
    );
  });

  it("restores the stored initiative ticket when execution has not started yet", () => {
    const initiative: Initiative = {
      ...baseInitiative,
      workflow: {
        ...baseInitiative.workflow,
        activeStep: "tickets",
        resumeTicketId: "ticket-ready",
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T10:00:00.000Z" },
          "core-flows": { status: "complete", updatedAt: "2026-03-16T10:05:00.000Z" },
          prd: { status: "complete", updatedAt: "2026-03-16T10:10:00.000Z" },
          "tech-spec": { status: "complete", updatedAt: "2026-03-16T10:15:00.000Z" },
          validation: { status: "complete", updatedAt: "2026-03-16T10:18:00.000Z" },
          tickets: { status: "complete", updatedAt: "2026-03-16T10:20:00.000Z" },
        },
      },
      ticketIds: ["ticket-ready"],
    };
    const readyTicket: Ticket = {
      id: "ticket-ready",
      initiativeId: initiative.id,
      phaseId: null,
      title: "Ready ticket",
      description: "Resume this ticket.",
      status: "ready",
      acceptanceCriteria: [],
      implementationPlan: "",
      fileTargets: [],
      coverageItemIds: [],
      blockedBy: [],
      blocks: [],
      runId: null,
      createdAt: "2026-03-16T10:21:00.000Z",
      updatedAt: "2026-03-16T10:21:00.000Z",
    };

    const snapshot = createSnapshot({
      initiative,
      tickets: [readyTicket],
      planningReviews: [
        {
          id: `${initiative.id}:ticket-coverage-review`,
          initiativeId: initiative.id,
          kind: "ticket-coverage-review",
          status: "passed",
          summary: "Coverage check passes.",
          findings: [],
          sourceUpdatedAts: { tickets: "2026-03-16T10:20:00.000Z" },
          overrideReason: null,
          reviewedAt: "2026-03-16T10:25:00.000Z",
          updatedAt: "2026-03-16T10:25:00.000Z",
        },
      ],
    });
    const progress = getInitiativeProgressModel(initiative, snapshot);

    expect(progress.resumeTicket?.id).toBe("ticket-ready");
    expect(getInitiativeResumeHref(initiative, progress, snapshot)).toBe("/ticket/ticket-ready");
  });

  it("falls back to the next initiative ticket when execution is active without a stored resume ticket", () => {
    const initiative: Initiative = {
      ...baseInitiative,
      workflow: {
        ...baseInitiative.workflow,
        activeStep: "tickets",
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T10:00:00.000Z" },
          "core-flows": { status: "complete", updatedAt: "2026-03-16T10:05:00.000Z" },
          prd: { status: "complete", updatedAt: "2026-03-16T10:10:00.000Z" },
          "tech-spec": { status: "complete", updatedAt: "2026-03-16T10:15:00.000Z" },
          validation: { status: "complete", updatedAt: "2026-03-16T10:18:00.000Z" },
          tickets: { status: "complete", updatedAt: "2026-03-16T10:20:00.000Z" },
        },
      },
      ticketIds: ["ticket-ready"],
    };
    const readyTicket: Ticket = {
      id: "ticket-ready",
      initiativeId: initiative.id,
      phaseId: null,
      title: "Ready ticket",
      description: "Resume this ticket.",
      status: "ready",
      acceptanceCriteria: [],
      implementationPlan: "",
      fileTargets: [],
      coverageItemIds: [],
      blockedBy: [],
      blocks: [],
      runId: null,
      createdAt: "2026-03-16T10:21:00.000Z",
      updatedAt: "2026-03-16T10:21:00.000Z",
    };

    const snapshot = createSnapshot({
      initiative,
      tickets: [readyTicket],
      planningReviews: [
        {
          id: `${initiative.id}:ticket-coverage-review`,
          initiativeId: initiative.id,
          kind: "ticket-coverage-review",
          status: "passed",
          summary: "Coverage check passes.",
          findings: [],
          sourceUpdatedAts: { tickets: "2026-03-16T10:20:00.000Z" },
          overrideReason: null,
          reviewedAt: "2026-03-16T10:25:00.000Z",
          updatedAt: "2026-03-16T10:25:00.000Z",
        },
      ],
    });
    const progress = getInitiativeProgressModel(initiative, snapshot);

    expect(progress.resumeTicket?.id).toBe("ticket-ready");
    expect(getInitiativeResumeHref(initiative, progress, snapshot)).toBe("/ticket/ticket-ready");
  });

  it("keeps initiative shell navigation on tickets even when Home resumes a ticket directly", () => {
    const initiative: Initiative = {
      ...baseInitiative,
      workflow: {
        ...baseInitiative.workflow,
        activeStep: "tickets",
        resumeTicketId: "ticket-ready",
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T10:00:00.000Z" },
          "core-flows": { status: "complete", updatedAt: "2026-03-16T10:05:00.000Z" },
          prd: { status: "complete", updatedAt: "2026-03-16T10:10:00.000Z" },
          "tech-spec": { status: "complete", updatedAt: "2026-03-16T10:15:00.000Z" },
          validation: { status: "complete", updatedAt: "2026-03-16T10:18:00.000Z" },
          tickets: { status: "complete", updatedAt: "2026-03-16T10:20:00.000Z" },
        },
      },
      ticketIds: ["ticket-ready"],
    };
    const readyTicket: Ticket = {
      id: "ticket-ready",
      initiativeId: initiative.id,
      phaseId: null,
      title: "Ready ticket",
      description: "Resume this ticket.",
      status: "in-progress",
      acceptanceCriteria: [],
      implementationPlan: "",
      fileTargets: [],
      coverageItemIds: [],
      blockedBy: [],
      blocks: [],
      runId: null,
      createdAt: "2026-03-16T10:21:00.000Z",
      updatedAt: "2026-03-16T10:21:00.000Z",
    };

    const snapshot = createSnapshot({
      initiative,
      tickets: [readyTicket],
      planningReviews: [
        {
          id: `${initiative.id}:ticket-coverage-review`,
          initiativeId: initiative.id,
          kind: "ticket-coverage-review",
          status: "passed",
          summary: "Coverage check passes.",
          findings: [],
          sourceUpdatedAts: { tickets: "2026-03-16T10:20:00.000Z" },
          overrideReason: null,
          reviewedAt: "2026-03-16T10:25:00.000Z",
          updatedAt: "2026-03-16T10:25:00.000Z",
        },
      ],
    });
    const progress = getInitiativeProgressModel(initiative, snapshot);

    expect(getInitiativeResumeHref(initiative, progress, snapshot)).toBe("/ticket/ticket-ready");
    expect(getInitiativeShellHref(initiative, progress, snapshot)).toBe(
      `/initiative/${initiative.id}?step=tickets`,
    );
  });

  it.each([
    {
      completedStep: "brief" as const,
      nextStep: "core-flows" as const,
      reviewKind: "brief-review" as const,
    },
    {
      completedStep: "core-flows" as const,
      nextStep: "prd" as const,
      reviewKind: "core-flows-review" as const,
    },
    {
      completedStep: "prd" as const,
      nextStep: "tech-spec" as const,
      reviewKind: "prd-review" as const,
    },
    {
      completedStep: "tech-spec" as const,
      nextStep: "validation" as const,
      reviewKind: "tech-spec-review" as const,
    },
  ])(
    "continues to $nextStep even when $completedStep still has an unresolved planning review artifact",
    ({ completedStep, nextStep, reviewKind }) => {
      const steps: Initiative["workflow"]["steps"] = {
        brief: { status: "locked", updatedAt: null },
        "core-flows": { status: "locked", updatedAt: null },
        prd: { status: "locked", updatedAt: null },
        "tech-spec": { status: "locked", updatedAt: null },
        validation: { status: "locked", updatedAt: null },
        tickets: { status: "locked", updatedAt: null },
      };

      let markComplete = true;
      for (const step of ["brief", "core-flows", "prd", "tech-spec", "validation", "tickets"] as const) {
        if (step === nextStep) {
          steps[step] = { status: "ready", updatedAt: "2026-03-16T10:30:00.000Z" };
          markComplete = false;
          continue;
        }

        if (markComplete) {
          steps[step] = { status: "complete", updatedAt: "2026-03-16T10:20:00.000Z" };
        }
      }

      const initiative: Initiative = {
        ...baseInitiative,
        workflow: {
          ...baseInitiative.workflow,
          steps,
        },
      };

      const progress = getInitiativeProgressModel(
        initiative,
        createSnapshot({
          initiative,
          planningReviews: [
            {
              id: `${initiative.id}:${reviewKind}`,
              initiativeId: initiative.id,
              kind: reviewKind,
              status: "blocked",
              summary: "Still blocked.",
              findings: [],
              sourceUpdatedAts: { [completedStep]: "2026-03-16T10:20:00.000Z" },
              overrideReason: null,
              reviewedAt: "2026-03-16T10:31:00.000Z",
              updatedAt: "2026-03-16T10:31:00.000Z",
            },
          ],
        }),
      );

      expect(progress.currentKey).toBe(nextStep);
      expect(progress.currentNodeState).toBe("active");
      expect(progress.nodes.find((node) => node.key === completedStep)?.state).toBe("complete");
      expect(progress.nodes.find((node) => node.key === nextStep)?.state).toBe("active");
      expect(progress.currentReviewKind).toBeNull();
    },
  );

  it("keeps the initiative at validation when coverage is unresolved", () => {
    const initiative: Initiative = {
      ...baseInitiative,
      workflow: {
        ...baseInitiative.workflow,
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T10:00:00.000Z" },
          "core-flows": { status: "complete", updatedAt: "2026-03-16T10:05:00.000Z" },
          prd: { status: "complete", updatedAt: "2026-03-16T10:10:00.000Z" },
          "tech-spec": { status: "complete", updatedAt: "2026-03-16T10:15:00.000Z" },
          validation: { status: "stale", updatedAt: "2026-03-16T10:18:00.000Z" },
          tickets: { status: "locked", updatedAt: null },
        },
      },
    };
    const progress = getInitiativeProgressModel(
      initiative,
      createSnapshot({
        initiative,
        planningReviews: [
          {
            id: `${initiative.id}:ticket-coverage-review`,
            initiativeId: initiative.id,
            kind: "ticket-coverage-review",
            status: "blocked",
            summary: "Coverage gaps remain.",
            findings: [],
            sourceUpdatedAts: { validation: "2026-03-16T10:18:00.000Z" },
            overrideReason: null,
            reviewedAt: "2026-03-16T10:25:00.000Z",
            updatedAt: "2026-03-16T10:25:00.000Z",
          },
        ],
      }),
    );

    expect(progress.currentKey).toBe("validation");
    expect(progress.nodes.find((node) => node.key === "validation")?.state).toBe("checkpoint");
    expect(progress.currentNodeState).toBe("checkpoint");
    expect(progress.currentReviewKind).toBe("ticket-coverage-review");
    expect(getInitiativeQueueActionLabel(initiative, progress)).toBe("Review validation");
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
          validation: { status: "complete", updatedAt: "2026-03-16T10:18:00.000Z" },
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
    expect(executeProgress.currentNodeState).toBe("active");
    expect(verifyProgress.currentNodeState).toBe("active");
    expect(getInitiativeQueueActionLabel(initiative, executeProgress)).toBe("Resume ticket");
    expect(getInitiativeQueueActionLabel(initiative, verifyProgress)).toBe("Open ticket");
  });

  it("routes back to validation when coverage is blocked even if tickets already exist", () => {
    const initiative: Initiative = {
      ...baseInitiative,
      workflow: {
        ...baseInitiative.workflow,
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T10:00:00.000Z" },
          "core-flows": { status: "complete", updatedAt: "2026-03-16T10:05:00.000Z" },
          prd: { status: "complete", updatedAt: "2026-03-16T10:10:00.000Z" },
          "tech-spec": { status: "complete", updatedAt: "2026-03-16T10:15:00.000Z" },
          validation: { status: "complete", updatedAt: "2026-03-16T10:18:00.000Z" },
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
            id: "ticket-in-progress",
            initiativeId: initiative.id,
            phaseId: null,
            title: "in-progress",
            description: "in-progress",
            status: "in-progress",
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
            status: "blocked",
            summary: "Coverage gaps remain.",
            findings: [],
            sourceUpdatedAts: { validation: "2026-03-16T10:18:00.000Z" },
            overrideReason: null,
            reviewedAt: "2026-03-16T10:25:00.000Z",
            updatedAt: "2026-03-16T10:25:00.000Z",
          },
        ],
      }),
    );

    expect(progress.currentKey).toBe("validation");
    expect(progress.currentNodeState).toBe("checkpoint");
    expect(progress.nodes.find((node) => node.key === "execute")?.state).toBe("future");
    expect(progress.nodes.find((node) => node.key === "verify")?.state).toBe("future");
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
          validation: { status: "complete", updatedAt: "2026-03-16T10:18:00.000Z" },
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
    expect(progress.currentNodeState).toBe("complete");
    expect(getInitiativeQueueActionLabel(initiative, progress)).toBe("Done");
  });
});
