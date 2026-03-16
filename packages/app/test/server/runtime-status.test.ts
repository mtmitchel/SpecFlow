import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, SERVER_VERSION } from "../../src/server/runtime-status.js";
import { createServerFixture } from "../helpers/server-fixture.js";

describe("server runtime routes", () => {
  it("returns runtime status and artifact snapshots", async () => {
    const fixture = await createServerFixture();

    try {
      const statusResponse = await fixture.server.app.inject({ method: "GET", url: "/api/runtime/status" });
      expect(statusResponse.statusCode).toBe(200);

      const statusBody = statusResponse.json();
      expect(statusBody.serverVersion).toBe(SERVER_VERSION);
      expect(statusBody.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(statusBody.capabilities).toMatchObject({
        artifacts: true,
        plannerSse: true,
        verifySse: true,
        runStateSnapshot: true,
        exportBundle: true,
        verifyCapture: true,
        operationStatus: true
      });

      const artifactsResponse = await fixture.server.app.inject({ method: "GET", url: "/api/artifacts" });
      expect(artifactsResponse.statusCode).toBe(200);
      expect(artifactsResponse.json().runs).toHaveLength(1);
      expect(artifactsResponse.json().ticketCoverageArtifacts).toHaveLength(1);
      expect(artifactsResponse.json().config).toMatchObject({
        provider: "openrouter",
        model: "openrouter/auto",
        host: "127.0.0.1",
        port: 3141,
        repoInstructionFile: "specflow/AGENTS.md",
        hasApiKey: false
      });

      const runStateResponse = await fixture.server.app.inject({ method: "GET", url: "/api/runs/run-aabb1122/state" });
      expect(runStateResponse.statusCode).toBe(200);
      expect(runStateResponse.json().run.id).toBe("run-aabb1122");
    } finally {
      await fixture.cleanup();
    }
  });
});
