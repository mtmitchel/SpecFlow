import { describe, expect, it } from "vitest";
import { createServerFixture } from "../helpers/server-fixture.js";

describe("ticket routes", () => {
  it("exports bundle, updates operation status, and patches ticket", async () => {
    const fixture = await createServerFixture();

    try {
      const exportResponse = await fixture.server.app.inject({
        method: "POST",
        url: "/api/tickets/ticket-aabbccdd/export-bundle",
        payload: { agent: "generic", operationId: "op-deadbeef" }
      });
      expect(exportResponse.statusCode).toBe(201);
      expect(exportResponse.json().flatString).toContain("SpecFlow Task Bundle");

      const operationResponse = await fixture.server.app.inject({
        method: "GET",
        url: "/api/operations/op-deadbeef"
      });
      expect(operationResponse.statusCode).toBe(200);
      expect(operationResponse.json().state).toBe("committed");

      const patchResponse = await fixture.server.app.inject({
        method: "PATCH",
        url: "/api/tickets/ticket-aabbccdd",
        payload: { status: "in-progress" }
      });
      expect(patchResponse.statusCode).toBe(200);
      expect(patchResponse.json().ticket.status).toBe("in-progress");
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects export-bundle with path-traversal operationId", async () => {
    const fixture = await createServerFixture();

    try {
      const response = await fixture.server.app.inject({
        method: "POST",
        url: "/api/tickets/ticket-aabbccdd/export-bundle",
        payload: { agent: "generic", operationId: "../../etc/passwd" }
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("Invalid operationId format");
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects export-fix-bundle with invalid findingId", async () => {
    const fixture = await createServerFixture();

    try {
      const response = await fixture.server.app.inject({
        method: "POST",
        url: "/api/runs/run-aabb1122/findings/bad-id/export-fix-bundle",
        payload: { agent: "generic" }
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("Invalid finding ID format");
    } finally {
      await fixture.cleanup();
    }
  });
});
