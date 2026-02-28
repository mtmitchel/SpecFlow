import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeYamlFile } from "../src/io/yaml.js";
import {
  attemptDir,
  operationManifestPath,
  runYamlPath,
  specflowDir,
  ticketPath,
  verificationPath
} from "../src/io/paths.js";
import { ArtifactStore } from "../src/store/artifact-store.js";
import { RetryableConflictError } from "../src/store/errors.js";
import type {
  Config,
  Initiative,
  OperationManifest,
  Run,
  RunAttempt,
  Ticket
} from "../src/types/entities.js";

const now = "2026-02-27T20:00:00.000Z";

const createSpecflowLayout = async (rootDir: string): Promise<void> => {
  const base = specflowDir(rootDir);
  await mkdir(path.join(base, "initiatives"), { recursive: true });
  await mkdir(path.join(base, "tickets"), { recursive: true });
  await mkdir(path.join(base, "runs"), { recursive: true });
  await mkdir(path.join(base, "decisions"), { recursive: true });
};

const makeStore = (rootDir: string): ArtifactStore =>
  new ArtifactStore({
    rootDir,
    cleanupIntervalMs: 10_000,
    cleanupTtlMs: 10_000,
    now: () => new Date(now)
  });

const makeRun = (overrides: Partial<Run> = {}): Run => ({
  id: "run-1",
  ticketId: "ticket-1",
  type: "execution",
  agentType: "codex-cli",
  status: "pending",
  attempts: [],
  committedAttemptId: null,
  activeOperationId: null,
  operationLeaseExpiresAt: null,
  lastCommittedAt: null,
  createdAt: now,
  ...overrides
});

const makeAttempt = (overrides: Partial<RunAttempt> = {}): RunAttempt => ({
  attemptId: "attempt-1",
  agentSummary: "implemented auth",
  diffSource: "git",
  initialScopePaths: ["src/auth.ts"],
  widenedScopePaths: [],
  primaryDiffPath: "diff-primary.patch",
  driftDiffPath: null,
  overrideReason: null,
  overrideAccepted: false,
  criteriaResults: [{ criterionId: "c1", pass: true, evidence: "Found implementation" }],
  driftFlags: [],
  overallPass: true,
  createdAt: now,
  ...overrides
});

const waitFor = async (predicate: () => boolean, timeoutMs: number): Promise<void> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for condition (${timeoutMs}ms)`);
};

describe("ArtifactStore", () => {
  it("round-trips config, initiative, ticket, run, run attempt, and spec documents", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-roundtrip-"));
    await createSpecflowLayout(rootDir);

    const config: Config = {
      provider: "anthropic",
      model: "claude-opus-4-5",
      apiKey: "",
      port: 3141,
      host: "127.0.0.1",
      repoInstructionFile: "specflow/AGENTS.md"
    };

    const initiative: Initiative = {
      id: "initiative-1",
      title: "User Auth",
      description: "Build authentication",
      status: "active",
      phases: [{ id: "phase-1", name: "Foundation", order: 1, status: "active" }],
      specIds: ["initiative-1:brief", "initiative-1:prd", "initiative-1:tech-spec"],
      ticketIds: ["ticket-1"],
      createdAt: now,
      updatedAt: now
    };

    const ticket: Ticket = {
      id: "ticket-1",
      initiativeId: initiative.id,
      phaseId: "phase-1",
      title: "Create login endpoint",
      description: "Implement login route",
      status: "ready",
      acceptanceCriteria: [{ id: "c1", text: "Route exists" }],
      implementationPlan: "1. Add route\n2. Add tests",
      fileTargets: ["src/routes/auth.ts"],
      blockedBy: [],
      blocks: [],
      runId: "run-1",
      createdAt: now,
      updatedAt: now
    };

    const run = makeRun();
    const attempt = makeAttempt();

    const store = makeStore(rootDir);
    await store.initialize();
    await store.upsertConfig(config);
    await store.upsertInitiative(initiative, {
      brief: "# Brief\n",
      prd: "# PRD\n",
      techSpec: "# Tech Spec\n"
    });
    await store.upsertTicket(ticket);
    await store.upsertRun(run);
    await store.upsertRunAttempt(run.id, attempt);
    await store.upsertSpec({
      id: "adr-1",
      initiativeId: null,
      type: "decision",
      title: "Use Fastify",
      content: "# Decision\nUse Fastify",
      sourcePath: "",
      createdAt: now,
      updatedAt: now
    });

    await store.close();

    const reloaded = makeStore(rootDir);
    await reloaded.initialize();

    expect(reloaded.config).toEqual(config);
    expect(reloaded.initiatives.get(initiative.id)).toEqual(initiative);
    expect(reloaded.tickets.get(ticket.id)).toEqual(ticket);
    expect(reloaded.runs.get(run.id)).toEqual(run);
    expect(reloaded.runAttempts.get("run-1:attempt-1")).toEqual(attempt);

    const decision = Array.from(reloaded.specs.values()).find((spec) => spec.type === "decision");
    expect(decision?.content).toContain("Use Fastify");

    await reloaded.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("keeps staged outputs hidden until operation commit", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-staged-"));
    await createSpecflowLayout(rootDir);

    const store = makeStore(rootDir);
    await store.initialize();
    await store.upsertRun(makeRun());

    await store.prepareRunOperation({
      runId: "run-1",
      operationId: "op-1",
      attemptId: "attempt-1",
      leaseMs: 30_000,
      artifacts: {
        verification: makeAttempt(),
        bundleFlat: "# Export"
      },
      validation: {
        passed: true,
        details: "preflight ok"
      }
    });

    const runAfterPrepare = store.runs.get("run-1");
    expect(runAfterPrepare?.committedAttemptId).toBeNull();

    const manifest = await readFile(operationManifestPath(rootDir, "run-1", "op-1"), "utf8");
    expect(manifest).toContain("state: prepared");

    await expect(readFile(verificationPath(rootDir, "run-1", "attempt-1"), "utf8")).rejects.toHaveProperty(
      "code",
      "ENOENT"
    );

    await store.commitRunOperation({ runId: "run-1", operationId: "op-1" });

    const runAfterCommit = store.runs.get("run-1");
    expect(runAfterCommit?.committedAttemptId).toBe("attempt-1");
    expect(runAfterCommit?.activeOperationId).toBeNull();

    const verification = await readFile(verificationPath(rootDir, "run-1", "attempt-1"), "utf8");
    expect(verification).toContain("implemented auth");

    await store.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("rejects concurrent writes to the same run with retryable conflict", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-conflict-"));
    await createSpecflowLayout(rootDir);

    const run = makeRun({
      activeOperationId: "op-existing",
      operationLeaseExpiresAt: "2026-02-27T21:00:00.000Z"
    });

    const store = makeStore(rootDir);
    await store.initialize();
    await store.upsertRun(run);

    await expect(
      store.prepareRunOperation({
        runId: "run-1",
        operationId: "op-next",
        attemptId: "attempt-1",
        leaseMs: 30_000,
        artifacts: {}
      })
    ).rejects.toBeInstanceOf(RetryableConflictError);

    await store.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("marks expired lease operations as abandoned on next access", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-lease-"));
    await createSpecflowLayout(rootDir);

    const store = makeStore(rootDir);
    await store.initialize();

    await store.upsertRun(
      makeRun({
        activeOperationId: "op-stale",
        operationLeaseExpiresAt: "2026-02-27T19:59:00.000Z"
      })
    );

    const staleManifest: OperationManifest = {
      operationId: "op-stale",
      runId: "run-1",
      targetAttemptId: "attempt-stale",
      state: "prepared",
      leaseExpiresAt: "2026-02-27T19:59:00.000Z",
      validation: { passed: true },
      preparedAt: now,
      updatedAt: now
    };
    await writeYamlFile(operationManifestPath(rootDir, "run-1", "op-stale"), staleManifest);

    await store.prepareRunOperation({
      runId: "run-1",
      operationId: "op-fresh",
      attemptId: "attempt-2",
      leaseMs: 30_000,
      artifacts: {}
    });

    const staleManifestRaw = await readFile(operationManifestPath(rootDir, "run-1", "op-stale"), "utf8");
    expect(staleManifestRaw).toContain("state: abandoned");
    expect(store.runs.get("run-1")?.activeOperationId).toBe("op-fresh");

    await store.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("recovers orphaned operations on startup for abandoned, superseded, and failed cases", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-recovery-"));
    await createSpecflowLayout(rootDir);

    const runAbandoned: Run = makeRun({
      id: "run-abandoned",
      activeOperationId: "op-abandoned",
      operationLeaseExpiresAt: "2026-02-27T21:00:00.000Z",
      committedAttemptId: null
    });
    const runSuperseded: Run = makeRun({
      id: "run-superseded",
      activeOperationId: "op-superseded",
      operationLeaseExpiresAt: "2026-02-27T21:00:00.000Z",
      committedAttemptId: "attempt-committed",
      attempts: ["attempt-committed"]
    });
    const runFailed: Run = makeRun({
      id: "run-failed",
      activeOperationId: "op-failed",
      operationLeaseExpiresAt: "2026-02-27T21:00:00.000Z"
    });

    await writeYamlFile(runYamlPath(rootDir, runAbandoned.id), runAbandoned);
    await writeYamlFile(runYamlPath(rootDir, runSuperseded.id), runSuperseded);
    await writeYamlFile(runYamlPath(rootDir, runFailed.id), runFailed);

    await writeYamlFile(operationManifestPath(rootDir, runAbandoned.id, "op-abandoned"), {
      operationId: "op-abandoned",
      runId: runAbandoned.id,
      targetAttemptId: "attempt-a",
      state: "prepared",
      leaseExpiresAt: "2026-02-27T21:00:00.000Z",
      validation: { passed: true },
      preparedAt: now,
      updatedAt: now
    } satisfies OperationManifest);

    await writeYamlFile(operationManifestPath(rootDir, runSuperseded.id, "op-superseded"), {
      operationId: "op-superseded",
      runId: runSuperseded.id,
      targetAttemptId: "attempt-b",
      state: "prepared",
      leaseExpiresAt: "2026-02-27T21:00:00.000Z",
      validation: { passed: true },
      preparedAt: now,
      updatedAt: now
    } satisfies OperationManifest);

    await mkdir(attemptDir(rootDir, runSuperseded.id, "attempt-committed"), { recursive: true });

    const store = makeStore(rootDir);
    await store.initialize();

    const abandonedManifest = await readFile(
      operationManifestPath(rootDir, runAbandoned.id, "op-abandoned"),
      "utf8"
    );
    expect(abandonedManifest).toContain("state: abandoned");

    const supersededManifest = await readFile(
      operationManifestPath(rootDir, runSuperseded.id, "op-superseded"),
      "utf8"
    );
    expect(supersededManifest).toContain("state: superseded");

    const failedManifest = await readFile(operationManifestPath(rootDir, runFailed.id, "op-failed"), "utf8");
    expect(failedManifest).toContain("state: failed");

    expect(store.runs.get(runAbandoned.id)?.activeOperationId).toBeNull();
    expect(store.runs.get(runSuperseded.id)?.activeOperationId).toBeNull();
    expect(store.runs.get(runFailed.id)?.activeOperationId).toBeNull();

    await store.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("reloads external ticket edits via file watcher within two seconds", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-watch-"));
    await createSpecflowLayout(rootDir);

    const ticket: Ticket = {
      id: "ticket-watch",
      initiativeId: null,
      phaseId: null,
      title: "Initial title",
      description: "description",
      status: "ready",
      acceptanceCriteria: [],
      implementationPlan: "",
      fileTargets: [],
      runId: null,
      createdAt: now,
      updatedAt: now
    };

    await writeYamlFile(ticketPath(rootDir, ticket.id), ticket);

    const store = makeStore(rootDir);
    await store.initialize({ watch: true });

    await writeYamlFile(ticketPath(rootDir, ticket.id), {
      ...ticket,
      title: "Updated externally"
    });

    await waitFor(() => store.tickets.get(ticket.id)?.title === "Updated externally", 2000);

    await store.close();
    await rm(rootDir, { recursive: true, force: true });
  });
});
