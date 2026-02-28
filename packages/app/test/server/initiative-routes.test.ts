import { describe, expect, it } from "vitest";
import { createServerFixture } from "../helpers/server-fixture.js";

describe("initiative routes", () => {
  it("updates phases and specs", async () => {
    const fixture = await createServerFixture();

    try {
      const initiativePatch = await fixture.server.app.inject({
        method: "PATCH",
        url: "/api/initiatives/initiative-1",
        payload: { phases: [{ id: "phase-1", name: "Foundation", order: 1, status: "active" }] }
      });
      expect(initiativePatch.statusCode).toBe(200);
      expect(initiativePatch.json().initiative.phases[0].name).toBe("Foundation");

      const specsPut = await fixture.server.app.inject({
        method: "PUT",
        url: "/api/initiatives/initiative-1/specs",
        payload: { briefMarkdown: "# Updated Brief", prdMarkdown: "# Updated PRD", techSpecMarkdown: "# Updated Tech" }
      });
      expect(specsPut.statusCode).toBe(200);
      expect(specsPut.json().specs.briefMarkdown).toContain("Updated Brief");
    } finally {
      await fixture.cleanup();
    }
  });
});
