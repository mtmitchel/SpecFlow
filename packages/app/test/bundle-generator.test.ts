import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BundleGenerator } from "../src/bundle/bundle-generator.js";
import { renderBundleForAgent } from "../src/bundle/renderers.js";
import { runYamlPath, specflowDir, verificationPath } from "../src/io/paths.js";
import { readYamlFile, writeYamlFile } from "../src/io/yaml.js";
import { createInitiativeWorkflow } from "../src/planner/workflow-state.js";
import { ArtifactStore } from "../src/store/artifact-store.js";
import type { BundleManifest } from "../src/bundle/types.js";
import type {
  Initiative,
  PlanningReviewArtifact,
  Ticket,
  TicketCoverageArtifact
} from "../src/types/entities.js";

const now = "2026-02-27T20:00:00.000Z";

const createSpecflowLayout = async (rootDir: string): Promise<void> => {
  const base = specflowDir(rootDir);
  await mkdir(path.join(base, "initiatives"), { recursive: true });
  await mkdir(path.join(base, "tickets"), { recursive: true });
  await mkdir(path.join(base, "runs"), { recursive: true });
  await mkdir(path.join(base, "decisions"), { recursive: true });
  await writeFile(path.join(base, "AGENTS.md"), "Always write tests.\n", "utf8");
};

describe("renderBundleForAgent golden renderers", () => {
  const inputBase = {
    ticket: {
      id: "ticket-1",
      initiativeId: "initiative-1",
      phaseId: "phase-1",
      title: "Implement login",
      description: "Add login endpoint",
      status: "ready",
      acceptanceCriteria: [{ id: "c1", text: "Endpoint exists" }],
      implementationPlan: "1. Add route",
      fileTargets: ["src/auth.ts"],
      coverageItemIds: ["coverage-prd-requirements-1"],
      blockedBy: [],
      blocks: [],
      runId: null,
      createdAt: now,
      updatedAt: now
    } satisfies Ticket,
    coveredItems: [
      {
        id: "coverage-prd-requirements-1",
        sourceStep: "prd",
        sectionKey: "requirements",
        sectionLabel: "Requirements",
        kind: "requirement",
        text: "Add the login endpoint."
      }
    ],
    exportMode: "standard" as const,
    sourceRunId: null,
    sourceFindingId: null,
    agentsMd: "Always write tests.",
    contextFiles: [
      {
        relativePath: "specs/brief.md",
        content: "# Brief"
      }
    ]
  };

  it("matches golden output for claude-code", () => {
    const rendered = renderBundleForAgent({ ...inputBase, agentTarget: "claude-code" });
    expect(rendered).toMatchSnapshot();
  });

  it("matches golden output for codex-cli", () => {
    const rendered = renderBundleForAgent({ ...inputBase, agentTarget: "codex-cli" });
    expect(rendered).toMatchSnapshot();
  });

  it("matches golden output for opencode", () => {
    const rendered = renderBundleForAgent({ ...inputBase, agentTarget: "opencode" });
    expect(rendered).toMatchSnapshot();
  });

  it("matches golden output for generic", () => {
    const rendered = renderBundleForAgent({ ...inputBase, agentTarget: "generic" });
    expect(rendered).toMatchSnapshot();
  });
});

describe("BundleGenerator", () => {
  it("exports directory + flat bundle + manifest + snapshot using staged commit", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-bundle-"));
    await createSpecflowLayout(rootDir);
    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await writeFile(path.join(rootDir, "src", "auth.ts"), "export const auth = true;\n", "utf8");

    const store = new ArtifactStore({ rootDir, now: () => new Date(now) });
    await store.initialize();

    const initiative: Initiative = {
      id: "initiative-1",
      title: "Auth",
      description: "Build auth",
      status: "active",
      phases: [],
      specIds: [],
      ticketIds: ["ticket-1"],
      workflow: createInitiativeWorkflow(),
      createdAt: now,
      updatedAt: now
    };

    const ticket: Ticket = {
      id: "ticket-1",
      initiativeId: initiative.id,
      phaseId: null,
      title: "Implement login",
      description: "Add login endpoint",
      status: "ready",
      acceptanceCriteria: [{ id: "c1", text: "Endpoint exists" }],
      implementationPlan: "1. Add route",
      fileTargets: ["src/auth.ts"],
      coverageItemIds: ["coverage-prd-requirements-1"],
      blockedBy: [],
      blocks: [],
      runId: null,
      createdAt: now,
      updatedAt: now
    };
    const coverageReview: PlanningReviewArtifact = {
      id: `${initiative.id}:ticket-coverage-review`,
      initiativeId: initiative.id,
      kind: "ticket-coverage-review",
      status: "passed",
      summary: "Coverage check passes.",
      findings: [],
      sourceUpdatedAts: { brief: now, prd: now, "tech-spec": now, tickets: now },
      overrideReason: null,
      reviewedAt: now,
      updatedAt: now
    };
    const coverage: TicketCoverageArtifact = {
      id: `${initiative.id}:ticket-coverage`,
      initiativeId: initiative.id,
      items: [
        {
          id: "coverage-prd-requirements-1",
          sourceStep: "prd",
          sectionKey: "requirements",
          sectionLabel: "Requirements",
          kind: "requirement",
          text: "Add the login endpoint."
        }
      ],
      uncoveredItemIds: [],
      sourceUpdatedAts: { brief: now, prd: now, "tech-spec": now, tickets: now },
      generatedAt: now,
      updatedAt: now
    };

    await store.upsertInitiative(initiative, {
      brief: "# Brief\n",
      prd: "# PRD\n",
      techSpec: "# Tech Spec\n"
    });
    await store.upsertPlanningReview(coverageReview);
    await store.upsertTicketCoverageArtifact(coverage);
    await store.upsertTicket(ticket);

    const generator = new BundleGenerator({
      rootDir,
      store,
      now: () => new Date(now),
      idGenerator: (() => {
        const ids = ["runseed", "attemptseed", "opseeda", "quickseed", "attempt2", "opseedb"];
        let index = 0;
        return () => ids[index++] ?? `id${index}`;
      })()
    });

    const result = await generator.exportBundle({
      ticketId: ticket.id,
      agentTarget: "codex-cli",
      exportMode: "standard"
    });

    expect(result.flatString).toContain("Codex Task Bundle");
    expect(result.manifest.bundleSchemaVersion).toBe("1.0.0");
    expect(result.manifest.exportMode).toBe("standard");

    const promptPath = path.join(result.bundlePath, "PROMPT.md");
    const agentsPath = path.join(result.bundlePath, "AGENTS.md");
    const briefPath = path.join(result.bundlePath, "specs", "brief.md");
    const snapshotPath = path.join(rootDir, "specflow", "runs", result.runId, "attempts", result.attemptId, "snapshot-before", "src", "auth.ts");

    await expect(readFile(promptPath, "utf8")).resolves.toContain("Codex Task Bundle");
    await expect(readFile(agentsPath, "utf8")).resolves.toContain("Always write tests");
    await expect(readFile(briefPath, "utf8")).resolves.toContain("# Brief");
    await expect(readFile(snapshotPath, "utf8")).resolves.toContain("export const auth = true;");

    const manifestPath = path.join(rootDir, "specflow", "runs", result.runId, "attempts", result.attemptId, "bundle-manifest.yaml");
    const manifest = await readYamlFile<BundleManifest>(manifestPath);
    expect(manifest?.contentDigest).toBeTruthy();
    expect(manifest?.requiredFiles).toContain("bundle/PROMPT.md");

    const runYaml = await readYamlFile<{ committedAttemptId: string | null }>(runYamlPath(rootDir, result.runId));
    expect(runYaml?.committedAttemptId).toBe(result.attemptId);

    const updatedTicket = store.tickets.get(ticket.id);
    expect(updatedTicket?.status).toBe("in-progress");
    expect(updatedTicket?.runId).toBe(result.runId);

    await store.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("writes quick-fix linkage metadata in manifest", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-bundle-quick-"));
    await createSpecflowLayout(rootDir);

    const store = new ArtifactStore({ rootDir, now: () => new Date(now) });
    await store.initialize();

    const ticket: Ticket = {
      id: "ticket-quick",
      initiativeId: null,
      phaseId: null,
      title: "Quick fix",
      description: "Patch issue",
      status: "ready",
      acceptanceCriteria: [{ id: "c1", text: "Issue patched" }],
      implementationPlan: "",
      fileTargets: [],
      coverageItemIds: [],
      blockedBy: [],
      blocks: [],
      runId: null,
      createdAt: now,
      updatedAt: now
    };

    await store.upsertTicket(ticket);

    const generator = new BundleGenerator({
      rootDir,
      store,
      now: () => new Date(now),
      idGenerator: (() => {
        const ids = ["r1", "a1", "o1"];
        let index = 0;
        return () => ids[index++] ?? `id${index}`;
      })()
    });

    const result = await generator.exportBundle({
      ticketId: ticket.id,
      agentTarget: "generic",
      exportMode: "quick-fix",
      sourceRunId: "run-source",
      sourceFindingId: "finding-7"
    });

    expect(result.manifest.exportMode).toBe("quick-fix");
    expect(result.manifest.sourceRunId).toBe("run-source");
    expect(result.manifest.sourceFindingId).toBe("finding-7");

    await store.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("returns the same terminal result when operationId is retried", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-bundle-idempotent-"));
    await createSpecflowLayout(rootDir);

    const store = new ArtifactStore({ rootDir, now: () => new Date(now) });
    await store.initialize();

    const ticket: Ticket = {
      id: "ticket-repeat",
      initiativeId: null,
      phaseId: null,
      title: "Repeatable export",
      description: "Export once",
      status: "ready",
      acceptanceCriteria: [{ id: "c1", text: "bundle created" }],
      implementationPlan: "",
      fileTargets: [],
      coverageItemIds: [],
      blockedBy: [],
      blocks: [],
      runId: null,
      createdAt: now,
      updatedAt: now
    };

    await store.upsertTicket(ticket);

    const generator = new BundleGenerator({
      rootDir,
      store,
      now: () => new Date(now),
      idGenerator: (() => {
        const ids = ["rid", "aid", "oid", "extra"];
        let index = 0;
        return () => ids[index++] ?? `id${index}`;
      })()
    });

    const first = await generator.exportBundle({
      ticketId: ticket.id,
      agentTarget: "generic",
      exportMode: "standard",
      operationId: "op-repeat"
    });

    const second = await generator.exportBundle({
      ticketId: ticket.id,
      agentTarget: "generic",
      exportMode: "standard",
      operationId: "op-repeat"
    });

    expect(second.runId).toBe(first.runId);
    expect(second.attemptId).toBe(first.attemptId);
    expect(second.flatString).toBe(first.flatString);

    await store.close();
    await rm(rootDir, { recursive: true, force: true });
  });
});
