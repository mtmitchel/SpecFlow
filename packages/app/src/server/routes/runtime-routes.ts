import type { FastifyInstance } from "fastify";
import { getArtifactsSnapshot, getRuntimeStatus, getSpecDetail } from "../../runtime/handlers/runtime-handlers.js";
import { isHandlerError } from "../../runtime/errors.js";
import { sendHandlerError } from "../../runtime/handlers/shared.js";
import type { SpecFlowRuntime } from "../../runtime/types.js";

export interface RegisterRuntimeRoutesOptions {
  runtime: SpecFlowRuntime;
}

export const registerRuntimeRoutes = (app: FastifyInstance, options: RegisterRuntimeRoutesOptions): void => {
  const { runtime } = options;

  app.get("/api/runtime/status", async (_request, reply) => {
    await reply.send(getRuntimeStatus());
  });

  app.get("/api/artifacts", async (_request, reply) => {
    await reply.send(getArtifactsSnapshot(runtime));
  });

  app.get("/api/specs/:id", async (request, reply) => {
    try {
      await reply.send(await getSpecDetail(runtime, (request.params as { id: string }).id));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });
};
