import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSpecFlowServer } from "../../packages/app/src/server/create-server.js";
import { ArtifactStore } from "../../packages/app/src/store/artifact-store.js";
import { writeYamlFile } from "../../packages/app/src/io/yaml.js";
import {
  E2E_HOST,
  E2E_NOTE_FILE_PATH,
  E2E_ROOT_DIR,
  E2E_SERVER_PORT,
  E2E_STATIC_DIR,
} from "./constants.ts";
import { E2ePlannerService } from "./e2e-planner-service.ts";
import { E2eVerifierService } from "./e2e-verifier-service.ts";

const createNoteStoreSource = (): string => [
  "export const notes: string[] = [];",
  "",
  "export const saveNote = (note: string): string[] => {",
  "  return [...notes, note];",
  "};",
  "",
].join("\n");

const ensureFixtureRoot = async (): Promise<void> => {
  await rm(E2E_ROOT_DIR, { recursive: true, force: true });
  await mkdir(path.join(E2E_ROOT_DIR, "specflow", "initiatives"), { recursive: true });
  await mkdir(path.join(E2E_ROOT_DIR, "specflow", "tickets"), { recursive: true });
  await mkdir(path.join(E2E_ROOT_DIR, "specflow", "runs"), { recursive: true });
  await mkdir(path.join(E2E_ROOT_DIR, "specflow", "decisions"), { recursive: true });
  await mkdir(path.join(E2E_ROOT_DIR, "src"), { recursive: true });
  await mkdir(E2E_STATIC_DIR, { recursive: true });

  await writeFile(
    path.join(E2E_ROOT_DIR, "specflow", "AGENTS.md"),
    "Keep note persistence local and add tests for workflow changes.\n",
    "utf8",
  );
  await writeFile(path.join(E2E_STATIC_DIR, "index.html"), "<html><body>SpecFlow E2E</body></html>\n", "utf8");
  await writeFile(E2E_NOTE_FILE_PATH, createNoteStoreSource(), "utf8");
  await writeYamlFile(path.join(E2E_ROOT_DIR, "specflow", "config.yaml"), {
    provider: "openrouter",
    model: "openrouter/auto",
    host: E2E_HOST,
    port: E2E_SERVER_PORT,
    repoInstructionFile: "specflow/AGENTS.md",
  });
};

const main = async (): Promise<void> => {
  await ensureFixtureRoot();

  const store = new ArtifactStore({ rootDir: E2E_ROOT_DIR });
  const server = await createSpecFlowServer({
    rootDir: E2E_ROOT_DIR,
    host: E2E_HOST,
    port: E2E_SERVER_PORT,
    staticDir: E2E_STATIC_DIR,
    store,
    plannerService: new E2ePlannerService(E2E_ROOT_DIR, store),
    verifierService: new E2eVerifierService(E2E_ROOT_DIR, store),
  });

  await server.start();
  process.stdout.write(`[specflow-e2e] backend ready at http://${E2E_HOST}:${E2E_SERVER_PORT}\n`);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
};

void main().catch((error) => {
  process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
  process.exit(1);
});
