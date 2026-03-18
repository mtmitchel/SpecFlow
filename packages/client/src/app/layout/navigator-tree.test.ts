import { describe, expect, it } from "vitest";
import type { ArtifactsSnapshot, Initiative, Ticket } from "../../types.js";
import { buildNavigatorTree } from "./navigator-tree.js";

const initiative: Initiative = {
  id: "initiative-12345678",
  title: "Local Notes",
  description: "A local-first notes app",
  status: "active",
  phases: [],
  specIds: [],
  ticketIds: ["ticket-12345678"],
  workflow: {
    activeStep: "brief",
    steps: {
      brief: { status: "complete", updatedAt: "2026-03-16T12:00:00.000Z" },
      "core-flows": { status: "ready", updatedAt: null },
      prd: { status: "locked", updatedAt: null },
      "tech-spec": { status: "locked", updatedAt: null },
      tickets: { status: "locked", updatedAt: null }
    },
    refinements: {
      brief: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "core-flows": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null }
    }
  },
  createdAt: "2026-03-16T12:00:00.000Z",
  updatedAt: "2026-03-16T12:30:00.000Z"
};

const initiativeTicket: Ticket = {
  id: "ticket-12345678",
  initiativeId: initiative.id,
  phaseId: null,
  title: "Implement capture flow",
  description: "Build the first capture flow",
  status: "ready",
  acceptanceCriteria: [{ id: "ac-1", text: "Capture flow works" }],
  implementationPlan: "Implement it",
  fileTargets: ["packages/client/src/App.tsx"],
  coverageItemIds: [],
  blockedBy: [],
  blocks: [],
  runId: null,
  createdAt: "2026-03-16T12:10:00.000Z",
  updatedAt: "2026-03-16T12:10:00.000Z"
};

const quickTask: Ticket = {
  id: "ticket-87654321",
  initiativeId: null,
  phaseId: null,
  title: "Fix typo",
  description: "Fix one typo",
  status: "backlog",
  acceptanceCriteria: [{ id: "ac-2", text: "Typo fixed" }],
  implementationPlan: "Edit text",
  fileTargets: ["README.md"],
  coverageItemIds: [],
  blockedBy: [],
  blocks: [],
  runId: null,
  createdAt: "2026-03-16T12:12:00.000Z",
  updatedAt: "2026-03-16T12:12:00.000Z"
};

const snapshot: ArtifactsSnapshot = {
  config: null,
  initiatives: [initiative],
  tickets: [initiativeTicket, quickTask],
  runs: [],
  runAttempts: [],
  specs: [],
  planningReviews: [],
  ticketCoverageArtifacts: []
};

describe("buildNavigatorTree", () => {
  it("builds a project-focused tree without aggregate ticket or run links", () => {
    const tree = buildNavigatorTree(snapshot);
    const initiativeNode = tree.find((node) => node.type === "initiative");

    expect(tree.some((node) => node.type === "aggregate-link")).toBe(false);
    expect(tree.some((node) => node.type === "initiative")).toBe(true);
    expect(tree.some((node) => node.type === "quick-tasks-header")).toBe(true);
    expect(initiativeNode?.path).toBe(`/ticket/${initiativeTicket.id}`);
  });
});
