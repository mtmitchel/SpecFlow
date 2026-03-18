import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeYamlFile } from "../src/io/yaml.js";
import { initiativeYamlPath, specflowDir } from "../src/io/paths.js";
import { ArtifactStore } from "../src/store/artifact-store.js";
import { createInitiativeWorkflow } from "../src/planner/workflow-state.js";
import type { Initiative } from "../src/types/entities.js";

const NOW = "2026-03-17T20:30:00.000Z";
const tempDirs: string[] = [];

const createRootLayout = async (rootDir: string): Promise<void> => {
  const base = specflowDir(rootDir);
  await mkdir(path.join(base, "initiatives"), { recursive: true });
  await mkdir(path.join(base, "tickets"), { recursive: true });
  await mkdir(path.join(base, "runs"), { recursive: true });
  await mkdir(path.join(base, "decisions"), { recursive: true });
};

const createStore = (rootDir: string): ArtifactStore =>
  new ArtifactStore({
    rootDir,
    cleanupIntervalMs: 10_000,
    cleanupTtlMs: 10_000,
    now: () => new Date(NOW),
  });

const writeInitiativeFixture = async (rootDir: string, initiative: Initiative, briefMarkdown: string): Promise<void> => {
  const initiativeDir = path.join(specflowDir(rootDir), "initiatives", initiative.id);
  await mkdir(initiativeDir, { recursive: true });
  await writeYamlFile(initiativeYamlPath(rootDir, initiative.id), initiative);
  await writeFile(path.join(initiativeDir, "brief.md"), briefMarkdown, "utf8");
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("spec summary titles", () => {
  it("promotes the generated brief title into the loaded initiative when the stored title is still derived", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-spec-titles-"));
    tempDirs.push(rootDir);
    await createRootLayout(rootDir);

    const initiative: Initiative = {
      id: "initiative-12345678",
      title: "Lightweight, Fast Note-taking App Inspired By Simplenote, wit...",
      description: "Lightweight, fast note-taking app inspired by Simplenote, with offline-first local storage and dual views.",
      status: "active",
      phases: [],
      specIds: ["initiative-12345678:brief"],
      ticketIds: [],
      workflow: createInitiativeWorkflow(),
      createdAt: NOW,
      updatedAt: NOW,
    };

    await writeInitiativeFixture(
      rootDir,
      initiative,
      "# Lightweight PWA Notes (List + Card Views)\n\n## Summary\n\nBody copy.",
    );

    const store = createStore(rootDir);
    await store.reloadFromDisk();

    expect(store.initiatives.get(initiative.id)?.title).toBe("Lightweight PWA Notes (List + Card Views)");
    expect(store.specs.get(`${initiative.id}:brief`)?.title).toBe("Lightweight PWA Notes (List + Card Views)");
  });

  it("keeps a custom initiative title while still exposing the brief title on the spec summary", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-spec-titles-custom-"));
    tempDirs.push(rootDir);
    await createRootLayout(rootDir);

    const initiative: Initiative = {
      id: "initiative-87654321",
      title: "Sidecar Notebook",
      description: "Lightweight, fast note-taking app inspired by Simplenote, with offline-first local storage and dual views.",
      status: "active",
      phases: [],
      specIds: ["initiative-87654321:brief"],
      ticketIds: [],
      workflow: createInitiativeWorkflow(),
      createdAt: NOW,
      updatedAt: NOW,
    };

    await writeInitiativeFixture(
      rootDir,
      initiative,
      "# Lightweight PWA Notes (List + Card Views)\n\n## Summary\n\nBody copy.",
    );

    const store = createStore(rootDir);
    await store.reloadFromDisk();

    expect(store.initiatives.get(initiative.id)?.title).toBe("Sidecar Notebook");
    expect(store.specs.get(`${initiative.id}:brief`)?.title).toBe("Lightweight PWA Notes (List + Card Views)");
  });
});
