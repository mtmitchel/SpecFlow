import path from "node:path";

/** Throws if resolved child escapes the parent directory. */
export const assertContainedId = (parent: string, child: string): void => {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(parent, child);
  if (!resolvedChild.startsWith(resolvedParent + path.sep) && resolvedChild !== resolvedParent) {
    throw new Error(`Path traversal detected: "${child}" escapes "${parent}"`);
  }
};

export const specflowDir = (rootDir: string): string => path.join(rootDir, "specflow");

export const configPath = (rootDir: string): string => path.join(specflowDir(rootDir), "config.yaml");
export const agentsPath = (rootDir: string): string => path.join(specflowDir(rootDir), "AGENTS.md");

export const initiativesDir = (rootDir: string): string => path.join(specflowDir(rootDir), "initiatives");
export const initiativeDir = (rootDir: string, initiativeId: string): string =>
  path.join(initiativesDir(rootDir), initiativeId);
export const initiativeYamlPath = (rootDir: string, initiativeId: string): string =>
  path.join(initiativeDir(rootDir, initiativeId), "initiative.yaml");

export const ticketsDir = (rootDir: string): string => path.join(specflowDir(rootDir), "tickets");
export const ticketPath = (rootDir: string, ticketId: string): string =>
  path.join(ticketsDir(rootDir), `${ticketId}.yaml`);

export const runsDir = (rootDir: string): string => path.join(specflowDir(rootDir), "runs");
export const runDir = (rootDir: string, runId: string): string => path.join(runsDir(rootDir), runId);
export const runYamlPath = (rootDir: string, runId: string): string => path.join(runDir(rootDir, runId), "run.yaml");
export const attemptsDir = (rootDir: string, runId: string): string => path.join(runDir(rootDir, runId), "attempts");
export const attemptDir = (rootDir: string, runId: string, attemptId: string): string =>
  path.join(attemptsDir(rootDir, runId), attemptId);
export const verificationPath = (rootDir: string, runId: string, attemptId: string): string =>
  path.join(attemptDir(rootDir, runId, attemptId), "verification.json");

export const runTmpDir = (rootDir: string, runId: string): string => path.join(runDir(rootDir, runId), "_tmp");
export const operationDir = (rootDir: string, runId: string, operationId: string): string => {
  const parent = runTmpDir(rootDir, runId);
  assertContainedId(parent, operationId);
  return path.join(parent, operationId);
};
export const operationManifestPath = (rootDir: string, runId: string, operationId: string): string =>
  path.join(operationDir(rootDir, runId, operationId), "operation-manifest.yaml");
export const operationAttemptDir = (
  rootDir: string,
  runId: string,
  operationId: string,
  attemptId: string
): string => path.join(operationDir(rootDir, runId, operationId), "attempts", attemptId);

export const decisionsDir = (rootDir: string): string => path.join(specflowDir(rootDir), "decisions");
