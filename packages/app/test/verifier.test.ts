import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verificationPath } from "../src/io/paths.js";
import type { LlmClient, LlmRequest, LlmTokenHandler } from "../src/llm/client.js";
import { ArtifactStore } from "../src/store/artifact-store.js";
import type { Run, Ticket } from "../src/types/entities.js";
import { DiffEngine } from "../src/verify/diff-engine.js";
import { VerifierService } from "../src/verify/verifier-service.js";

const now = "2026-02-27T20:00:00.000Z";

const createSpecflowLayout = async (rootDir: string): Promise<void> => {
  await mkdir(path.join(rootDir, "specflow", "initiatives"), { recursive: true });
  await mkdir(path.join(rootDir, "specflow", "tickets"), { recursive: true });
  await mkdir(path.join(rootDir, "specflow", "runs"), { recursive: true });
  await mkdir(path.join(rootDir, "specflow", "decisions"), { recursive: true });
  await writeFile(path.join(rootDir, "specflow", "AGENTS.md"), "Always verify carefully.\n", "utf8");
};

class MockLlmClient implements LlmClient {
  private readonly responses: string[];

  public constructor(responses: string[]) {
    this.responses = [...responses];
  }

  public async complete(_request: LlmRequest, onToken?: LlmTokenHandler): Promise<string> {
    if (onToken) {
      await onToken("token-1");
    }

    const response = this.responses.shift();
    if (!response) {
      throw new Error("No mock response available");
    }

    return response;
  }
}

describe("DiffEngine", () => {
  it("uses git diff when repository is available", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-diff-git-"));
    await createSpecflowLayout(rootDir);
    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await writeFile(path.join(rootDir, "src", "app.ts"), "export const value = 1;\n", "utf8");

    execFileSync("git", ["init"], { cwd: rootDir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: rootDir });
    execFileSync("git", ["config", "user.name", "Tester"], { cwd: rootDir });
    execFileSync("git", ["add", "."], { cwd: rootDir });
    execFileSync("git", ["commit", "-m", "init"], { cwd: rootDir });

    await writeFile(path.join(rootDir, "src", "app.ts"), "export const value = 2;\n", "utf8");

    const engine = new DiffEngine({ rootDir });
    const result = await engine.computeDiff({
      ticket: {
        id: "t1",
        initiativeId: null,
        phaseId: null,
        title: "t",
        description: "d",
        status: "ready",
        acceptanceCriteria: [],
        implementationPlan: "",
        fileTargets: ["src/app.ts"],
        runId: null,
        createdAt: now,
        updatedAt: now
      },
      runId: "run-1",
      baselineAttemptId: "attempt-1",
      widenedScopePaths: []
    });

    expect(result.diffSource).toBe("git");
    expect(result.primaryDiff).toContain("diff --git");

    await rm(rootDir, { recursive: true, force: true });
  });

  it("uses snapshot dual-diff mode when git is unavailable", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-diff-snapshot-"));
    await createSpecflowLayout(rootDir);
    await mkdir(path.join(rootDir, "src"), { recursive: true });

    const runId = "run-1";
    const baselineAttemptId = "attempt-base";

    await mkdir(
      path.join(rootDir, "specflow", "runs", runId, "attempts", baselineAttemptId, "snapshot-before", "src"),
      { recursive: true }
    );

    await writeFile(
      path.join(rootDir, "specflow", "runs", runId, "attempts", baselineAttemptId, "snapshot-before", "src", "a.ts"),
      "export const a = 1;\n",
      "utf8"
    );
    await writeFile(path.join(rootDir, "src", "a.ts"), "export const a = 2;\n", "utf8");
    await writeFile(path.join(rootDir, "src", "w.ts"), "export const w = 1;\n", "utf8");

    const engine = new DiffEngine({ rootDir });
    const result = await engine.computeDiff({
      ticket: {
        id: "t1",
        initiativeId: null,
        phaseId: null,
        title: "t",
        description: "d",
        status: "ready",
        acceptanceCriteria: [],
        implementationPlan: "",
        fileTargets: ["src/a.ts"],
        runId: null,
        createdAt: now,
        updatedAt: now
      },
      runId,
      baselineAttemptId,
      widenedScopePaths: ["src/w.ts"]
    });

    expect(result.diffSource).toBe("snapshot");
    expect(result.primaryDiff).toContain("a/src/a.ts");
    expect(result.driftDiff).toContain("a/src/w.ts");
    expect(result.driftFlags.some((flag) => flag.type === "widened-scope-drift")).toBe(true);

    await rm(rootDir, { recursive: true, force: true });
  });
});

describe("VerifierService", () => {
  it("parses pass/fail + drift flags and persists verification attempt", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-verify-"));
    await createSpecflowLayout(rootDir);
    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await writeFile(path.join(rootDir, "src", "a.ts"), "export const a = 2;\n", "utf8");

    const run: Run = {
      id: "run-1",
      ticketId: "ticket-1",
      type: "execution",
      agentType: "codex-cli",
      status: "pending",
      attempts: ["attempt-base"],
      committedAttemptId: "attempt-base",
      activeOperationId: null,
      operationLeaseExpiresAt: null,
      lastCommittedAt: now,
      createdAt: now
    };

    const ticket: Ticket = {
      id: "ticket-1",
      initiativeId: null,
      phaseId: null,
      title: "Verify",
      description: "Verify ticket",
      status: "in-progress",
      acceptanceCriteria: [
        { id: "c1", text: "A" },
        { id: "c2", text: "B" }
      ],
      implementationPlan: "",
      fileTargets: ["src/a.ts"],
      coverageItemIds: [],
      blockedBy: [],
      blocks: [],
      runId: run.id,
      createdAt: now,
      updatedAt: now
    };

    await mkdir(path.join(rootDir, "specflow", "runs", run.id, "attempts", "attempt-base", "snapshot-before", "src"), {
      recursive: true
    });
    await writeFile(
      path.join(rootDir, "specflow", "runs", run.id, "attempts", "attempt-base", "snapshot-before", "src", "a.ts"),
      "export const a = 1;\n",
      "utf8"
    );

    const store = new ArtifactStore({ rootDir, now: () => new Date(now) });
    await store.initialize();
    await store.upsertConfig({
      provider: "openrouter",
      model: "openrouter/model",
      port: 3141,
      host: "127.0.0.1",
      repoInstructionFile: "specflow/AGENTS.md"
    });
    process.env.OPENROUTER_API_KEY = "test-key";
    await store.upsertRun(run);
    await store.upsertTicket(ticket);

    const verifier = new VerifierService({
      rootDir,
      store,
      llmClient: new MockLlmClient([
        JSON.stringify({
          criteriaResults: [
            { criterionId: "c1", pass: true, evidence: "present" },
            { criterionId: "c2", pass: false, evidence: "missing" }
          ],
          driftFlags: [{ type: "unexpected-file", file: "src/x.ts", description: "unexpected" }],
          overallPass: false
        })
      ]),
      now: () => new Date(now),
      idGenerator: (() => {
        const ids = ["att1", "op1"];
        let index = 0;
        return () => ids[index++] ?? `id${index}`;
      })()
    });

    const result = await verifier.captureAndVerify({
      ticketId: ticket.id,
      agentSummary: "summary",
      operationId: "op-repeat"
    });
    expect(result.overallPass).toBe(false);
    expect(result.attempt.criteriaResults).toHaveLength(2);
    expect(result.attempt.driftFlags.some((flag) => flag.type === "missing-requirement")).toBe(true);
    expect(store.tickets.get(ticket.id)?.status).toBe("verify");

    const persisted = await readFile(verificationPath(rootDir, run.id, result.attempt.attemptId), "utf8");
    expect(persisted).toContain("missing-requirement");

    const retried = await verifier.captureAndVerify({
      ticketId: ticket.id,
      agentSummary: "summary",
      operationId: "op-repeat"
    });
    expect(retried.attempt.attemptId).toBe(result.attempt.attemptId);

    await store.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("persists override reason and marks ticket done", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-override-"));
    await createSpecflowLayout(rootDir);

    const runId = "run-1";
    const attemptId = "attempt-1";

    const store = new ArtifactStore({ rootDir, now: () => new Date(now) });
    await store.initialize();

    const run: Run = {
      id: runId,
      ticketId: "ticket-1",
      type: "execution",
      agentType: "codex-cli",
      status: "pending",
      attempts: [attemptId],
      committedAttemptId: attemptId,
      activeOperationId: null,
      operationLeaseExpiresAt: null,
      lastCommittedAt: now,
      createdAt: now
    };

    const ticket: Ticket = {
      id: "ticket-1",
      initiativeId: null,
      phaseId: null,
      title: "Override",
      description: "Override ticket",
      status: "verify",
      acceptanceCriteria: [{ id: "c1", text: "A" }],
      implementationPlan: "",
      fileTargets: [],
      coverageItemIds: [],
      blockedBy: [],
      blocks: [],
      runId,
      createdAt: now,
      updatedAt: now
    };

    await store.upsertRun(run);
    await store.upsertTicket(ticket);
    await store.upsertRunAttempt(runId, {
      attemptId,
      agentSummary: "",
      diffSource: "snapshot",
      initialScopePaths: [],
      widenedScopePaths: [],
      primaryDiffPath: "diff-primary.patch",
      driftDiffPath: null,
      overrideReason: null,
      overrideAccepted: false,
      criteriaResults: [{ criterionId: "c1", pass: false, evidence: "missing" }],
      driftFlags: [],
      overallPass: false,
      createdAt: now
    });

    await writeFile(path.join(rootDir, "specflow", "runs", runId, "attempts", attemptId, "diff-primary.patch"), "diff", "utf8");

    const verifier = new VerifierService({
      rootDir,
      store,
      llmClient: new MockLlmClient([]),
      now: () => new Date(now),
      idGenerator: (() => {
        const ids = ["override-attempt", "override-op"];
        let index = 0;
        return () => ids[index++] ?? `id${index}`;
      })()
    });

    const result = await verifier.overrideDone({
      ticketId: ticket.id,
      reason: "Business accepted risk",
      overrideAccepted: true
    });

    expect(result.attempt.overrideAccepted).toBe(true);
    expect(result.attempt.overrideReason).toBe("Business accepted risk");
    expect(store.tickets.get(ticket.id)?.status).toBe("done");

    const persisted = await readFile(verificationPath(rootDir, runId, result.attempt.attemptId), "utf8");
    expect(persisted).toContain("Business accepted risk");

    await store.close();
    await rm(rootDir, { recursive: true, force: true });
  });
});
