import { readFile } from "node:fs/promises";
import path from "node:path";
import { verificationPath } from "../../io/paths.js";
import { ArtifactStore } from "../../store/artifact-store.js";
import type { RunAttempt } from "../../types/entities.js";

export const readAttemptArtifact = async (
  rootDir: string,
  runId: string,
  attemptId: string,
  artifactFile: "diff-primary.patch" | "diff-drift.patch"
): Promise<string | null> => {
  const artifactPath = path.join(rootDir, "specflow", "runs", runId, "attempts", attemptId, artifactFile);

  try {
    return await readFile(artifactPath, "utf8");
  } catch {
    return null;
  }
};

export const resolveExistingVerificationOperation = async (input: {
  rootDir: string;
  store: ArtifactStore;
  operationId: string;
}): Promise<{ runId: string; attempt: RunAttempt } | null> => {
  const existing = await input.store.getOperationStatus(input.operationId);
  if (!existing) {
    return null;
  }

  if (existing.state !== "committed") {
    throw new Error(`Operation ${input.operationId} is currently ${existing.state}`);
  }

  const mapKey = `${existing.runId}:${existing.targetAttemptId}`;
  const inMemory = input.store.runAttempts.get(mapKey);
  if (inMemory) {
    return { runId: existing.runId, attempt: inMemory };
  }

  const file = await readFile(
    verificationPath(input.rootDir, existing.runId, existing.targetAttemptId),
    "utf8"
  );
  const parsed = JSON.parse(file) as RunAttempt;
  return { runId: existing.runId, attempt: parsed };
};
