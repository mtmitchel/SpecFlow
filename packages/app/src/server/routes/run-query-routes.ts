import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { BundleManifest } from "../../bundle/types.js";
import { readYamlFile } from "../../io/yaml.js";
import type { ArtifactStore } from "../../store/artifact-store.js";
import type { Run } from "../../types/entities.js";
import { isContainedPath, isValidEntityId } from "../validation.js";
import { zipDirectory } from "../zip/zip-directory.js";

export interface RegisterRunQueryRoutesOptions {
  rootDir: string;
  store: ArtifactStore;
}

const readTextIfExists = async (filePath: string): Promise<string | null> => {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
};

const loadRunAttempts = (run: Run, store: ArtifactStore) =>
  run.attempts
    .map((attemptId) => {
      const attempt = store.runAttempts.get(`${run.id}:${attemptId}`);
      if (!attempt) {
        return null;
      }

      return {
        attemptId: attempt.attemptId,
        overallPass: attempt.overallPass,
        createdAt: attempt.createdAt
      };
    })
    .filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt));

export const registerRunQueryRoutes = (app: FastifyInstance, options: RegisterRunQueryRoutesOptions): void => {
  const { rootDir, store } = options;

  app.get("/api/runs", async (request, reply) => {
    const query = (request.query ?? {}) as Partial<{
      ticketId: string;
      agent: Run["agentType"];
      status: Run["status"];
      dateFrom: string;
      dateTo: string;
    }>;

    let runs = Array.from(store.runs.values());

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
      await reply.code(400).send({
        error: "Bad Request",
        message: "dateFrom/dateTo must be valid ISO-8601 timestamps"
      });
      return;
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

    runs.sort((left, right) => {
      const leftMs = Date.parse(left.lastCommittedAt ?? left.createdAt);
      const rightMs = Date.parse(right.lastCommittedAt ?? right.createdAt);
      return rightMs - leftMs;
    });

    const payload = await Promise.all(
      runs.map(async (run) => {
        const attempts = loadRunAttempts(run, store);

        const operationState = run.activeOperationId
          ? (await store.getOperationStatus(run.activeOperationId))?.state ?? null
          : null;

        return {
          run,
          ticket: run.ticketId ? store.tickets.get(run.ticketId) ?? null : null,
          attempts,
          operationState
        };
      })
    );

    await reply.send({ runs: payload });
  });

  app.get("/api/runs/:id", async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    if (!isValidEntityId(runId)) {
      await reply.code(400).send({ error: "Bad Request", message: "Invalid run ID format" });
      return;
    }
    const run = store.runs.get(runId);

    if (!run) {
      await reply.code(404).send({ error: "Not Found", message: `Run ${runId} not found` });
      return;
    }

    const attempts = run.attempts
      .map((attemptId) => {
        const attempt = store.runAttempts.get(`${run.id}:${attemptId}`);
        if (!attempt) {
          return null;
        }

        return { id: `${run.id}:${attempt.attemptId}`, ...attempt };
      })
      .filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

    const committedAttempt = run.committedAttemptId ? store.runAttempts.get(`${run.id}:${run.committedAttemptId}`) : null;
    const attemptRoot = run.committedAttemptId
      ? path.join(rootDir, "specflow", "runs", run.id, "attempts", run.committedAttemptId)
      : null;

    const bundleManifest = attemptRoot
      ? await readYamlFile<BundleManifest>(path.join(attemptRoot, "bundle-manifest.yaml"))
      : null;
    const primaryDiff = attemptRoot ? await readTextIfExists(path.join(attemptRoot, "diff-primary.patch")) : null;
    const driftDiff = attemptRoot ? await readTextIfExists(path.join(attemptRoot, "diff-drift.patch")) : null;
    const operationState = run.activeOperationId
      ? (await store.getOperationStatus(run.activeOperationId))?.state ?? null
      : null;

    await reply.send({
      run,
      ticket: run.ticketId ? store.tickets.get(run.ticketId) ?? null : null,
      attempts,
      operationState,
      committed: run.committedAttemptId
        ? {
            attemptId: run.committedAttemptId,
            attempt: committedAttempt ?? null,
            bundleManifest,
            primaryDiff,
            driftDiff
          }
        : null
    });
  });

  app.get("/api/runs/:runId/attempts/:attemptId/bundle.zip", async (request, reply) => {
    const params = request.params as { runId: string; attemptId: string };

    if (!isValidEntityId(params.runId) || !isValidEntityId(params.attemptId)) {
      await reply.code(400).send({ error: "Bad Request", message: "Invalid runId or attemptId format" });
      return;
    }

    const bundleDir = path.join(rootDir, "specflow", "runs", params.runId, "attempts", params.attemptId, "bundle");

    if (!isContainedPath(path.join(rootDir, "specflow", "runs"), bundleDir)) {
      await reply.code(400).send({ error: "Bad Request", message: "Path traversal detected" });
      return;
    }

    try {
      const zipStream = await zipDirectory(bundleDir);
      await reply
        .header("Content-Type", "application/zip")
        .header("Content-Disposition", `attachment; filename="${params.runId}-${params.attemptId}-bundle.zip"`)
        .send(zipStream);
    } catch (error) {
      await reply.code(404).send({
        error: "Not Found",
        message: `Bundle directory not found for run ${params.runId} attempt ${params.attemptId}: ${(error as Error).message}`
      });
    }
  });

  app.get("/api/runs/:id/state", async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    if (!isValidEntityId(runId)) {
      await reply.code(400).send({ error: "Bad Request", message: "Invalid run ID format" });
      return;
    }
    const run = store.runs.get(runId);

    if (!run) {
      await reply.code(404).send({ error: "Not Found", message: `Run ${runId} not found` });
      return;
    }

    const attempts = run.attempts
      .map((attemptId) => store.runAttempts.get(`${runId}:${attemptId}`))
      .filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt));

    await reply.send({ run, attempts });
  });
};
