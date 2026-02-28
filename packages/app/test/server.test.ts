import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { specflowDir } from "../src/io/paths.js";
import { createSpecFlowServer } from "../src/server/create-server.js";
import { PROTOCOL_VERSION, SERVER_VERSION } from "../src/server/runtime-status.js";
import { ArtifactStore } from "../src/store/artifact-store.js";
import type { Initiative, Run, Ticket } from "../src/types/entities.js";

const now = "2026-02-27T20:00:00.000Z";

const createSpecflowLayout = async (rootDir: string): Promise<void> => {
  const base = specflowDir(rootDir);
  await mkdir(path.join(base, "initiatives"), { recursive: true });
  await mkdir(path.join(base, "tickets"), { recursive: true });
  await mkdir(path.join(base, "runs"), { recursive: true });
  await mkdir(path.join(base, "decisions"), { recursive: true });
};

describe("createSpecFlowServer", () => {
  it("returns runtime status with protocol and capabilities", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-server-"));
    await createSpecflowLayout(rootDir);

    const staticDir = path.join(rootDir, "packages", "client", "dist");
    await mkdir(staticDir, { recursive: true });
    await writeFile(path.join(staticDir, "index.html"), "<html><body>SpecFlow</body></html>", "utf8");

    const store = new ArtifactStore({ rootDir });
    await store.initialize();
    await writeFile(path.join(rootDir, "specflow", "AGENTS.md"), "Always write tests.\n", "utf8");
    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await writeFile(path.join(rootDir, "src", "auth.ts"), "export const auth = true;\n", "utf8");

    const run: Run = {
      id: "run-1",
      ticketId: null,
      type: "execution",
      agentType: "codex-cli",
      status: "pending",
      attempts: [],
      committedAttemptId: null,
      activeOperationId: null,
      operationLeaseExpiresAt: null,
      lastCommittedAt: null,
      createdAt: now
    };
    await store.upsertRun(run);
    const initiative: Initiative = {
      id: "initiative-1",
      title: "Groundwork",
      description: "Build workflow",
      status: "active",
      phases: [{ id: "phase-1", name: "Phase 1", order: 1, status: "active" }],
      specIds: [],
      ticketIds: ["ticket-1"],
      createdAt: now,
      updatedAt: now
    };
    await store.upsertInitiative(initiative, {
      brief: "# Brief",
      prd: "# PRD",
      techSpec: "# Tech"
    });
    const ticket: Ticket = {
      id: "ticket-1",
      initiativeId: "initiative-1",
      phaseId: "phase-1",
      title: "Export Ticket",
      description: "Export this ticket",
      status: "ready",
      acceptanceCriteria: [{ id: "c1", text: "bundle created" }],
      implementationPlan: "",
      fileTargets: ["src/auth.ts"],
      runId: null,
      createdAt: now,
      updatedAt: now
    };
    await store.upsertTicket(ticket);

    const server = await createSpecFlowServer({
      rootDir,
      store,
      staticDir
    });

    const statusResponse = await server.app.inject({ method: "GET", url: "/api/runtime/status" });
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

    const artifactsResponse = await server.app.inject({ method: "GET", url: "/api/artifacts" });
    expect(artifactsResponse.statusCode).toBe(200);
    expect(artifactsResponse.json().runs).toHaveLength(1);

    const runStateResponse = await server.app.inject({ method: "GET", url: "/api/runs/run-1/state" });
    expect(runStateResponse.statusCode).toBe(200);
    expect(runStateResponse.json().run.id).toBe("run-1");

    const exportResponse = await server.app.inject({
      method: "POST",
      url: "/api/tickets/ticket-1/export-bundle",
      payload: { agent: "generic", operationId: "op-server-test" }
    });
    expect(exportResponse.statusCode).toBe(201);
    expect(exportResponse.json().flatString).toContain("SpecFlow Task Bundle");

    const operationResponse = await server.app.inject({
      method: "GET",
      url: "/api/operations/op-server-test"
    });
    expect(operationResponse.statusCode).toBe(200);
    expect(operationResponse.json().state).toBe("committed");

    const patchResponse = await server.app.inject({
      method: "PATCH",
      url: "/api/tickets/ticket-1",
      payload: { status: "in-progress" }
    });
    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json().ticket.status).toBe("in-progress");

    const configResponse = await server.app.inject({
      method: "PUT",
      url: "/api/config",
      payload: { provider: "openrouter", model: "openrouter/model" }
    });
    expect(configResponse.statusCode).toBe(200);
    expect(configResponse.json().config.provider).toBe("openrouter");

    const initiativePatch = await server.app.inject({
      method: "PATCH",
      url: "/api/initiatives/initiative-1",
      payload: { phases: [{ id: "phase-1", name: "Foundation", order: 1, status: "active" }] }
    });
    expect(initiativePatch.statusCode).toBe(200);
    expect(initiativePatch.json().initiative.phases[0].name).toBe("Foundation");

    const specsPut = await server.app.inject({
      method: "PUT",
      url: "/api/initiatives/initiative-1/specs",
      payload: { briefMarkdown: "# Updated Brief", prdMarkdown: "# Updated PRD", techSpecMarkdown: "# Updated Tech" }
    });
    expect(specsPut.statusCode).toBe(200);
    expect(specsPut.json().specs.briefMarkdown).toContain("Updated Brief");

    const runsResponse = await server.app.inject({
      method: "GET",
      url: "/api/runs"
    });
    expect(runsResponse.statusCode).toBe(200);
    expect(runsResponse.json().runs.length).toBeGreaterThan(0);

    const exportedRunId = exportResponse.json().runId as string;
    const runDetailResponse = await server.app.inject({
      method: "GET",
      url: `/api/runs/${exportedRunId}`
    });
    expect(runDetailResponse.statusCode).toBe(200);
    expect(runDetailResponse.json().run.id).toBe(exportedRunId);
    expect(runDetailResponse.json().committed.bundleManifest.agentTarget).toBe("generic");

    const bundleZipResponse = await server.app.inject({
      method: "GET",
      url: `/api/runs/${exportedRunId}/attempts/${exportResponse.json().attemptId}/bundle.zip`
    });
    expect(bundleZipResponse.statusCode).toBe(200);
    expect(bundleZipResponse.headers["content-type"]).toContain("application/zip");

    const auditResponse = await server.app.inject({
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
    const dismissResponse = await server.app.inject({
      method: "POST",
      url: `/api/runs/${exportedRunId}/findings/${findingId}/dismiss`,
      payload: { note: "accepted drift for scaffold phase" }
    });
    expect(dismissResponse.statusCode).toBe(200);

    const createTicketResponse = await server.app.inject({
      method: "POST",
      url: `/api/runs/${exportedRunId}/findings/${findingId}/create-ticket`
    });
    expect(createTicketResponse.statusCode).toBe(201);
    expect(createTicketResponse.json().ticket.title).toContain("[Audit]");

    await server.close();
    await rm(rootDir, { recursive: true, force: true });
  });
});
