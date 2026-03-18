import { describe, expect, it } from "vitest";
import { createInitiativeWorkflow } from "../src/planner/workflow-state.js";
import { persistPhaseMarkdown } from "../src/planner/internal/spec-artifacts.js";
import type { Initiative, SpecDocumentSummary } from "../src/types/entities.js";

const baseInitiative: Initiative = {
  id: "initiative-12345678",
  title: "Lightweight, Fast Note-taking App Inspired By Simplenote, wit...",
  description: "Lightweight, fast note-taking app inspired by Simplenote, with offline-first local storage and dual views.",
  status: "draft",
  phases: [],
  specIds: [],
  ticketIds: [],
  workflow: createInitiativeWorkflow(),
  createdAt: "2026-03-17T19:00:00.000Z",
  updatedAt: "2026-03-17T19:00:00.000Z"
};

const persistedSpec = (initiativeId: string, step: "brief" | "core-flows" | "prd" | "tech-spec"): SpecDocumentSummary => ({
  id: `${initiativeId}:${step}`,
  initiativeId,
  type: step,
  title: step,
  sourcePath: `specflow/initiatives/${initiativeId}/${step}.md`,
  createdAt: "2026-03-17T19:00:00.000Z",
  updatedAt: "2026-03-17T19:05:00.000Z"
});

describe("persistPhaseMarkdown", () => {
  it("promotes a titled brief heading into the initiative title when the current title is still derived", async () => {
    const specs = new Map<string, SpecDocumentSummary>([[`${baseInitiative.id}:brief`, persistedSpec(baseInitiative.id, "brief")]]);
    let savedInitiative: Initiative | null = null;

    await persistPhaseMarkdown({
      initiative: baseInitiative,
      step: "brief",
      result: {
        markdown: "# Local Notes\n\n## Summary\n\nBody copy.",
        traceOutline: { sections: [] }
      },
      nowIso: "2026-03-17T19:05:00.000Z",
      upsertInitiative: async (initiative) => {
        savedInitiative = initiative;
      },
      specs,
      upsertArtifactTrace: async () => undefined,
      markPlanningArtifactsStale: async () => undefined
    });

    expect(savedInitiative?.title).toBe("Local Notes");
  });

  it("does not overwrite a custom initiative title when persisting a brief", async () => {
    const initiative: Initiative = {
      ...baseInitiative,
      title: "Sidecar Notebook"
    };
    const specs = new Map<string, SpecDocumentSummary>([[`${initiative.id}:brief`, persistedSpec(initiative.id, "brief")]]);
    let savedInitiative: Initiative | null = null;

    await persistPhaseMarkdown({
      initiative,
      step: "brief",
      result: {
        markdown: "# Local Notes\n\n## Summary\n\nBody copy.",
        traceOutline: { sections: [] }
      },
      nowIso: "2026-03-17T19:05:00.000Z",
      upsertInitiative: async (nextInitiative) => {
        savedInitiative = nextInitiative;
      },
      specs,
      upsertArtifactTrace: async () => undefined,
      markPlanningArtifactsStale: async () => undefined
    });

    expect(savedInitiative?.title).toBe("Sidecar Notebook");
  });
});
