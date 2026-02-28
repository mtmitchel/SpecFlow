import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSpecFlowServer } from "../../src/server/create-server.js";
import { specflowDir } from "../../src/io/paths.js";
import { ArtifactStore } from "../../src/store/artifact-store.js";
import type { Initiative, Run, Ticket } from "../../src/types/entities.js";

export const now = "2026-02-27T20:00:00.000Z";

const createSpecflowLayout = async (rootDir: string): Promise<void> => {
  const base = specflowDir(rootDir);
  await mkdir(path.join(base, "initiatives"), { recursive: true });
  await mkdir(path.join(base, "tickets"), { recursive: true });
  await mkdir(path.join(base, "runs"), { recursive: true });
  await mkdir(path.join(base, "decisions"), { recursive: true });
};

export interface ServerFixture {
  rootDir: string;
  staticDir: string;
  store: ArtifactStore;
  server: Awaited<ReturnType<typeof createSpecFlowServer>>;
  run: Run;
  initiative: Initiative;
  ticket: Ticket;
  cleanup: () => Promise<void>;
}

export const createServerFixture = async (): Promise<ServerFixture> => {
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
    id: "run-aabb1122",
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
    id: "initiative-11223344",
    title: "Groundwork",
    description: "Build workflow",
    status: "active",
    phases: [{ id: "phase-1", name: "Phase 1", order: 1, status: "active" }],
    specIds: [],
    ticketIds: ["ticket-aabbccdd"],
    createdAt: now,
    updatedAt: now
  };
  await store.upsertInitiative(initiative, {
    brief: "# Brief",
    prd: "# PRD",
    techSpec: "# Tech"
  });

  const ticket: Ticket = {
    id: "ticket-aabbccdd",
    initiativeId: "initiative-11223344",
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
    staticDir,
    fetchImpl: async (input, init) => {
      if (typeof input === "string" && input === "https://openrouter.ai/api/v1/models") {
        void init;

        return new Response(
          JSON.stringify({
            data: [
              { id: "openrouter/auto", name: "Auto Router", context_length: 200000 },
              { id: "openai/gpt-4o-mini", name: "GPT-4o mini", context_length: 128000 }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      throw new Error(`Unexpected fetch request: ${String(input)}`);
    }
  });

  const cleanup = async (): Promise<void> => {
    await server.close();
    await rm(rootDir, { recursive: true, force: true });
  };

  return {
    rootDir,
    staticDir,
    store,
    server,
    run,
    initiative,
    ticket,
    cleanup
  };
};
