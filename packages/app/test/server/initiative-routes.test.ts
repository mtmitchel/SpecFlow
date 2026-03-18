import { describe, expect, it } from "vitest";
import { createServerFixture } from "../helpers/server-fixture.js";

describe("initiative routes", () => {
  it("returns required brief consultation questions for a fresh initiative", async () => {
    const fixture = await createServerFixture();

    try {
      const createResponse = await fixture.server.app.inject({
        method: "POST",
        url: "/api/initiatives",
        payload: { description: "Build auth" }
      });
      expect(createResponse.statusCode).toBe(201);
      const { initiativeId } = createResponse.json() as { initiativeId: string };

      const briefCheck = await fixture.server.app.inject({
        method: "POST",
        url: `/api/initiatives/${initiativeId}/brief-check`
      });

      expect(briefCheck.statusCode).toBe(200);
      const briefCheckPayload = briefCheck.json() as {
        decision: string;
        assumptions: string[];
        questions: unknown[];
      };
      expect(briefCheckPayload).toMatchObject({
        decision: "ask",
        assumptions: []
      });
      expect(briefCheckPayload.questions).toHaveLength(4);
      expect(
        (briefCheckPayload.questions as Array<{ type: string }>).every((question) => question.type !== "text")
      ).toBe(true);
      expect(
        (briefCheckPayload.questions as Array<{ options?: string[] }>).every(
          (question) => !(question.options ?? []).includes("Other")
        )
      ).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks brief generation until the required consultation is completed", async () => {
    const fixture = await createServerFixture();

    try {
      const createResponse = await fixture.server.app.inject({
        method: "POST",
        url: "/api/initiatives",
        payload: { description: "Build auth" }
      });
      expect(createResponse.statusCode).toBe(201);
      const { initiativeId } = createResponse.json() as { initiativeId: string };

      const spoofCheckedAt = await fixture.server.app.inject({
        method: "PATCH",
        url: `/api/initiatives/${initiativeId}/refinement/brief`,
        payload: {
          answers: {},
          defaultAnswerQuestionIds: []
        }
      });
      expect(spoofCheckedAt.statusCode).toBe(200);

      const generateBrief = await fixture.server.app.inject({
        method: "POST",
        url: `/api/initiatives/${initiativeId}/generate-brief`
      });

      expect(generateBrief.statusCode).toBe(409);
      expect(generateBrief.json().message).toBe(
        "Complete the required Brief consultation before creating this artifact"
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("updates phases and saves a single spec", async () => {
    const fixture = await createServerFixture();

    try {
      const initiativePatch = await fixture.server.app.inject({
        method: "PATCH",
        url: "/api/initiatives/initiative-11223344",
        payload: { phases: [{ id: "phase-1", name: "Foundation", order: 1, status: "active" }] }
      });
      expect(initiativePatch.statusCode).toBe(200);
      expect(initiativePatch.json().initiative.phases[0].name).toBe("Foundation");

      const specsPut = await fixture.server.app.inject({
        method: "PUT",
        url: "/api/initiatives/initiative-11223344/specs/tech-spec",
        payload: { content: "# Updated Tech" }
      });
      expect(specsPut.statusCode).toBe(200);
      expect(specsPut.json().spec.type).toBe("tech-spec");
    } finally {
      await fixture.cleanup();
    }
  });

  it("persists the preferred planning surface with refinement answers", async () => {
    const fixture = await createServerFixture();

    try {
      const response = await fixture.server.app.inject({
        method: "PATCH",
        url: "/api/initiatives/initiative-11223344/refinement/brief",
        payload: {
          answers: { "brief-problem": "Automate work" },
          defaultAnswerQuestionIds: [],
          preferredSurface: "questions",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().initiative.workflow.refinements.brief.preferredSurface).toBe("questions");
      expect(fixture.store.initiatives.get("initiative-11223344")?.workflow.refinements.brief.preferredSurface).toBe(
        "questions",
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks later phases when previous phases are incomplete", async () => {
    const fixture = await createServerFixture();

    try {
      await fixture.store.upsertInitiative({
        ...fixture.initiative,
        workflow: {
          ...fixture.initiative.workflow,
          steps: {
            brief: { status: "ready", updatedAt: null },
            "core-flows": { status: "locked", updatedAt: null },
            prd: { status: "locked", updatedAt: null },
            "tech-spec": { status: "locked", updatedAt: null },
            tickets: { status: "locked", updatedAt: null }
          },
          activeStep: "brief"
        },
        specIds: [],
        phases: [],
        ticketIds: [],
        updatedAt: fixture.initiative.updatedAt
      });

      const blockedPrd = await fixture.server.app.inject({
        method: "POST",
        url: "/api/initiatives/initiative-11223344/generate-prd"
      });
      expect(blockedPrd.statusCode).toBe(409);

      const blockedSave = await fixture.server.app.inject({
        method: "PUT",
        url: "/api/initiatives/initiative-11223344/specs/tech-spec",
        payload: { content: "# Tech" }
      });
      expect(blockedSave.statusCode).toBe(409);
    } finally {
      await fixture.cleanup();
    }
  });

  it("requires a reason when overriding a planning review", async () => {
    const fixture = await createServerFixture();

    try {
      const response = await fixture.server.app.inject({
        method: "POST",
        url: "/api/initiatives/initiative-11223344/reviews/brief-review/override",
        payload: { reason: "" }
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not block PRD generation when core flow reviews are unresolved", async () => {
    const fixture = await createServerFixture();

    try {
      await fixture.store.upsertInitiative({
        ...fixture.initiative,
        workflow: {
          ...fixture.initiative.workflow,
          activeStep: "prd",
          steps: {
            brief: { status: "complete", updatedAt: fixture.initiative.updatedAt },
            "core-flows": { status: "complete", updatedAt: fixture.initiative.updatedAt },
            prd: { status: "ready", updatedAt: null },
            "tech-spec": { status: "locked", updatedAt: null },
            tickets: { status: "locked", updatedAt: null }
          }
        },
        updatedAt: fixture.initiative.updatedAt
      });

      const coreFlowsReview = fixture.store.planningReviews.get("initiative-11223344:core-flows-review");
      const crosscheckReview = fixture.store.planningReviews.get("initiative-11223344:core-flows-prd-crosscheck");
      if (!coreFlowsReview || !crosscheckReview) {
        throw new Error("Expected fixture planning reviews to exist");
      }

      await fixture.store.upsertPlanningReview({
        ...coreFlowsReview,
        status: "blocked",
        summary: "Core flows still need review.",
        findings: [
          {
            id: "finding-core-flows-1",
            type: "blocker",
            message: "A review artifact is still unresolved.",
            relatedArtifacts: ["core-flows"]
          }
        ],
        updatedAt: fixture.initiative.updatedAt
      });
      await fixture.store.upsertPlanningReview({
        ...crosscheckReview,
        status: "blocked",
        summary: "Cross-check still needs review.",
        findings: [
          {
            id: "finding-core-flows-prd-1",
            type: "blocker",
            message: "The cross-check artifact is still unresolved.",
            relatedArtifacts: ["core-flows", "prd"]
          }
        ],
        updatedAt: fixture.initiative.updatedAt
      });

      const response = await fixture.server.app.inject({
        method: "POST",
        url: "/api/initiatives/initiative-11223344/generate-prd"
      });

      expect(response.statusCode).toBe(200);
    } finally {
      await fixture.cleanup();
    }
  });
});
