import type { FastifyInstance } from "fastify";
import { getArtifactsSnapshot, getRuntimeStatus } from "../../runtime/handlers/runtime-handlers.js";
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
};
