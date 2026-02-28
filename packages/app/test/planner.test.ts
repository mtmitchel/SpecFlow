import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { specflowDir } from "../src/io/paths.js";
import type { LlmClient, LlmRequest, LlmTokenHandler } from "../src/llm/client.js";
import { parseJsonEnvelope } from "../src/planner/json-parser.js";
import { PlannerService } from "../src/planner/planner-service.js";
import { ArtifactStore } from "../src/store/artifact-store.js";

class MockLlmClient implements LlmClient {
  public readonly requests: LlmRequest[] = [];
  private readonly responses: string[];

  public constructor(responses: string[]) {
    this.responses = [...responses];
  }

  public async complete(request: LlmRequest, onToken?: LlmTokenHandler): Promise<string> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (!response) {
      throw new Error("No mock response available");
    }

    if (onToken) {
      await onToken("chunk-1");
      await onToken("chunk-2");
    }

    return response;
  }
}

const createSpecflowLayout = async (rootDir: string): Promise<void> => {
  const base = specflowDir(rootDir);
  await mkdir(path.join(base, "initiatives"), { recursive: true });
  await mkdir(path.join(base, "tickets"), { recursive: true });
  await mkdir(path.join(base, "runs"), { recursive: true });
  await mkdir(path.join(base, "decisions"), { recursive: true });
  await writeFile(path.join(base, "AGENTS.md"), "team-rules: always include tests\n", "utf8");
};

describe("PlannerService", () => {
  it("includes AGENTS.md content in prompts for clarify/spec-gen/plan/triage", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-prompts-"));
    await createSpecflowLayout(rootDir);
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key";

    try {
      const store = new ArtifactStore({ rootDir, now: () => new Date("2026-02-27T20:00:00.000Z") });
      await store.initialize();
      await store.upsertConfig({
        provider: "openrouter",
        model: "openrouter/model",
        apiKey: "",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

    const mockClient = new MockLlmClient([
      JSON.stringify({
        questions: [{ id: "q1", label: "Who is this for?", type: "text" }]
      }),
      JSON.stringify({
        briefMarkdown: "# Brief",
        prdMarkdown: "# PRD",
        techSpecMarkdown: "# Tech Spec"
      }),
      JSON.stringify({
        phases: [
          {
            name: "Phase 1",
            order: 1,
            tickets: [
              {
                title: "T1",
                description: "Implement",
                acceptanceCriteria: ["Done"],
                fileTargets: ["src/a.ts"]
              }
            ]
          }
        ]
      }),
      JSON.stringify({
        decision: "ok",
        reason: "Scoped",
        ticketDraft: {
          title: "Quick Task",
          description: "Do thing",
          acceptanceCriteria: ["Works"],
          implementationPlan: "Plan",
          fileTargets: ["src/quick.ts"]
        }
      })
    ]);

      const planner = new PlannerService({
        rootDir,
        store,
        llmClient: mockClient,
        now: () => new Date("2026-02-27T20:00:00.000Z"),
        idGenerator: () => "abc12345"
      });

      const clarify = await planner.runClarifyJob({ description: "Build auth" });
      await planner.runSpecGenJob({
        initiativeId: clarify.initiative.id,
        answers: {
          audience: "developers"
        }
      });
      await planner.runPlanJob({ initiativeId: clarify.initiative.id });
      await planner.runTriageJob({ description: "Add one button" });

      expect(mockClient.requests).toHaveLength(4);
      for (const req of mockClient.requests) {
        expect(req.systemPrompt).toContain("team-rules: always include tests");
        expect(req.provider).toBe("openrouter");
        expect(req.apiKey).toBe("env-openrouter-key");
      }

      await store.close();
      await rm(rootDir, { recursive: true, force: true });
    } finally {
      if (previousOpenRouterKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
      }
    }
  });

  it("parses JSON envelopes wrapped in markdown fences", () => {
    const parsed = parseJsonEnvelope<{ decision: string }>(
      [
        "I analyzed the task:",
        "```json",
        '{"decision":"ok"}',
        "```"
      ].join("\n")
    );

    expect(parsed.decision).toBe("ok");
  });

  it("classifies triage as too-large or ok and persists the expected entity", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-triage-"));
    await createSpecflowLayout(rootDir);
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key-2";

    try {
      const store = new ArtifactStore({ rootDir, now: () => new Date("2026-02-27T20:00:00.000Z") });
      await store.initialize();
      await store.upsertConfig({
        provider: "openrouter",
        model: "openrouter/model",
        apiKey: "",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

      const planner = new PlannerService({
        rootDir,
        store,
        llmClient: new MockLlmClient([
          JSON.stringify({
            decision: "too-large",
            reason: "Multiple epics",
            initiativeTitle: "Platform Rewrite"
          }),
          JSON.stringify({
            decision: "ok",
            reason: "Small task",
            ticketDraft: {
              title: "Fix typo",
              description: "Fix typo in docs",
              acceptanceCriteria: ["Docs updated"],
              implementationPlan: "Edit one file",
              fileTargets: ["README.md"]
            }
          })
        ]),
        now: () => new Date("2026-02-27T20:00:00.000Z"),
        idGenerator: () => Math.random().toString(16).slice(2, 10)
      });

      const tooLarge = await planner.runTriageJob({ description: "Rebuild the whole platform" });
      expect(tooLarge.decision).toBe("too-large");
      expect(store.initiatives.size).toBe(1);

      const ok = await planner.runTriageJob({ description: "Fix a typo" });
      expect(ok.decision).toBe("ok");
      expect(store.tickets.size).toBe(1);

      await store.close();
      await rm(rootDir, { recursive: true, force: true });
    } finally {
      if (previousOpenRouterKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
      }
    }
  });
});
