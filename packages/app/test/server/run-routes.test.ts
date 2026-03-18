import { describe, expect, it } from "vitest";
import { createServerFixture } from "../helpers/server-fixture.js";

describe("run routes", () => {
  it("lists runs, returns run detail, and serves bundle zip", async () => {
    const fixture = await createServerFixture();

    try {
      const exportResponse = await fixture.server.app.inject({
        method: "POST",
        url: "/api/tickets/ticket-aabbccdd/export-bundle",
        payload: { agent: "generic", operationId: "op-deadbeef" }
      });
      expect(exportResponse.statusCode).toBe(201);

      const runsResponse = await fixture.server.app.inject({
        method: "GET",
        url: "/api/runs"
      });
      expect(runsResponse.statusCode).toBe(200);
      expect(runsResponse.json().runs.length).toBeGreaterThan(0);

      const exportedRunId = exportResponse.json().runId as string;
      const exportedAttemptId = exportResponse.json().attemptId as string;

      const runDetailResponse = await fixture.server.app.inject({
        method: "GET",
        url: `/api/runs/${exportedRunId}`
      });
      expect(runDetailResponse.statusCode).toBe(200);
      expect(runDetailResponse.json().run.id).toBe(exportedRunId);
      expect(runDetailResponse.json().committed.bundleManifest.agentTarget).toBe("generic");

      const bundleZipResponse = await fixture.server.app.inject({
        method: "GET",
        url: `/api/runs/${exportedRunId}/attempts/${exportedAttemptId}/bundle.zip`
      });
      expect(bundleZipResponse.statusCode).toBe(200);
      expect(bundleZipResponse.headers["content-type"]).toContain("application/zip");

      const removedStubResponse = await fixture.server.app.inject({
        method: "POST",
        url: "/api/runs"
      });
      expect(removedStubResponse.statusCode).toBe(404);
    } finally {
      await fixture.cleanup();
    }
  });
});
