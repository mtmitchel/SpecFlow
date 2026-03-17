import type { FastifyInstance } from "fastify";
import {
  getBundleText,
  getBundleZipStream,
  getRunAttemptDetail,
  getRunDetail,
  getRunDiff,
  getRunProgress,
  getRunState,
  listRuns
} from "../../runtime/handlers/run-query-handlers.js";
import { isHandlerError } from "../../runtime/errors.js";
import { sendHandlerError } from "../../runtime/handlers/shared.js";
import type { SpecFlowRuntime } from "../../runtime/types.js";

export interface RegisterRunQueryRoutesOptions {
  runtime: SpecFlowRuntime;
}

export const registerRunQueryRoutes = (app: FastifyInstance, options: RegisterRunQueryRoutesOptions): void => {
  const { runtime } = options;

  app.get("/api/runs", async (request, reply) => {
    try {
      await reply.send(await listRuns(runtime, (request.query ?? {}) as Record<string, unknown>));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.get("/api/runs/:id", async (request, reply) => {
    try {
      await reply.send(await getRunDetail(runtime, (request.params as { id: string }).id));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.get("/api/runs/:runId/attempts/:attemptId/bundle.zip", async (request, reply) => {
    try {
      const params = request.params as { runId: string; attemptId: string };
      const zip = await getBundleZipStream(runtime, params.runId, params.attemptId);
      await reply
        .header("Content-Type", "application/zip")
        .header("Content-Disposition", `attachment; filename="${zip.filename}"`)
        .send(zip.stream);
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.get("/api/runs/:runId/attempts/:attemptId", async (request, reply) => {
    try {
      const params = request.params as { runId: string; attemptId: string };
      await reply.send(await getRunAttemptDetail(runtime, params.runId, params.attemptId));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.get("/api/runs/:runId/attempts/:attemptId/diff", async (request, reply) => {
    try {
      const params = request.params as { runId: string; attemptId: string };
      const query = request.query as { kind?: string };
      await reply.send(await getRunDiff(runtime, params.runId, params.attemptId, query.kind === "drift" ? "drift" : "primary"));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.get("/api/runs/:runId/attempts/:attemptId/bundle-text", async (request, reply) => {
    try {
      const params = request.params as { runId: string; attemptId: string };
      await reply.send(await getBundleText(runtime, params.runId, params.attemptId));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.get("/api/runs/:id/state", async (request, reply) => {
    try {
      await reply.send(await getRunState(runtime, (request.params as { id: string }).id));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.get("/api/runs/:id/progress", async (request, reply) => {
    try {
      await reply.send(await getRunProgress(runtime, (request.params as { id: string }).id));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });
};
