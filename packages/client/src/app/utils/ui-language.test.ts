import { describe, expect, it } from "vitest";
import type { ArtifactsSnapshot, Initiative } from "../../types.js";
import { getInitiativeProgressModel } from "./initiative-progress.js";
import {
  getInitiativeQueueActionLabel,
  getTicketsHandoffActionLabel,
} from "./ui-language.js";

const baseInitiative: Initiative = {
  id: "initiative-12345678",
  title: "Linux Notes",
  description: "Build a Linux-first notes app.",
  status: "active",
  phases: [],
  specIds: [],
  ticketIds: [],
  workflow: {
    activeStep: "tickets",
    steps: {
      brief: { status: "complete", updatedAt: "2026-03-16T10:00:00.000Z" },
      "core-flows": {
        status: "complete",
        updatedAt: "2026-03-16T10:05:00.000Z",
      },
      prd: { status: "complete", updatedAt: "2026-03-16T10:10:00.000Z" },
      "tech-spec": {
        status: "complete",
        updatedAt: "2026-03-16T10:15:00.000Z",
      },
      validation: { status: "complete", updatedAt: "2026-03-16T10:18:00.000Z" },
      tickets: { status: "ready", updatedAt: "2026-03-16T10:20:00.000Z" },
    },
    refinements: {
      brief: {
        questions: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: null,
      },
      "core-flows": {
        questions: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: null,
      },
      prd: {
        questions: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: null,
      },
      "tech-spec": {
        questions: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: null,
      },
    },
  },
  createdAt: "2026-03-16T10:00:00.000Z",
  updatedAt: "2026-03-16T10:20:00.000Z",
};

const createSnapshot = (initiative: Initiative): ArtifactsSnapshot => ({
  config: null,
  initiatives: [initiative],
  tickets: [],
  runs: [],
  runAttempts: [],
  specs: [],
  planningReviews: [],
  ticketCoverageArtifacts: [],
});

describe("ticket handoff language", () => {
  it("uses explicit handoff labels for ticket planning", () => {
    expect(getTicketsHandoffActionLabel("ready", false)).toBe(
      "Generate tickets",
    );
    expect(getTicketsHandoffActionLabel("stale", false)).toBe(
      "Refresh tickets",
    );
    expect(getTicketsHandoffActionLabel("complete", true)).toBe("Open tickets");
  });

  it("tells Home to generate tickets when planning is ready for the handoff", () => {
    const progress = getInitiativeProgressModel(
      baseInitiative,
      createSnapshot(baseInitiative),
    );

    expect(progress.currentKey).toBe("tickets");
    expect(getInitiativeQueueActionLabel(baseInitiative, progress)).toBe(
      "Generate tickets",
    );
  });
});
