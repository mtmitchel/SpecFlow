import { describe, expect, it } from "vitest";
import { createServerFixture } from "../helpers/server-fixture.js";

describe("initiative routes", () => {
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
});
