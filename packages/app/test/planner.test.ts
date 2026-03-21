import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { specflowDir } from "../src/io/paths.js";
import type { LlmClient, LlmRequest, LlmTokenHandler } from "../src/llm/client.js";
import { buildPlannerPrompt } from "../src/planner/prompt-builder.js";
import { parseJsonEnvelope } from "../src/planner/json-parser.js";
import { PlannerService } from "../src/planner/planner-service.js";
import { updateRefinementState } from "../src/planner/workflow-state.js";
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

const traceOutline = (label: string) => ({
  sections: [{ key: "summary", label: "Summary", items: [label] }]
});

const reviewResult = (summary: string) => ({
  summary,
  blockers: [],
  warnings: [],
  traceabilityGaps: [],
  assumptions: [],
  recommendedFixes: []
});

const repeatResponseTwice = (payload: unknown): string[] => [
  JSON.stringify(payload),
  JSON.stringify(payload)
];

const createSpecflowLayout = async (rootDir: string): Promise<void> => {
  const base = specflowDir(rootDir);
  await mkdir(path.join(base, "initiatives"), { recursive: true });
  await mkdir(path.join(base, "tickets"), { recursive: true });
  await mkdir(path.join(base, "runs"), { recursive: true });
  await mkdir(path.join(base, "decisions"), { recursive: true });
  await writeFile(path.join(base, "AGENTS.md"), "team-rules: always include tests\n", "utf8");
};

const titleByStep = (step: "brief" | "core-flows" | "prd" | "tech-spec"): string => {
  switch (step) {
    case "brief":
      return "Brief";
    case "core-flows":
      return "Core flows";
    case "prd":
      return "PRD";
    case "tech-spec":
      return "Tech spec";
  }
};

const seedSpec = async (
  store: ArtifactStore,
  initiativeId: string,
  step: "brief" | "core-flows" | "prd" | "tech-spec",
  content: string
): Promise<void> => {
  const nowIso = "2026-02-27T20:00:00.000Z";
  await store.upsertSpec({
    id: `${initiativeId}:${step}`,
    initiativeId,
    type: step,
    title: titleByStep(step),
    content,
    sourcePath: `specflow/initiatives/${initiativeId}/${step}.md`,
    createdAt: nowIso,
    updatedAt: nowIso
  });
};

const mockProviderRegistryFetch: typeof fetch = async (input, init) => {
  void init;
  const url = typeof input === "string" ? input : input.url;

  if (url === "https://openrouter.ai/api/v1/models") {
    return new Response(
      JSON.stringify({
        data: [
          { id: "openrouter/model", name: "OpenRouter Model", context_length: 128000 },
          { id: "openrouter/auto", name: "Auto Router", context_length: 200000 }
        ]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  if (url === "https://api.openai.com/v1/models") {
    return new Response(
      JSON.stringify({
        data: [{ id: "gpt-5-mini", name: "gpt-5-mini" }]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  if (url === "https://api.anthropic.com/v1/models") {
    return new Response(
      JSON.stringify({
        data: [{ id: "claude-opus-4-5", display_name: "Claude Opus 4.5" }]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  throw new Error(`Unexpected fetch request: ${url}`);
};

const resolvePhaseConsultation = async (
  store: ArtifactStore,
  initiativeId: string,
  step: "brief" | "core-flows" | "prd" | "tech-spec",
  defaultAnswerQuestionIds: string[]
): Promise<void> => {
  const initiative = store.initiatives.get(initiativeId);
  if (!initiative) {
    throw new Error(`Initiative ${initiativeId} not found in test fixture`);
  }

  await store.upsertInitiative({
    ...initiative,
    workflow: updateRefinementState(initiative.workflow, step, {
      defaultAnswerQuestionIds,
      checkedAt: initiative.workflow.refinements[step].checkedAt ?? "2026-02-27T20:00:00.000Z"
    }),
    updatedAt: "2026-02-27T20:00:00.000Z"
  });
};

const resolveBriefConsultation = async (
  store: ArtifactStore,
  initiativeId: string,
  defaultAnswerQuestionIds: string[]
): Promise<void> => resolvePhaseConsultation(store, initiativeId, "brief", defaultAnswerQuestionIds);

describe("PlannerService", () => {
  it("marks the first brief-check prompt as required starter consultation", () => {
    const prompt = buildPlannerPrompt(
      "brief-check",
      {
        initiativeDescription: "Build auth",
        phase: "brief",
        briefMarkdown: "",
        savedContext: {},
        requiresInitialConsultation: true
      },
      "team-rules: always include tests"
    );

    expect(prompt.userPrompt).toContain("first required Brief consultation for a fresh project");
    expect(prompt.userPrompt).toContain('You must return "ask"');
    expect(prompt.userPrompt).toContain("Ask exactly 4 short consultation questions");
    expect(prompt.userPrompt).toContain('Every question must use "select", "multi-select", or "boolean"');
  });

  it("marks the first core-flows check as required starter questions when no artifact exists yet", () => {
    const prompt = buildPlannerPrompt(
      "core-flows-check",
      {
        initiativeDescription: "Build auth",
        phase: "core-flows",
        briefMarkdown: "# Brief",
        coreFlowsMarkdown: "",
        savedContext: {},
        requiredStarterQuestionCount: 3
      },
      "team-rules: always include tests"
    );

    expect(prompt.userPrompt).toContain('You must return "ask"');
    expect(prompt.userPrompt).toContain("first required Core flows consultation");
    expect(prompt.userPrompt).toContain("Ask exactly 3 short blocker questions");
    expect(prompt.userPrompt).toContain("Cover three different decision areas");
    expect(prompt.userPrompt).toContain("at most 4 questions");
    expect(prompt.userPrompt).toContain("failure-mode");
    expect(prompt.userPrompt).not.toContain('Default to "proceed"');
  });

  it("marks the first PRD check as required starter questions when no artifact exists yet", () => {
    const prompt = buildPlannerPrompt(
      "prd-check",
      {
        initiativeDescription: "Build auth",
        phase: "prd",
        briefMarkdown: "# Brief",
        coreFlowsMarkdown: "# Core flows",
        savedContext: {},
        requiredStarterQuestionCount: 1
      },
      "team-rules: always include tests"
    );

    expect(prompt.userPrompt).toContain('You must return "ask"');
    expect(prompt.userPrompt).toContain("first required PRD consultation");
    expect(prompt.userPrompt).toContain("Ask exactly 1 short blocker question");
    expect(prompt.userPrompt).toContain("at most 4 questions");
    expect(prompt.userPrompt).toContain(
      "Allowed decisionType values for this artifact are: behavior, rule, scope, non-goal, priority, failure-mode, performance, compatibility"
    );
    expect(prompt.userPrompt).not.toContain('Default to "proceed"');
  });

  it("marks the first tech-spec check as required starter questions when no artifact exists yet", () => {
    const prompt = buildPlannerPrompt(
      "tech-spec-check",
      {
        initiativeDescription: "Build auth",
        phase: "tech-spec",
        briefMarkdown: "# Brief",
        coreFlowsMarkdown: "# Core flows",
        prdMarkdown: "# PRD",
        savedContext: {},
        requiredStarterQuestionCount: 1
      },
      "team-rules: always include tests"
    );

    expect(prompt.userPrompt).toContain('You must return "ask"');
    expect(prompt.userPrompt).toContain("first required Tech spec consultation");
    expect(prompt.userPrompt).toContain("Ask exactly 1 short blocker question");
    expect(prompt.userPrompt).toContain("at most 5 questions");
    expect(prompt.userPrompt).toContain("quality-strategy");
    expect(prompt.userPrompt).toContain("performance, operations, compatibility, existing-system");
    expect(prompt.userPrompt).not.toContain('Default to "proceed"');
  });

  it("rejects first core-flows consultations that return fewer than three starter questions", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-core-flows-check-"));
    await createSpecflowLayout(rootDir);
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key-core-flows";

    try {
      const store = new ArtifactStore({ rootDir, now: () => new Date("2026-02-27T20:00:00.000Z") });
      await store.initialize();
      await store.upsertConfig({
        provider: "openrouter",
        model: "openrouter/model",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

      const planner = new PlannerService({
        rootDir,
        store,
        llmClient: new MockLlmClient(
          repeatResponseTwice({
            decision: "ask",
            questions: [
              {
                id: "core-flow-primary-path",
                label: "Which note flow should the first core flows draft optimize for?",
                whyThisBlocks: "The first core flows draft needs one explicit primary path.",
                affectedArtifact: "core-flows",
                decisionType: "journey",
                type: "select",
                assumptionIfUnanswered: "Optimize for fast note capture first.",
                options: [
                  "Capture first",
                  "Browse first"
                ],
                optionHelp: {
                  "Capture first": "Use this when the first draft should start from creating a note.",
                  "Browse first": "Use this when the first draft should start from navigating existing notes."
                },
                recommendedOption: "Capture first"
              }
            ],
            assumptions: []
          })
        ),
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:00:00.000Z"),
        idGenerator: () => "def67890"
      });

      const initiative = await planner.createDraftInitiative({ description: "Build auth" });
      await expect(
        planner.runPhaseCheckJob({
          initiativeId: initiative.id,
          step: "core-flows"
        })
      ).rejects.toThrow("at least 3 starter questions");

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

  it("rejects first PRD consultations that skip the required starter scope question", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-prd-starter-check-"));
    await createSpecflowLayout(rootDir);
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key-prd-starter";

    try {
      const store = new ArtifactStore({ rootDir, now: () => new Date("2026-02-27T20:00:00.000Z") });
      await store.initialize();
      await store.upsertConfig({
        provider: "openrouter",
        model: "openrouter/model",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });
      const plannerForInitiative = new PlannerService({
        rootDir,
        store,
        llmClient: new MockLlmClient([]),
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:00:00.000Z"),
        idGenerator: () => "prdst001"
      });
      const initiative = await plannerForInitiative.createDraftInitiative({ description: "Build auth" });
      await seedSpec(store, initiative.id, "brief", "# Brief");
      await seedSpec(store, initiative.id, "core-flows", "# Core flows");

      const planner = new PlannerService({
        rootDir,
        store,
        llmClient: new MockLlmClient(
          repeatResponseTwice({
            decision: "ask",
            questions: [],
            assumptions: []
          })
        ),
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:10:00.000Z"),
        idGenerator: () => "prdst002"
      });

      await expect(
        planner.runPhaseCheckJob({
          initiativeId: initiative.id,
          step: "prd"
        })
      ).rejects.toThrow("at least 1 starter question");

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

  it("rejects first tech-spec consultations that skip the required starter architecture question", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-tech-spec-starter-check-"));
    await createSpecflowLayout(rootDir);
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key-tech-starter";

    try {
      const store = new ArtifactStore({ rootDir, now: () => new Date("2026-02-27T20:00:00.000Z") });
      await store.initialize();
      await store.upsertConfig({
        provider: "openrouter",
        model: "openrouter/model",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

      const plannerForInitiative = new PlannerService({
        rootDir,
        store,
        llmClient: new MockLlmClient([]),
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:00:00.000Z"),
        idGenerator: () => "techst01"
      });
      const initiative = await plannerForInitiative.createDraftInitiative({ description: "Build auth" });
      await seedSpec(store, initiative.id, "brief", "# Brief");
      await seedSpec(store, initiative.id, "core-flows", "# Core flows");
      await seedSpec(store, initiative.id, "prd", "# PRD");

      const planner = new PlannerService({
        rootDir,
        store,
        llmClient: new MockLlmClient(
          repeatResponseTwice({
            decision: "ask",
            questions: [],
            assumptions: []
          })
        ),
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:15:00.000Z"),
        idGenerator: () => "techst02"
      });

      await expect(
        planner.runPhaseCheckJob({
          initiativeId: initiative.id,
          step: "tech-spec"
        })
      ).rejects.toThrow("at least 1 starter question");

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

  it("rejects same-stage duplicate questions when a later check re-asks the same PRD concern", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-duplicate-prd-question-"));
    await createSpecflowLayout(rootDir);
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key-prd-duplicate";

    try {
      const store = new ArtifactStore({ rootDir, now: () => new Date("2026-02-27T20:00:00.000Z") });
      await store.initialize();
      await store.upsertConfig({
        provider: "openrouter",
        model: "openrouter/model",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

      const plannerForInitiative = new PlannerService({
        rootDir,
        store,
        llmClient: new MockLlmClient([]),
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:00:00.000Z"),
        idGenerator: () => "dupprd01"
      });
      const initiative = await plannerForInitiative.createDraftInitiative({ description: "Build auth" });
      await store.upsertInitiative({
        ...initiative,
        workflow: updateRefinementState(initiative.workflow, "prd", {
          questions: [
            {
              id: "prd-scope-boundary",
              label: "Which v1 scope boundary matters most?",
              whyThisBlocks: "The PRD needs one explicit scope boundary.",
              affectedArtifact: "prd",
              decisionType: "scope",
              type: "select",
              assumptionIfUnanswered: "Keep the first release single-user only.",
              options: ["Single-user only", "No external integrations in v1"],
              optionHelp: {
                "Single-user only": "Keeps the product contract focused on one user's workflow first.",
                "No external integrations in v1": "Keeps the first release narrow and avoids integration promises."
              },
              recommendedOption: "Single-user only"
            }
          ],
          answers: {
            "prd-scope-boundary": "Single-user only"
          },
          checkedAt: "2026-02-27T20:10:00.000Z"
        }),
        updatedAt: "2026-02-27T20:10:00.000Z"
      });
      await seedSpec(store, initiative.id, "brief", "# Brief");
      await seedSpec(store, initiative.id, "core-flows", "# Core flows");

      const planner = new PlannerService({
        rootDir,
        store,
        llmClient: new MockLlmClient(
          repeatResponseTwice({
            decision: "ask",
            questions: [
              {
                id: "prd-scope-boundary-follow-up",
                label: "Which v1 scope boundary matters most right now?",
                whyThisBlocks: "The PRD still needs one explicit scope boundary.",
                affectedArtifact: "prd",
                decisionType: "scope",
                type: "select",
                assumptionIfUnanswered: "Keep the first release single-user only.",
                options: ["Single-user only", "No external integrations in v1"],
                optionHelp: {
                  "Single-user only": "Keeps the product contract focused on one user's workflow first.",
                  "No external integrations in v1": "Keeps the first release narrow and avoids integration promises."
                },
                recommendedOption: "Single-user only"
              }
            ],
            assumptions: []
          })
        ),
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:15:00.000Z"),
        idGenerator: () => "dupprd02"
      });

      await expect(
        planner.runPhaseCheckJob({
          initiativeId: initiative.id,
          step: "prd"
        })
      ).rejects.toThrow("repeats already-asked prd concern");

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

  it("rejects PRD questions that drift into tech-spec decision types", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-prd-stage-fit-"));
    await createSpecflowLayout(rootDir);
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key-prd";

    try {
      const store = new ArtifactStore({ rootDir, now: () => new Date("2026-02-27T20:00:00.000Z") });
      await store.initialize();
      await store.upsertConfig({
        provider: "openrouter",
        model: "openrouter/model",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

      const planner = new PlannerService({
        rootDir,
        store,
        llmClient: new MockLlmClient(
          repeatResponseTwice({
            decision: "ask",
            questions: [
              {
                id: "prd-storage-model",
                label: "Which storage engine should the app use?",
                whyThisBlocks: "The PRD needs the storage architecture before it can move on.",
                affectedArtifact: "prd",
                decisionType: "architecture",
                type: "select",
                assumptionIfUnanswered: "Use a local embedded database.",
                options: ["Flat files", "Embedded database"],
                optionHelp: {
                  "Flat files": "Use this when implementation should stay close to user-managed files.",
                  "Embedded database": "Use this when the system should own indexing and structured queries."
                },
                recommendedOption: "Embedded database"
              }
            ],
            assumptions: []
          })
        ),
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:00:00.000Z"),
        idGenerator: () => "1122aabb"
      });

      const initiative = await planner.createDraftInitiative({ description: "Build auth" });
      await expect(
        planner.runPhaseCheckJob({
          initiativeId: initiative.id,
          step: "prd"
        })
      ).rejects.toThrow('disallowed decisionType "architecture" for prd');

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

  it("rejects questions that include Other in the options contract", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-other-option-"));
    await createSpecflowLayout(rootDir);
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key-other";

    try {
      const store = new ArtifactStore({ rootDir, now: () => new Date("2026-02-27T20:00:00.000Z") });
      await store.initialize();
      await store.upsertConfig({
        provider: "openrouter",
        model: "openrouter/model",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

      const planner = new PlannerService({
        rootDir,
        store,
        llmClient: new MockLlmClient(
          repeatResponseTwice({
            decision: "ask",
            questions: [
              {
                id: "prd-scope",
                label: "Which scope boundary matters most for v1?",
                whyThisBlocks: "The PRD needs one explicit scope boundary.",
                affectedArtifact: "prd",
                decisionType: "scope",
                type: "select",
                assumptionIfUnanswered: "Keep the first release narrow.",
                options: ["Single-user only", "Other"],
                optionHelp: {
                  "Single-user only": "Use this when collaboration should stay out of the first release.",
                  Other: "Use this when another scope boundary matters more."
                },
                recommendedOption: null
              }
            ],
            assumptions: []
          })
        ),
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:00:00.000Z"),
        idGenerator: () => "7788ccdd"
      });

      const initiative = await planner.createDraftInitiative({ description: "Build auth" });
      await expect(
        planner.runPhaseCheckJob({
          initiativeId: initiative.id,
          step: "prd"
        })
      ).rejects.toThrow('must not include "Other" in options');

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

  it("rejects questions that omit helper copy for one of the provided options", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-missing-option-help-"));
    await createSpecflowLayout(rootDir);
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key-option-help";

    try {
      const store = new ArtifactStore({ rootDir, now: () => new Date("2026-02-27T20:00:00.000Z") });
      await store.initialize();
      await store.upsertConfig({
        provider: "openrouter",
        model: "openrouter/model",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

      const planner = new PlannerService({
        rootDir,
        store,
        llmClient: new MockLlmClient(
          repeatResponseTwice({
            decision: "ask",
            questions: [
              {
                id: "prd-scope",
                label: "Which product boundary matters most for v1?",
                whyThisBlocks: "The PRD needs one explicit scope boundary.",
                affectedArtifact: "prd",
                decisionType: "scope",
                type: "select",
                assumptionIfUnanswered: "Keep the first release narrow.",
                options: ["Single-user only", "Multi-user collaboration"],
                optionHelp: {
                  "Single-user only": "Use this when collaboration should stay out of the first release."
                },
                recommendedOption: null
              }
            ],
            assumptions: []
          })
        ),
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:00:00.000Z"),
        idGenerator: () => "ee99cc77"
      });

      const initiative = await planner.createDraftInitiative({ description: "Build auth" });
      await expect(
        planner.runPhaseCheckJob({
          initiativeId: initiative.id,
          step: "prd"
        })
      ).rejects.toThrow("missing optionHelp");

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

  it("retries one invalid phase-check result before surfacing a boolean-question contract error", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-phase-check-repair-"));
    await createSpecflowLayout(rootDir);
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key-phase-check-repair";

    try {
      const store = new ArtifactStore({ rootDir, now: () => new Date("2026-02-27T20:00:00.000Z") });
      await store.initialize();
      await store.upsertConfig({
        provider: "openrouter",
        model: "openrouter/model",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

      const mockClient = new MockLlmClient([
        JSON.stringify({
          decision: "ask",
          questions: [
            {
              id: "attachments-offline-failure",
              label: "Should failed attachment sync stay visible until the user retries it?",
              whyThisBlocks: "The flow changes depending on whether failed sync stays visible or silently retries.",
              affectedArtifact: "core-flows",
              decisionType: "failure-mode",
              type: "boolean",
              assumptionIfUnanswered: "Keep failed sync visible until the user retries it.",
              options: ["Yes", "No"],
              optionHelp: {
                Yes: "Keep a visible failed-sync state until the user acts.",
                No: "Retry silently in the background."
              },
              recommendedOption: "Yes"
            }
          ],
          assumptions: []
        }),
        JSON.stringify({
          decision: "ask",
          questions: [
            {
              id: "attachments-offline-failure",
              label: "Should failed attachment sync stay visible until the user retries it?",
              whyThisBlocks: "The flow changes depending on whether failed sync stays visible or silently retries.",
              affectedArtifact: "core-flows",
              decisionType: "failure-mode",
              type: "boolean",
              assumptionIfUnanswered: "Keep failed sync visible until the user retries it."
            }
          ],
          assumptions: []
        })
      ]);

      const planner = new PlannerService({
        rootDir,
        store,
        llmClient: mockClient,
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:00:00.000Z"),
        idGenerator: () => "repair01"
      });

      const initiative = await planner.createDraftInitiative({
        description: "Build a lightweight offline-first note-taking app"
      });
      await seedSpec(store, initiative.id, "brief", "# Brief");
      await seedSpec(store, initiative.id, "core-flows", "# Core flows");

      const result = await planner.runPhaseCheckJob({
        initiativeId: initiative.id,
        step: "core-flows"
      });

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0]?.type).toBe("boolean");
      expect(result.questions[0]?.options).toBeUndefined();
      expect(mockClient.requests).toHaveLength(2);
      expect(mockClient.requests[1]?.userPrompt).toContain(
        "must not provide options for boolean questions"
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

  it("includes AGENTS.md content in prompts for phase checks, phase generation, plan, and triage", async () => {
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
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

      const mockClient = new MockLlmClient([
        JSON.stringify({
          initiativeTitle: "Local notes",
          markdown: "# Local notes",
          traceOutline: traceOutline("Brief")
        }),
        JSON.stringify({
          decision: "ask",
          questions: [
            {
              id: "core-flow-primary-path",
              label: "Which note flow should the first core flows draft optimize for?",
              whyThisBlocks: "The first core flows draft needs one explicit primary path.",
              affectedArtifact: "core-flows",
              decisionType: "journey",
              type: "select",
              assumptionIfUnanswered: "Optimize for fast note capture first.",
              options: [
                "Capture first",
                "Browse first"
              ],
              optionHelp: {
                "Capture first": "Use this when the first draft should start from creating a note.",
                "Browse first": "Use this when the first draft should start from navigating existing notes."
              },
              recommendedOption: "Capture first"
            },
            {
              id: "core-flow-delete-behavior",
              label: "How should deletion work in the initial release?",
              whyThisBlocks: "Deletion behavior changes the flow map, states, and recovery paths.",
              affectedArtifact: "core-flows",
              decisionType: "branch",
              type: "select",
              assumptionIfUnanswered: "Use Trash with undo before permanent removal.",
              options: [
                "Trash with undo",
                "Permanent delete",
                "Trash with scheduled purge"
              ],
              optionHelp: {
                "Trash with undo": "Use this when recovery should stay in the first release.",
                "Permanent delete": "Use this when simple deletion matters more than recoverability.",
                "Trash with scheduled purge": "Use this when recovery matters but cleanup should stay automatic."
              },
              recommendedOption: "Trash with undo"
            },
            {
              id: "core-flow-default-view",
              label: "Which workspace should open first when the app launches?",
              whyThisBlocks: "The launch destination changes the primary navigation and first-run flow.",
              affectedArtifact: "core-flows",
              decisionType: "state",
              type: "select",
              assumptionIfUnanswered: "Open the note list first and let users enter the editor from there.",
              options: [
                "Note list first",
                "Editor first",
                "Restore last open view"
              ],
              optionHelp: {
                "Note list first": "Use this when browsing and finding notes should anchor the app.",
                "Editor first": "Use this when immediate writing should be the default experience.",
                "Restore last open view": "Use this when repeat use should pick up where the user left off."
              },
              recommendedOption: "Note list first"
            }
          ],
          assumptions: []
        }),
        JSON.stringify({
          decision: "proceed",
          questions: [],
          assumptions: []
        }),
        JSON.stringify({
          markdown: "# Core flows",
          traceOutline: traceOutline("Core flows")
        }),
        JSON.stringify(reviewResult("Core flows review")),
        JSON.stringify(reviewResult("Brief/core flows cross-check")),
        JSON.stringify({
          decision: "ask",
          questions: [
            {
              id: "prd-scope-boundary",
              label: "Which scope boundary matters most for v1?",
              whyThisBlocks: "The PRD needs one explicit scope boundary before the first draft.",
              affectedArtifact: "prd",
              decisionType: "scope",
              type: "select",
              assumptionIfUnanswered: "Keep the first release single-user only.",
              options: ["Single-user only", "No external integrations in v1"],
              optionHelp: {
                "Single-user only": "Keeps the user-visible product contract focused on one primary workflow first.",
                "No external integrations in v1": "Keeps the first release narrow and avoids integration promises."
              },
              recommendedOption: "Single-user only"
            }
          ],
          assumptions: []
        }),
        JSON.stringify({
          decision: "proceed",
          questions: [],
          assumptions: []
        }),
        JSON.stringify({
          markdown: "# PRD",
          traceOutline: traceOutline("PRD")
        }),
        JSON.stringify(reviewResult("PRD review")),
        JSON.stringify(reviewResult("Core flows/PRD cross-check")),
        JSON.stringify({
          decision: "ask",
          questions: [
            {
              id: "tech-architecture",
              label: "Which implementation shape should anchor the first release?",
              whyThisBlocks: "The Tech spec needs one architecture decision before it can define the rest of the implementation plan.",
              affectedArtifact: "tech-spec",
              decisionType: "architecture",
              type: "select",
              assumptionIfUnanswered: "Use one desktop app with a local sidecar and local persistence.",
              options: [
                "Single desktop app with local runtime",
                "Desktop shell with a separate remote backend"
              ],
              optionHelp: {
                "Single desktop app with local runtime": "Keeps the first release local-first and narrows the implementation boundary.",
                "Desktop shell with a separate remote backend": "Introduces a split deployment and remote-service boundary from the start."
              },
              recommendedOption: "Single desktop app with local runtime"
            }
          ],
          assumptions: []
        }),
        JSON.stringify({
          decision: "proceed",
          questions: [],
          assumptions: []
        }),
        JSON.stringify({
          markdown: "# Tech spec",
          traceOutline: traceOutline("Tech spec")
        }),
        JSON.stringify(reviewResult("Tech spec review")),
        JSON.stringify(reviewResult("PRD/tech spec cross-check")),
        JSON.stringify(reviewResult("Spec set review")),
        JSON.stringify({
          phases: [
            {
              name: "Phase 1",
              order: 1,
              tickets: [
                {
                  title: "Implement auth flow",
                  description: "Implement the auth flow.",
                  acceptanceCriteria: ["Done"],
                  fileTargets: ["src/a.ts"],
                  coverageItemIds: [
                    "coverage-brief-summary-1",
                    "coverage-core-flows-summary-1",
                    "coverage-prd-summary-1",
                    "coverage-tech-spec-summary-1"
                  ]
                }
              ]
            }
          ],
          uncoveredCoverageItemIds: []
        }),
        JSON.stringify(reviewResult("Coverage review")),
        JSON.stringify({
          decision: "ok",
          reason: "Scoped",
          ticketDraft: {
            title: "Fix quick task",
            description: "Do the quick task.",
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
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:00:00.000Z"),
        idGenerator: () => "abc12345"
      });

      const initiative = await planner.createDraftInitiative({ description: "Build auth" });
      const initialBriefConsultation = await planner.runPhaseCheckJob({
        initiativeId: initiative.id,
        step: "brief"
      });
      expect(initialBriefConsultation.decision).toBe("ask");
      expect(initialBriefConsultation.questions).toHaveLength(4);
      expect(initialBriefConsultation.questions.every((question) => question.type !== "text")).toBe(true);
      expect(mockClient.requests).toHaveLength(0);
      await resolveBriefConsultation(
        store,
        initiative.id,
        initialBriefConsultation.questions.map((question) => question.id)
      );
      await planner.runPhaseCheckJob({
        initiativeId: initiative.id,
        step: "brief"
      });
      await planner.runBriefJob({
        initiativeId: initiative.id
      });
      await planner.runPhaseCheckJob({
        initiativeId: initiative.id,
        step: "core-flows"
      });
      await resolvePhaseConsultation(store, initiative.id, "core-flows", [
        "core-flow-primary-path",
        "core-flow-delete-behavior",
        "core-flow-default-view"
      ]);
      await planner.runPhaseCheckJob({
        initiativeId: initiative.id,
        step: "core-flows"
      });
      await planner.runCoreFlowsJob({
        initiativeId: initiative.id
      });
      await planner.runPhaseCheckJob({
        initiativeId: initiative.id,
        step: "prd"
      });
      await resolvePhaseConsultation(store, initiative.id, "prd", ["prd-scope-boundary"]);
      await planner.runPhaseCheckJob({
        initiativeId: initiative.id,
        step: "prd"
      });
      await planner.runPrdJob({
        initiativeId: initiative.id
      });
      await planner.runPhaseCheckJob({
        initiativeId: initiative.id,
        step: "tech-spec"
      });
      await resolvePhaseConsultation(store, initiative.id, "tech-spec", ["tech-architecture"]);
      await planner.runPhaseCheckJob({
        initiativeId: initiative.id,
        step: "tech-spec"
      });
      await planner.runTechSpecJob({
        initiativeId: initiative.id
      });
      await planner.runPlanJob({ initiativeId: initiative.id });
      await planner.runTriageJob({ description: "Add one button" });

      expect(store.planningReviews.get(`${initiative.id}:ticket-coverage-review`)?.status).toBe("passed");
      expect(store.planningReviews.get(`${initiative.id}:brief-review`)?.status).toBe("passed");
      expect(mockClient.requests).toHaveLength(20);
      expect(mockClient.requests.some((request) => request.userPrompt.includes('Default to "proceed"'))).toBe(true);
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
            initiativeTitle: "Platform rewrite"
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
        fetchImpl: mockProviderRegistryFetch,
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

  it("persists ticket coverage artifacts and mapped ticket coverage ids during plan generation", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-coverage-"));
    await createSpecflowLayout(rootDir);
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key-3";

    try {
      const store = new ArtifactStore({ rootDir, now: () => new Date("2026-02-27T20:00:00.000Z") });
      await store.initialize();
      await store.upsertConfig({
        provider: "openrouter",
        model: "openrouter/model",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

      const mockClient = new MockLlmClient([
        JSON.stringify({
          initiativeTitle: "Auth setup",
          markdown: "# Auth setup",
          traceOutline: {
            sections: [
              { key: "goals", label: "Goals", items: ["Support email login"] },
              { key: "constraints", label: "Constraints", items: ["Keep auth local-first"] }
            ]
          }
        }),
        JSON.stringify({
          markdown: "# Core flows",
          traceOutline: {
            sections: [
              { key: "flows", label: "Flows", items: ["User signs in"] }
            ]
          }
        }),
        JSON.stringify(reviewResult("Core flows review")),
        JSON.stringify(reviewResult("Brief/core flows cross-check")),
        JSON.stringify({
          markdown: "# PRD",
          traceOutline: {
            sections: [
              { key: "requirements", label: "Requirements", items: ["Show login errors"] }
            ]
          }
        }),
        JSON.stringify(reviewResult("PRD review")),
        JSON.stringify(reviewResult("Core flows/PRD cross-check")),
        JSON.stringify({
          markdown: "# Tech spec",
          traceOutline: {
            sections: [
              { key: "verification-hooks", label: "Verification hooks", items: ["Add auth route tests"] }
            ]
          }
        }),
        JSON.stringify(reviewResult("Tech spec review")),
        JSON.stringify(reviewResult("PRD/tech spec cross-check")),
        JSON.stringify(reviewResult("Spec set review")),
        JSON.stringify({
          phases: [
            {
              name: "Phase 1",
              order: 1,
              tickets: [
                {
                  title: "Implement email login",
                  description: "Build the login flow",
                  acceptanceCriteria: ["Email login works", "Errors are shown"],
                  fileTargets: ["src/auth.ts"],
                  coverageItemIds: [
                    "coverage-brief-goals-1",
                    "coverage-brief-constraints-1",
                    "coverage-core-flows-flows-1",
                    "coverage-prd-requirements-1",
                    "coverage-tech-spec-verification-hooks-1"
                  ]
                }
              ]
            }
          ],
          uncoveredCoverageItemIds: []
        }),
        JSON.stringify(reviewResult("Coverage review"))
      ]);

      const planner = new PlannerService({
        rootDir,
        store,
        llmClient: mockClient,
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:00:00.000Z"),
        idGenerator: (() => {
          const ids = [
            "initcov1",
            "phasecov1",
            "ticketcov1"
          ];
          let index = 0;
          return () => ids[index++] ?? `cov${index}`;
        })()
      });

      const initiative = await planner.createDraftInitiative({ description: "Build auth" });
      const initialBriefConsultation = await planner.runPhaseCheckJob({
        initiativeId: initiative.id,
        step: "brief"
      });
      await resolveBriefConsultation(
        store,
        initiative.id,
        initialBriefConsultation.questions.map((question) => question.id)
      );
      await planner.runBriefJob({ initiativeId: initiative.id });
      await planner.runCoreFlowsJob({ initiativeId: initiative.id });
      await planner.runPrdJob({ initiativeId: initiative.id });
      await planner.runTechSpecJob({ initiativeId: initiative.id });
      await planner.runPlanJob({ initiativeId: initiative.id });

      const coverageArtifact = store.ticketCoverageArtifacts.get(`${initiative.id}:ticket-coverage`);
      expect(coverageArtifact?.items).toHaveLength(5);
      expect(coverageArtifact?.uncoveredItemIds).toEqual([]);
      expect(store.tickets.get("ticket-ticketcov1")?.coverageItemIds).toEqual([
        "coverage-brief-goals-1",
        "coverage-brief-constraints-1",
        "coverage-core-flows-flows-1",
        "coverage-prd-requirements-1",
        "coverage-tech-spec-verification-hooks-1"
      ]);
      expect(store.planningReviews.get(`${initiative.id}:ticket-coverage-review`)?.status).toBe("passed");

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

  it("rejects plan results that leave known coverage items unaccounted for", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-coverage-invalid-"));
    await createSpecflowLayout(rootDir);
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key-4";

    try {
      const store = new ArtifactStore({ rootDir, now: () => new Date("2026-02-27T20:00:00.000Z") });
      await store.initialize();
      await store.upsertConfig({
        provider: "openrouter",
        model: "openrouter/model",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

      const planner = new PlannerService({
        rootDir,
        store,
        llmClient: new MockLlmClient([
          JSON.stringify({
            initiativeTitle: "Auth setup",
            markdown: "# Auth setup",
            traceOutline: { sections: [{ key: "goals", label: "Goals", items: ["Support email login"] }] }
          }),
          JSON.stringify({
            markdown: "# Core flows",
            traceOutline: { sections: [{ key: "flows", label: "Flows", items: ["User signs in"] }] }
          }),
          JSON.stringify(reviewResult("Core flows review")),
          JSON.stringify(reviewResult("Brief/core flows cross-check")),
          JSON.stringify({
            markdown: "# PRD",
            traceOutline: { sections: [{ key: "requirements", label: "Requirements", items: ["Show login errors"] }] }
          }),
          JSON.stringify(reviewResult("PRD review")),
          JSON.stringify(reviewResult("Core flows/PRD cross-check")),
          JSON.stringify({
            markdown: "# Tech spec",
            traceOutline: { sections: [{ key: "verification-hooks", label: "Verification hooks", items: ["Add auth route tests"] }] }
          }),
          JSON.stringify(reviewResult("Tech spec review")),
          JSON.stringify(reviewResult("PRD/tech spec cross-check")),
          JSON.stringify(reviewResult("Spec set review")),
          ...repeatResponseTwice({
            phases: [
              {
                name: "Phase 1",
                order: 1,
                tickets: [
                  {
                    title: "Implement email login",
                    description: "Build the login flow",
                    acceptanceCriteria: ["Email login works"],
                    fileTargets: ["src/auth.ts"],
                    coverageItemIds: ["coverage-brief-goals-1"]
                  }
                ]
              }
            ],
            uncoveredCoverageItemIds: []
          })
        ]),
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:00:00.000Z"),
        idGenerator: () => "invalid01"
      });

      const initiative = await planner.createDraftInitiative({ description: "Build auth" });
      const initialBriefConsultation = await planner.runPhaseCheckJob({
        initiativeId: initiative.id,
        step: "brief"
      });
      await resolveBriefConsultation(
        store,
        initiative.id,
        initialBriefConsultation.questions.map((question) => question.id)
      );
      await planner.runBriefJob({ initiativeId: initiative.id });
      await planner.runCoreFlowsJob({ initiativeId: initiative.id });
      await planner.runPrdJob({ initiativeId: initiative.id });
      await planner.runTechSpecJob({ initiativeId: initiative.id });

      await expect(planner.runPlanJob({ initiativeId: initiative.id })).rejects.toThrow(
        "Missing Core flows flow: User signs in"
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

  it("requires the initial brief consultation before generating the first brief", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-brief-consult-"));
    await createSpecflowLayout(rootDir);
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key-5";

    try {
      const store = new ArtifactStore({ rootDir, now: () => new Date("2026-02-27T20:00:00.000Z") });
      await store.initialize();
      await store.upsertConfig({
        provider: "openrouter",
        model: "openrouter/model",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

      const mockClient = new MockLlmClient([
        JSON.stringify({
          initiativeTitle: "Auth setup",
          markdown: "# Auth setup",
          traceOutline: traceOutline("Brief")
        })
      ]);

      const planner = new PlannerService({
        rootDir,
        store,
        llmClient: mockClient,
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:00:00.000Z"),
        idGenerator: () => "consult1"
      });

      const initiative = await planner.createDraftInitiative({ description: "Build auth" });
      const consultation = await planner.runPhaseCheckJob({
        initiativeId: initiative.id,
        step: "brief"
      });

      expect(consultation.decision).toBe("ask");
      expect(consultation.questions).toHaveLength(4);
      await expect(planner.runBriefJob({ initiativeId: initiative.id })).rejects.toThrow(
        "Complete the required Brief consultation before creating this artifact"
      );

      await resolveBriefConsultation(
        store,
        initiative.id,
        consultation.questions.map((question) => question.id)
      );

      await expect(planner.runBriefJob({ initiativeId: initiative.id })).resolves.toMatchObject({
        markdown: "# Auth setup"
      });
      expect(store.planningReviews.get(`${initiative.id}:brief-review`)).toMatchObject({
        status: "passed",
        summary: "Brief intake resolved the blockers for the initial brief draft."
      });
      expect(mockClient.requests).toHaveLength(1);

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

  it("fails fast when persisted config has an invalid provider/model pair", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-planner-invalid-config-"));
    await createSpecflowLayout(rootDir);
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-openrouter-key-6";

    try {
      const store = new ArtifactStore({ rootDir, now: () => new Date("2026-02-27T20:00:00.000Z") });
      await store.initialize();
      await store.upsertConfig({
        provider: "openrouter",
        model: "openrouter/missing",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

      const mockClient = new MockLlmClient([
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
      ]);

      const planner = new PlannerService({
        rootDir,
        store,
        llmClient: mockClient,
        fetchImpl: mockProviderRegistryFetch,
        now: () => new Date("2026-02-27T20:00:00.000Z"),
        idGenerator: () => "badcfg01"
      });

      await expect(planner.runTriageJob({ description: "Fix a typo" })).rejects.toThrow(
        "Configured model 'openrouter/missing' is not available for provider 'openrouter'. Save settings with a supported model."
      );
      expect(mockClient.requests).toHaveLength(0);

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
