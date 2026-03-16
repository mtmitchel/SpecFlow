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

const createSpecflowLayout = async (rootDir: string): Promise<void> => {
  const base = specflowDir(rootDir);
  await mkdir(path.join(base, "initiatives"), { recursive: true });
  await mkdir(path.join(base, "tickets"), { recursive: true });
  await mkdir(path.join(base, "runs"), { recursive: true });
  await mkdir(path.join(base, "decisions"), { recursive: true });
  await writeFile(path.join(base, "AGENTS.md"), "team-rules: always include tests\n", "utf8");
};

const resolveBriefConsultation = async (
  store: ArtifactStore,
  initiativeId: string,
  defaultAnswerQuestionIds: string[]
): Promise<void> => {
  const initiative = store.initiatives.get(initiativeId);
  if (!initiative) {
    throw new Error(`Initiative ${initiativeId} not found in test fixture`);
  }

  await store.upsertInitiative({
    ...initiative,
    workflow: updateRefinementState(initiative.workflow, "brief", {
      defaultAnswerQuestionIds,
      checkedAt: initiative.workflow.refinements.brief.checkedAt ?? "2026-02-27T20:00:00.000Z"
    }),
    updatedAt: "2026-02-27T20:00:00.000Z"
  });
};

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

    expect(prompt.userPrompt).toContain("first required Brief consultation for a fresh initiative");
    expect(prompt.userPrompt).toContain('You must return "ask"');
    expect(prompt.userPrompt).toContain("Ask exactly 4 short consultation questions");
    expect(prompt.userPrompt).toContain('Every question must use "select", "multi-select", or "boolean"');
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
        apiKey: "",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

      const mockClient = new MockLlmClient([
        JSON.stringify({
          decision: "proceed",
          questions: [],
          assumptions: []
        }),
        JSON.stringify({
          markdown: "# Brief",
          traceOutline: traceOutline("Brief")
        }),
        JSON.stringify(reviewResult("Brief review")),
        JSON.stringify({
          decision: "proceed",
          questions: [],
          assumptions: []
        }),
        JSON.stringify({
          markdown: "# Core Flows",
          traceOutline: traceOutline("Core flows")
        }),
        JSON.stringify(reviewResult("Core flows review")),
        JSON.stringify(reviewResult("Brief/core flows cross-check")),
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
          decision: "proceed",
          questions: [],
          assumptions: []
        }),
        JSON.stringify({
          markdown: "# Tech Spec",
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
                  title: "T1",
                  description: "Implement",
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
      await planner.runCoreFlowsJob({
        initiativeId: initiative.id
      });
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
      await planner.runTechSpecJob({
        initiativeId: initiative.id
      });
      await planner.runPlanJob({ initiativeId: initiative.id });
      await planner.runTriageJob({ description: "Add one button" });

      expect(store.planningReviews.get(`${initiative.id}:ticket-coverage-review`)?.status).toBe("passed");
      expect(mockClient.requests).toHaveLength(19);
      expect(mockClient.requests[0]?.userPrompt).toContain('Default to "proceed"');
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
        apiKey: "",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      });

      const mockClient = new MockLlmClient([
        JSON.stringify({
          markdown: "# Brief",
          traceOutline: {
            sections: [
              { key: "goals", label: "Goals", items: ["Support email login"] },
              { key: "constraints", label: "Constraints", items: ["Keep auth local-first"] }
            ]
          }
        }),
        JSON.stringify(reviewResult("Brief review")),
        JSON.stringify({
          markdown: "# Core Flows",
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
          markdown: "# Tech Spec",
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
            markdown: "# Brief",
            traceOutline: { sections: [{ key: "goals", label: "Goals", items: ["Support email login"] }] }
          }),
          JSON.stringify(reviewResult("Brief review")),
          JSON.stringify({
            markdown: "# Core Flows",
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
            markdown: "# Tech Spec",
            traceOutline: { sections: [{ key: "verification-hooks", label: "Verification hooks", items: ["Add auth route tests"] }] }
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
        'Coverage item "coverage-core-flows-flows-1" is missing from the generated plan'
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
            markdown: "# Brief",
            traceOutline: traceOutline("Brief")
          }),
          JSON.stringify(reviewResult("Brief review"))
        ]),
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
        markdown: "# Brief"
      });

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
