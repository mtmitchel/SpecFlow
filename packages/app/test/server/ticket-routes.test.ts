import { describe, expect, it } from "vitest";
import { createServerFixture } from "../helpers/server-fixture.js";

describe("ticket routes", () => {
  it("exports bundle, updates operation status, and patches ticket", async () => {
    const fixture = await createServerFixture();

    try {
      const exportResponse = await fixture.server.app.inject({
        method: "POST",
        url: "/api/tickets/ticket-1/export-bundle",
        payload: { agent: "generic", operationId: "op-server-test" }
      });
      expect(exportResponse.statusCode).toBe(201);
      expect(exportResponse.json().flatString).toContain("SpecFlow Task Bundle");

      const operationResponse = await fixture.server.app.inject({
        method: "GET",
        url: "/api/operations/op-server-test"
      });
      expect(operationResponse.statusCode).toBe(200);
      expect(operationResponse.json().state).toBe("committed");

      const patchResponse = await fixture.server.app.inject({
        method: "PATCH",
        url: "/api/tickets/ticket-1",
        payload: { status: "in-progress" }
      });
      expect(patchResponse.statusCode).toBe(200);
      expect(patchResponse.json().ticket.status).toBe("in-progress");
    } finally {
      await fixture.cleanup();
    }
  });
});
