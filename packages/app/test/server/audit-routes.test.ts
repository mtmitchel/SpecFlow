import { describe, expect, it } from "vitest";
import { createServerFixture } from "../helpers/server-fixture.js";

describe("audit routes", () => {
  it("audits run, dismisses finding, and creates ticket from finding", async () => {
    const fixture = await createServerFixture();

    try {
      const exportResponse = await fixture.server.app.inject({
        method: "POST",
        url: "/api/tickets/ticket-aabbccdd/export-bundle",
        payload: { agent: "generic", operationId: "op-deadbeef" }
      });
      expect(exportResponse.statusCode).toBe(201);

      const exportedRunId = exportResponse.json().runId as string;

      const auditResponse = await fixture.server.app.inject({
        method: "POST",
        url: `/api/runs/${exportedRunId}/audit`,
        payload: {
          diffSource: { mode: "branch", branch: "main" },
          scopePaths: ["src/auth.ts"],
          widenedScopePaths: []
        }
      });
      expect(auditResponse.statusCode).toBe(200);
      expect(auditResponse.json().findings.length).toBeGreaterThan(0);

      const findingId = auditResponse.json().findings[0].id as string;
      const dismissResponse = await fixture.server.app.inject({
        method: "POST",
        url: `/api/runs/${exportedRunId}/findings/${findingId}/dismiss`,
        payload: { note: "accepted drift for scaffold phase" }
      });
      expect(dismissResponse.statusCode).toBe(200);

      const createTicketResponse = await fixture.server.app.inject({
        method: "POST",
        url: `/api/runs/${exportedRunId}/findings/${findingId}/create-ticket`
      });
      expect(createTicketResponse.statusCode).toBe(201);
      expect(createTicketResponse.json().ticket.title).toContain("[Audit]");
    } finally {
      await fixture.cleanup();
    }
  });
});
