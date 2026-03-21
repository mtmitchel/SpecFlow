import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { attemptDir, runYamlPath } from "../../io/paths.js";
import { readYamlFile } from "../../io/yaml.js";
import type { ArtifactStore } from "../../store/artifact-store.js";
import type { Run } from "../../types/entities.js";
import { isContainedPath } from "../validation.js";
import type { AuditReport } from "./types.js";

const AUDIT_REPORT_FILE_NAME = "audit-findings.json";

const legacyAuditReportPath = (rootDir: string, runId: string): string =>
  path.join(rootDir, "specflow", "runs", runId, "audit-findings.json");

export const auditReportPath = (rootDir: string, runId: string, attemptId: string): string =>
  path.join(attemptDir(rootDir, runId, attemptId), AUDIT_REPORT_FILE_NAME);

const readReportFile = async (filePath: string): Promise<AuditReport | null> => {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as AuditReport;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }

    throw error;
  }
};

const loadAttemptFiles = async (
  attemptRoot: string,
  currentDir: string = attemptRoot
): Promise<Array<{ relativePath: string; content: string }>> => {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: Array<{ relativePath: string; content: string }> = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (!isContainedPath(attemptRoot, absolutePath)) {
      throw new Error(`Attempt artifact path escaped attempt root: ${absolutePath}`);
    }

    if (entry.isDirectory()) {
      files.push(...(await loadAttemptFiles(attemptRoot, absolutePath)));
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(`Unsupported attempt artifact entry: ${absolutePath}`);
    }

    const relativePath = path.relative(attemptRoot, absolutePath).split(path.sep).join("/");
    files.push({
      relativePath,
      content: await readFile(absolutePath, "utf8")
    });
  }

  return files;
};

const readCommittedAttemptId = async (rootDir: string, runId: string): Promise<string | null> => {
  const run = await readYamlFile<Run>(runYamlPath(rootDir, runId));
  return run?.committedAttemptId ?? null;
};

export const readAuditReport = async (rootDir: string, runId: string): Promise<AuditReport | null> => {
  const committedAttemptId = await readCommittedAttemptId(rootDir, runId);
  if (committedAttemptId) {
    const committedReport = await readReportFile(auditReportPath(rootDir, runId, committedAttemptId));
    if (committedReport) {
      return committedReport;
    }
  }

  return readReportFile(legacyAuditReportPath(rootDir, runId));
};

export const writeAuditReport = async (input: {
  rootDir: string;
  store: ArtifactStore;
  report: AuditReport;
  operationId: string;
  leaseMs?: number;
}): Promise<void> => {
  const run = input.store.runs.get(input.report.runId);
  if (!run) {
    throw new Error(`Run ${input.report.runId} not found`);
  }

  const attemptId = run.committedAttemptId;
  if (!attemptId) {
    throw new Error(`Run ${input.report.runId} has no committed attempt`);
  }

  const committedAttemptDir = attemptDir(input.rootDir, input.report.runId, attemptId);
  if (!isContainedPath(path.join(input.rootDir, "specflow", "runs"), committedAttemptDir)) {
    throw new Error("Path traversal detected");
  }

  const existingFiles = await loadAttemptFiles(committedAttemptDir);
  const nextFiles = existingFiles.filter((file) => file.relativePath !== AUDIT_REPORT_FILE_NAME);
  nextFiles.push({
    relativePath: AUDIT_REPORT_FILE_NAME,
    content: JSON.stringify(input.report, null, 2)
  });

  await input.store.prepareRunOperation({
    runId: input.report.runId,
    operationId: input.operationId,
    attemptId,
    leaseMs: input.leaseMs ?? 60_000,
    artifacts: {
      additionalFiles: nextFiles
    }
  });

  await input.store.commitRunOperation({
    runId: input.report.runId,
    operationId: input.operationId
  });
};
