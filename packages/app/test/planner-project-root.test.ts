import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LlmClient, LlmRequest, LlmTokenHandler } from "../src/llm/client.js";
import { PlannerService } from "../src/planner/planner-service.js";
import { createInitiativeWorkflow } from "../src/planner/workflow-state.js";
import { ArtifactStore } from "../src/store/artifact-store.js";
import type { Initiative } from "../src/types/entities.js";

const now = "2026-02-27T20:00:00.000Z";

const createSpecflowLayout = async (rootDir: string): Promise<void> => {
  await mkdir(path.join(rootDir, "specflow", "initiatives"), { recursive: true });
  await mkdir(path.join(rootDir, "specflow", "tickets"), { recursive: true });
  await mkdir(path.join(rootDir, "specflow", "runs"), { recursive: true });
  await mkdir(path.join(rootDir, "specflow", "decisions"), { recursive: true });
  await writeFile(path.join(rootDir, "specflow", "AGENTS.md"), "Use the SpecFlow storage root.\n", "utf8");
};

const mockProviderRegistryFetch: typeof fetch = async (input, init) => {
  void init;
  const url = typeof input === "string" ? input : input.url;

  if (url === "https://openrouter.ai/api/v1/models") {
    return new Response(
      JSON.stringify({
        data: [{ id: "openrouter/model", name: "OpenRouter Model", context_length: 128000 }]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  throw new Error(`Unexpected fetch request: ${url}`);
};

class RecordingLlmClient implements LlmClient {
  public requests: LlmRequest[] = [];

  public async complete(request: LlmRequest, onToken?: LlmTokenHandler): Promise<string> {
    this.requests.push(request);
    if (onToken) {
      await onToken("token-1");
    }

    return JSON.stringify({
      decision: "ask",
      questions: [
        {
          id: "prd-scope",
          label: "What is in scope for v1?",
          type: "select",
          whyThisBlocks: "The PRD needs a concrete v1 scope.",
          affectedArtifact: "prd",
          decisionType: "scope",
          assumptionIfUnanswered: "Assume a narrow v1 scope.",
          options: ["Keep the first release narrow"],
          optionHelp: {
            "Keep the first release narrow": "Focus the first release on the essential integration path."
          },
        },
      ],
      assumptions: [],
    });
  }
}

describe("PlannerService project roots", () => {
  it("scans the initiative project root instead of the SpecFlow storage root", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-storage-"));
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-project-"));
    await createSpecflowLayout(rootDir);
    await writeFile(path.join(projectRoot, "AGENTS.md"), "Use the selected project root.\n", "utf8");
    await writeFile(path.join(projectRoot, "Cargo.toml"), "[package]\nname = \"external-app\"\n", "utf8");

    const store = new ArtifactStore({ rootDir, now: () => new Date(now) });
    await store.initialize();
    await store.upsertConfig({
      provider: "openrouter",
      model: "openrouter/model",
      port: 3141,
      host: "127.0.0.1",
      repoInstructionFile: "AGENTS.md",
    });
    process.env.OPENROUTER_API_KEY = "test-key";

    const initiative: Initiative = {
      id: "initiative-root",
      title: "External project",
      description: "Plan integration work for another repo",
      projectRoot,
      status: "active",
      phases: [],
      specIds: [
        "initiative-root:brief",
        "initiative-root:core-flows",
        "initiative-root:prd"
      ],
      ticketIds: [],
      workflow: createInitiativeWorkflow(),
      createdAt: now,
      updatedAt: now
    };

    await store.upsertInitiative(initiative, {
      brief: "# Brief\n",
      coreFlows: "# Core flows\n",
      prd: "# PRD\n",
    });

    const llmClient = new RecordingLlmClient();
    const planner = new PlannerService({
      rootDir,
      store,
      llmClient,
      fetchImpl: mockProviderRegistryFetch,
      now: () => new Date(now),
      idGenerator: () => "seedroot",
    });

    await planner.runPhaseCheckJob({
      initiativeId: initiative.id,
      step: "prd",
    });

    expect(llmClient.requests).toHaveLength(1);
    const combinedPrompt = `${llmClient.requests[0]?.systemPrompt ?? ""}\n${llmClient.requests[0]?.userPrompt ?? ""}`;
    expect(combinedPrompt).toContain("Use the selected project root.");
    expect(combinedPrompt).toContain("--- Cargo.toml ---");
    expect(combinedPrompt).toContain("external-app");
    expect(combinedPrompt).not.toContain("Use the SpecFlow storage root.");

    await store.close();
    await rm(rootDir, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  });
});
