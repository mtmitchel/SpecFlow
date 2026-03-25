import { describe, expect, it, vi } from "vitest";
import {
  saveInitiativeSpec,
  updateInitiative,
} from "../src/runtime/handlers/initiative-handlers.js";
import { createInitiativeWorkflow } from "../src/planner/workflow-state.js";
import type { Initiative } from "../src/types/entities.js";
import type { SpecFlowRuntime } from "../src/runtime/types.js";

const NOW = "2026-03-25T10:00:00.000Z";

const createInitiative = (): Initiative => ({
  id: "initiative-12345678",
  title: "Local notes",
  description: "Build a desktop notes app.",
  projectRoot: "/tmp/specflow",
  status: "draft",
  phases: [],
  specIds: [],
  ticketIds: [],
  workflow: createInitiativeWorkflow(),
  createdAt: NOW,
  updatedAt: NOW,
});

const createRuntime = (initiative: Initiative) => {
  const initiatives = new Map([[initiative.id, initiative]]);
  const upsertInitiative = vi.fn(async (updated: Initiative) => {
    initiatives.set(updated.id, updated);
  });
  const markPlanningArtifactsStale = vi.fn(async () => undefined);

  const runtime = {
    store: {
      initiatives,
      tickets: new Map(),
      upsertInitiative,
    },
    plannerService: {
      markPlanningArtifactsStale,
    },
  } as unknown as SpecFlowRuntime;

  return {
    initiatives,
    runtime,
    upsertInitiative,
    markPlanningArtifactsStale,
  };
};

describe("initiative handlers", () => {
  it("normalizes updated project titles to sentence case", async () => {
    const initiative = createInitiative();
    const { runtime, initiatives } = createRuntime(initiative);

    const result = await updateInitiative(runtime, initiative.id, { title: "Focus Notes" });

    expect(result.initiative.title).toBe("Focus notes");
    expect(initiatives.get(initiative.id)?.title).toBe("Focus notes");
  });

  it("normalizes saved spec headings to sentence case", async () => {
    const initiative = createInitiative();
    initiative.workflow.steps.prd.status = "complete";
    const { runtime, upsertInitiative } = createRuntime(initiative);

    const result = await saveInitiativeSpec(runtime, initiative.id, "tech-spec", {
      content: "# Tech Spec\n\n## Focus Notes\n\nBody copy.",
    });

    expect(result.spec.content).toBe("# Tech spec\n\n## Focus notes\n\nBody copy.");
    expect(upsertInitiative).toHaveBeenCalledWith(
      expect.any(Object),
      {
        brief: undefined,
        coreFlows: undefined,
        prd: undefined,
        techSpec: "# Tech spec\n\n## Focus notes\n\nBody copy.",
      },
    );
  });
});
