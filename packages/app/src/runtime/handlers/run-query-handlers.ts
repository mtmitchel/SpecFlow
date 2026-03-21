import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { BundleManifest } from "../../bundle/types.js";
import { readYamlFile } from "../../io/yaml.js";
import type { Run } from "../../types/entities.js";
import { zipDirectory } from "../../io/zip-directory.js";
import { isContainedPath } from "../../validation.js";
import type { SpecFlowRuntime } from "../types.js";
import { badRequest, notFound } from "../errors.js";
import { requireValidEntityId } from "./shared.js";

const readTextIfExists = async (filePath: string): Promise<string | null> => {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
};

const loadRunAttempts = (run: Run, runtime: SpecFlowRuntime) =>
  run.attempts
    .map((attemptId) => {
      const attempt = runtime.store.runAttempts.get(`${run.id}:${attemptId}`);
      if (!attempt) {
        return null;
      }

      return {
        attemptId: attempt.attemptId,
        overallPass: attempt.overallPass,
        overrideReason: attempt.overrideReason,
        overrideAccepted: attempt.overrideAccepted,
        createdAt: attempt.createdAt
      };
    })
    .filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt));

export const listRuns = async (
  runtime: SpecFlowRuntime,
  query: Partial<{
    ticketId: string;
    agent: Run["agentType"];
    status: Run["status"];
    dateFrom: string;
    dateTo: string;
  }>
) => {
  let runs = Array.from(runtime.store.runs.values());

  if (query.ticketId) {
    runs = runs.filter((run) => run.ticketId === query.ticketId);
  }
  if (query.agent) {
    runs = runs.filter((run) => run.agentType === query.agent);
  }
  if (query.status) {
    runs = runs.filter((run) => run.status === query.status);
  }

  const fromMs = query.dateFrom ? Date.parse(query.dateFrom) : null;
  const toMs = query.dateTo ? Date.parse(query.dateTo) : null;
  if ((query.dateFrom && Number.isNaN(fromMs)) || (query.dateTo && Number.isNaN(toMs))) {
    throw badRequest("dateFrom/dateTo must be valid ISO-8601 timestamps");
  }

  if (fromMs !== null || toMs !== null) {
    runs = runs.filter((run) => {
      const candidate = Date.parse(run.lastCommittedAt ?? run.createdAt);
      if (Number.isNaN(candidate)) {
        return false;
      }

      if (fromMs !== null && candidate < fromMs) {
        return false;
      }
      if (toMs !== null && candidate > toMs) {
        return false;
      }

      return true;
    });
  }

  runs.sort((left, right) => Date.parse(right.lastCommittedAt ?? right.createdAt) - Date.parse(left.lastCommittedAt ?? left.createdAt));

  return {
    runs: await Promise.all(
      runs.map(async (run) => {
        const operationState = run.activeOperationId
          ? (await runtime.store.getOperationStatus(run.activeOperationId))?.state ?? null
          : null;

        return {
          run,
          ticket: run.ticketId ? runtime.store.tickets.get(run.ticketId) ?? null : null,
          attempts: loadRunAttempts(run, runtime),
          operationState
        };
      })
    )
  };
};

export const getRunDetail = async (runtime: SpecFlowRuntime, runId: string) => {
  requireValidEntityId(runId, "run ID");
  const run = runtime.store.runs.get(runId);
  if (!run) {
    throw notFound(`Run ${runId} not found`);
  }

  const attempts = run.attempts
    .map((attemptId) => {
      const attempt = runtime.store.runAttempts.get(`${run.id}:${attemptId}`);
      return attempt ? { id: `${run.id}:${attempt.attemptId}`, ...attempt } : null;
    })
    .filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  const committedAttempt = run.committedAttemptId ? runtime.store.runAttempts.get(`${run.id}:${run.committedAttemptId}`) : null;
  const committedAttemptDetail = run.committedAttemptId
    ? await runtime.store.readRunAttempt(run.id, run.committedAttemptId)
    : null;
  const attemptRoot = run.committedAttemptId
    ? path.join(runtime.rootDir, "specflow", "runs", run.id, "attempts", run.committedAttemptId)
    : null;

  if (attemptRoot && !isContainedPath(path.join(runtime.rootDir, "specflow", "runs"), attemptRoot)) {
    throw badRequest("Path traversal detected");
  }

  const bundleManifest = attemptRoot
    ? await readYamlFile<BundleManifest>(path.join(attemptRoot, "bundle-manifest.yaml"))
    : null;
  const operationState = run.activeOperationId
    ? (await runtime.store.getOperationStatus(run.activeOperationId))?.state ?? null
    : null;

  return {
    run,
    ticket: run.ticketId ? runtime.store.tickets.get(run.ticketId) ?? null : null,
    attempts,
    operationState,
    committed: run.committedAttemptId
          ? {
              attemptId: run.committedAttemptId,
              attempt: committedAttempt ?? null,
              attemptDetail: committedAttemptDetail,
              bundleManifest
        }
      : null
  };
};

export const getRunAttemptDetail = async (
  runtime: SpecFlowRuntime,
  runId: string,
  attemptId: string
) => {
  requireValidEntityId(runId, "run ID");
  requireValidEntityId(attemptId, "attempt ID");

  const run = runtime.store.runs.get(runId);
  if (!run) {
    throw notFound(`Run ${runId} not found`);
  }

  if (!run.attempts.includes(attemptId)) {
    throw notFound(`Attempt ${attemptId} not found for run ${runId}`);
  }

  const attempt = await runtime.store.readRunAttempt(runId, attemptId);
  if (!attempt) {
    throw notFound(`Attempt ${attemptId} not found for run ${runId}`);
  }

  return {
    attempt: {
      id: `${runId}:${attemptId}`,
      ...attempt
    }
  };
};

export const getRunDiff = async (
  runtime: SpecFlowRuntime,
  runId: string,
  attemptId: string,
  kind: "primary" | "drift"
) => {
  requireValidEntityId(runId, "run ID");
  requireValidEntityId(attemptId, "attempt ID");

  const artifactFile = kind === "primary" ? "diff-primary.patch" : "diff-drift.patch";
  const diffPath = path.join(runtime.rootDir, "specflow", "runs", runId, "attempts", attemptId, artifactFile);
  if (!isContainedPath(path.join(runtime.rootDir, "specflow", "runs"), diffPath)) {
    throw badRequest("Path traversal detected");
  }

  const diff = await readTextIfExists(diffPath);
  if (diff === null) {
    throw notFound(`${kind} diff not found for run ${runId} attempt ${attemptId}`);
  }

  return {
    kind,
    diff
  };
};

export const getBundleText = async (
  runtime: SpecFlowRuntime,
  runId: string,
  attemptId: string
) => {
  requireValidEntityId(runId, "run ID");
  requireValidEntityId(attemptId, "attempt ID");

  const promptPath = path.join(runtime.rootDir, "specflow", "runs", runId, "attempts", attemptId, "bundle", "PROMPT.md");
  if (!isContainedPath(path.join(runtime.rootDir, "specflow", "runs"), promptPath)) {
    throw badRequest("Path traversal detected");
  }

  const content = await readTextIfExists(promptPath);
  if (content === null) {
    throw notFound(`Bundle text not found for run ${runId} attempt ${attemptId}`);
  }

  return {
    content
  };
};

export const getBundleZipStream = async (
  runtime: SpecFlowRuntime,
  runId: string,
  attemptId: string
) => {
  requireValidEntityId(runId, "runId");
  requireValidEntityId(attemptId, "attemptId");

  const bundleDir = path.join(runtime.rootDir, "specflow", "runs", runId, "attempts", attemptId, "bundle");
  if (!isContainedPath(path.join(runtime.rootDir, "specflow", "runs"), bundleDir)) {
    throw badRequest("Path traversal detected");
  }

  try {
    return {
      filename: `${runId}-${attemptId}-bundle.zip`,
      stream: await zipDirectory(bundleDir)
    };
  } catch (error) {
    throw notFound(`Bundle directory not found for run ${runId} attempt ${attemptId}: ${(error as Error).message}`);
  }
};

export const saveBundleZipToFile = async (
  runtime: SpecFlowRuntime,
  runId: string,
  attemptId: string,
  destinationPath: string
) => {
  if (!destinationPath.trim()) {
    throw badRequest("destinationPath is required");
  }

  const zip = await getBundleZipStream(runtime, runId, attemptId);
  const absoluteDestination = path.resolve(destinationPath);
  await mkdir(path.dirname(absoluteDestination), { recursive: true });
  await pipeline(zip.stream, createWriteStream(absoluteDestination));

  return {
    path: absoluteDestination,
    filename: zip.filename
  };
};

export const getRunState = async (runtime: SpecFlowRuntime, runId: string) => {
  requireValidEntityId(runId, "run ID");
  const run = runtime.store.runs.get(runId);
  if (!run) {
    throw notFound(`Run ${runId} not found`);
  }

  return {
    run,
    attempts: (
      await Promise.all(
        run.attempts.map(async (attemptId) => runtime.store.readRunAttempt(runId, attemptId))
      )
    ).filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt))
  };
};

export const getRunProgress = async (runtime: SpecFlowRuntime, runId: string) => {
  requireValidEntityId(runId, "run ID");
  const run = runtime.store.runs.get(runId);
  if (!run) {
    throw notFound(`Run ${runId} not found`);
  }

  return {
    run,
    operationState: run.activeOperationId
      ? (await runtime.store.getOperationStatus(run.activeOperationId))?.state ?? null
      : null,
    attempts: loadRunAttempts(run, runtime)
  };
};
