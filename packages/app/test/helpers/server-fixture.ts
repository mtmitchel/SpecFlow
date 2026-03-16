import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSpecFlowServer } from "../../src/server/create-server.js";
import { specflowDir } from "../../src/io/paths.js";
import { createInitiativeWorkflow } from "../../src/planner/workflow-state.js";
import { ArtifactStore } from "../../src/store/artifact-store.js";
import type { Initiative, PlanningReviewArtifact, Run, Ticket } from "../../src/types/entities.js";

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
    specIds: [
      "initiative-11223344:brief",
      "initiative-11223344:core-flows",
      "initiative-11223344:prd",
      "initiative-11223344:tech-spec"
    ],
    ticketIds: ["ticket-aabbccdd"],
    workflow: {
      ...createInitiativeWorkflow(),
      steps: {
        brief: { status: "complete", updatedAt: now },
        "core-flows": { status: "complete", updatedAt: now },
        prd: { status: "complete", updatedAt: now },
        "tech-spec": { status: "complete", updatedAt: now },
        tickets: { status: "complete", updatedAt: now }
      },
      activeStep: "tickets"
    },
    createdAt: now,
    updatedAt: now
  };
  await store.upsertInitiative(initiative, {
    brief: "# Brief",
    coreFlows: "# Core Flows",
    prd: "# PRD",
    techSpec: "# Tech"
  });
  const passedReviews: PlanningReviewArtifact[] = [
    {
      id: `${initiative.id}:brief-review`,
      initiativeId: initiative.id,
      kind: "brief-review",
      status: "passed",
      summary: "Brief passes review.",
      findings: [],
      sourceUpdatedAts: { brief: now },
      overrideReason: null,
      reviewedAt: now,
      updatedAt: now
    },
    {
      id: `${initiative.id}:core-flows-review`,
      initiativeId: initiative.id,
      kind: "core-flows-review",
      status: "passed",
      summary: "Core flows pass review.",
      findings: [],
      sourceUpdatedAts: { "core-flows": now },
      overrideReason: null,
      reviewedAt: now,
      updatedAt: now
    },
    {
      id: `${initiative.id}:brief-core-flows-crosscheck`,
      initiativeId: initiative.id,
      kind: "brief-core-flows-crosscheck",
      status: "passed",
      summary: "Brief and core flows align.",
      findings: [],
      sourceUpdatedAts: { brief: now, "core-flows": now },
      overrideReason: null,
      reviewedAt: now,
      updatedAt: now
    },
    {
      id: `${initiative.id}:prd-review`,
      initiativeId: initiative.id,
      kind: "prd-review",
      status: "passed",
      summary: "PRD passes review.",
      findings: [],
      sourceUpdatedAts: { prd: now },
      overrideReason: null,
      reviewedAt: now,
      updatedAt: now
    },
    {
      id: `${initiative.id}:core-flows-prd-crosscheck`,
      initiativeId: initiative.id,
      kind: "core-flows-prd-crosscheck",
      status: "passed",
      summary: "Core flows and PRD align.",
      findings: [],
      sourceUpdatedAts: { "core-flows": now, prd: now },
      overrideReason: null,
      reviewedAt: now,
      updatedAt: now
    },
    {
      id: `${initiative.id}:tech-spec-review`,
      initiativeId: initiative.id,
      kind: "tech-spec-review",
      status: "passed",
      summary: "Tech spec passes review.",
      findings: [],
      sourceUpdatedAts: { "tech-spec": now },
      overrideReason: null,
      reviewedAt: now,
      updatedAt: now
    },
    {
      id: `${initiative.id}:prd-tech-spec-crosscheck`,
      initiativeId: initiative.id,
      kind: "prd-tech-spec-crosscheck",
      status: "passed",
      summary: "PRD and tech spec align.",
      findings: [],
      sourceUpdatedAts: { prd: now, "tech-spec": now },
      overrideReason: null,
      reviewedAt: now,
      updatedAt: now
    },
    {
      id: `${initiative.id}:spec-set-review`,
      initiativeId: initiative.id,
      kind: "spec-set-review",
      status: "passed",
      summary: "Spec set passes review.",
      findings: [],
      sourceUpdatedAts: { brief: now, "core-flows": now, prd: now, "tech-spec": now },
      overrideReason: null,
      reviewedAt: now,
      updatedAt: now
    }
  ];
  for (const review of passedReviews) {
    await store.upsertPlanningReview(review);
  }

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
      void init;
      const url = typeof input === "string" ? input : (input as Request).url;

      if (url === "https://openrouter.ai/api/v1/models") {
        return new Response(
          JSON.stringify({
            data: [
              { id: "openrouter/auto", name: "Auto Router", context_length: 200000 },
              { id: "openai/gpt-4o-mini", name: "GPT-4o mini", context_length: 128000 }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === "https://api.openai.com/v1/models") {
        return new Response(
          JSON.stringify({
            data: [
              { id: "gpt-4o", name: "gpt-4o" },
              { id: "gpt-4o-mini", name: "gpt-4o-mini" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === "https://api.anthropic.com/v1/models") {
        return new Response(
          JSON.stringify({
            data: [
              { id: "claude-sonnet-4-5-20250514", display_name: "Claude Sonnet 4.5" },
              { id: "claude-opus-4-6-20260515", display_name: "Claude Opus 4.6" }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch request: ${url}`);
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
