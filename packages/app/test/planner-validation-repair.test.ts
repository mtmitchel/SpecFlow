import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { specflowDir } from "../src/io/paths.js";
import type { ArtifactTraceOutline } from "../src/types/entities.js";
import type { LlmClient, LlmRequest, LlmTokenHandler } from "../src/llm/client.js";
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

const mockProviderRegistryFetch: typeof fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url;

  if (url === "https://openrouter.ai/api/v1/models") {
    return new Response(
      JSON.stringify({
        data: [{ id: "openrouter/model", name: "OpenRouter Model", context_length: 128000 }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  throw new Error(`Unexpected fetch request: ${url}`);
};

const seedSpec = async (
  store: ArtifactStore,
  initiativeId: string,
  step: "brief" | "core-flows" | "prd" | "tech-spec",
  content: string
): Promise<void> => {
  const nowIso = "2026-03-24T10:00:00.000Z";
  await store.upsertSpec({
    id: `${initiativeId}:${step}`,
    initiativeId,
    type: step,
    title: step,
    content,
    sourcePath: `specflow/initiatives/${initiativeId}/${step}.md`,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
};

const seedTrace = async (
  store: ArtifactStore,
  initiativeId: string,
  step: "brief" | "core-flows" | "prd" | "tech-spec",
  sections: ArtifactTraceOutline["sections"]
): Promise<void> => {
  const nowIso = "2026-03-24T10:00:00.000Z";
  await store.upsertArtifactTrace({
    id: `${initiativeId}:${step}`,
    initiativeId,
    step,
    sections,
    sourceUpdatedAt: nowIso,
    generatedAt: nowIso,
    updatedAt: nowIso,
  });
};

describe("PlannerService validation repair", () => {
  it("repairs a blocked ticket review before falling back to validation questions", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-plan-review-repair-"));
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key-review-repair";

    try {
      await createSpecflowLayout(rootDir);
      const store = new ArtifactStore({
        rootDir,
        now: () => new Date("2026-03-24T10:00:00.000Z"),
      });
      await store.initialize();
      await store.upsertConfig({
        provider: "openrouter",
        model: "openrouter/model",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md",
      });

      const mockClient = new MockLlmClient([
        JSON.stringify({
          markdown: "# Brief\n\nPreserve note history.",
          traceOutline: {
            sections: [{ key: "goals", label: "Goals", items: ["Preserve note history."] }],
          },
        }),
        JSON.stringify({
          markdown: "# Core flows\n\nCreate and edit notes.",
          traceOutline: {
            sections: [{ key: "flows", label: "Flows", items: ["Create and edit notes."] }],
          },
        }),
        JSON.stringify({
          markdown: "# PRD\n\nShow save state feedback.",
          traceOutline: {
            sections: [
              { key: "requirements", label: "Requirements", items: ["Show save state feedback."] },
            ],
          },
        }),
        JSON.stringify({
          markdown: "# Tech spec\n\nAutosave durability is required.",
          traceOutline: {
            sections: [
              {
                key: "engineering-foundations",
                label: "Engineering foundations",
                items: ["Autosave durability and retry semantics are first-class."],
              },
            ],
          },
        }),
        JSON.stringify({
          phases: [
            {
              name: "Build",
              order: 1,
              tickets: [
                {
                  title: "Build notes shell",
                  description: "Create the initial notes editor and save flow.",
                  acceptanceCriteria: [
                    "The editor opens from the notes shell.",
                    "The shell shows save state feedback.",
                  ],
                  fileTargets: ["packages/client/src/app/views/initiative-view.tsx"],
                  coverageItemIds: [
                    "coverage-brief-goals-1",
                    "coverage-core-flows-flows-1",
                    "coverage-prd-requirements-1",
                    "coverage-tech-spec-engineering-foundations-1",
                  ],
                },
              ],
            },
          ],
          uncoveredCoverageItemIds: [],
        }),
        JSON.stringify({
          summary: "The artifacts are clear, but the ticket plan is still too thin.",
          blockers: [
            "No implementation ticket covers autosave durability and retry behavior."
          ],
          warnings: [],
          traceabilityGaps: [],
          assumptions: [],
          recommendedFixes: [
            "Split autosave durability into its own ticket before tickets are committed."
          ],
        }),
        JSON.stringify({
          phases: [
            {
              name: "Build",
              order: 1,
              tickets: [
                {
                  title: "Build notes shell",
                  description: "Create the initial notes editor and save flow.",
                  acceptanceCriteria: [
                    "The editor opens from the notes shell.",
                    "The shell shows save state feedback.",
                  ],
                  fileTargets: ["packages/client/src/app/views/initiative-view.tsx"],
                  coverageItemIds: [
                    "coverage-brief-goals-1",
                    "coverage-core-flows-flows-1",
                    "coverage-prd-requirements-1",
                  ],
                },
                {
                  title: "Implement autosave safety",
                  description: "Add autosave durability and retry safeguards.",
                  acceptanceCriteria: [
                    "Autosave durability rules are covered by one dedicated ticket.",
                    "Retry behavior is explicit in ticket acceptance criteria.",
                  ],
                  fileTargets: ["packages/app/src/planner/internal/planner-service-plans.ts"],
                  coverageItemIds: [
                    "coverage-tech-spec-engineering-foundations-1",
                  ],
                },
              ],
            },
          ],
          uncoveredCoverageItemIds: [],
        }),
        JSON.stringify({
          summary: "Validation passed.",
          blockers: [],
          warnings: [],
          traceabilityGaps: [],
          assumptions: [],
          recommendedFixes: [],
        }),
      ]);

      const planner = new PlannerService({
        rootDir,
        store,
        llmClient: mockClient,
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-03-24T10:00:00.000Z"),
        idGenerator: (() => {
          const ids = ["repair01", "ticket01", "ticket02"];
          let index = 0;
          return () => ids[index++] ?? `repair${index}`;
        })(),
      });

      const initiative = await planner.createDraftInitiative({
        description: "Build a local-first notes app with autosave durability.",
      });
      await store.upsertInitiative({
        ...initiative,
        workflow: {
          ...initiative.workflow,
          activeStep: "validation",
          steps: {
            brief: { status: "complete", updatedAt: "2026-03-24T10:00:00.000Z" },
            "core-flows": { status: "complete", updatedAt: "2026-03-24T10:00:00.000Z" },
            prd: { status: "complete", updatedAt: "2026-03-24T10:00:00.000Z" },
            "tech-spec": { status: "complete", updatedAt: "2026-03-24T10:00:00.000Z" },
            validation: { status: "ready", updatedAt: null },
            tickets: { status: "locked", updatedAt: null },
          },
        },
        updatedAt: "2026-03-24T10:00:00.000Z",
      });

      await seedSpec(store, initiative.id, "brief", "# Brief\n\nPreserve note history.");
      await seedSpec(store, initiative.id, "core-flows", "# Core flows\n\nCreate and edit notes.");
      await seedSpec(store, initiative.id, "prd", "# PRD\n\nShow save state feedback.");
      await seedSpec(store, initiative.id, "tech-spec", "# Tech spec\n\nAutosave durability is required.");

      await seedTrace(store, initiative.id, "brief", [
        { key: "goals", label: "Goals", items: ["Preserve note history."] },
      ]);
      await seedTrace(store, initiative.id, "core-flows", [
        { key: "flows", label: "Flows", items: ["Create and edit notes."] },
      ]);
      await seedTrace(store, initiative.id, "prd", [
        { key: "requirements", label: "Requirements", items: ["Show save state feedback."] },
      ]);
      await seedTrace(store, initiative.id, "tech-spec", [
        {
          key: "engineering-foundations",
          label: "Engineering foundations",
          items: ["Autosave durability and retry semantics are first-class."],
        },
      ]);

      await planner.runPlanJob({ initiativeId: initiative.id });

      expect(store.planningReviews.get(`${initiative.id}:ticket-coverage-review`)?.status).toBe("passed");
      expect(Array.from(store.tickets.values()).filter((ticket) => ticket.initiativeId === initiative.id)).toHaveLength(2);
      const repairPrompt = mockClient.requests.find((request) =>
        request.userPrompt.includes("Repair the existing ordered phase plan and ticket breakdown.")
      );
      expect(repairPrompt?.userPrompt).toContain(
        "No implementation ticket covers autosave durability and retry behavior."
      );
      expect(repairPrompt?.userPrompt).toContain(
        "Split autosave durability into its own ticket before tickets are committed."
      );

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
