import type { FastifyInstance } from "fastify";
import { getOperationStatus } from "../../runtime/handlers/operation-handlers.js";
import { isHandlerError } from "../../runtime/errors.js";
import { sendHandlerError } from "../../runtime/handlers/shared.js";
import type { SpecFlowRuntime } from "../../runtime/types.js";

export interface RegisterOperationRoutesOptions {
  runtime: SpecFlowRuntime;
}

export const registerOperationRoutes = (app: FastifyInstance, options: RegisterOperationRoutesOptions): void => {
  const { runtime } = options;

  app.get("/api/operations/:id", async (request, reply) => {
    try {
      const operationId = (request.params as { id: string }).id;
      await reply.send(await getOperationStatus(runtime, operationId));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });
};
