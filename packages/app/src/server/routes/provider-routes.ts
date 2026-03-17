import type { FastifyInstance } from "fastify";
import { getProviderModels, saveConfig, saveProviderKey } from "../../runtime/handlers/provider-handlers.js";
import { isHandlerError } from "../../runtime/errors.js";
import { sendHandlerError } from "../../runtime/handlers/shared.js";
import type { SpecFlowRuntime } from "../../runtime/types.js";

export interface RegisterProviderRoutesOptions {
  runtime: SpecFlowRuntime;
}

export const registerProviderRoutes = (app: FastifyInstance, options: RegisterProviderRoutesOptions): void => {
  const { runtime } = options;

  app.put("/api/config", async (request, reply) => {
    try {
      await reply.send(await saveConfig(runtime, (request.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.put("/api/config/provider-key", async (request, reply) => {
    try {
      await reply.send(await saveProviderKey(runtime, (request.body ?? {}) as Record<string, unknown>));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.get("/api/providers/:provider/models", async (request, reply) => {
    try {
      const params = request.params as { provider: string };
      const query = (request.query ?? {}) as Partial<{ q: string }>;
      await reply.send(await getProviderModels(runtime, params.provider, query.q));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });
};
