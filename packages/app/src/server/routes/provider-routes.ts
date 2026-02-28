import type { FastifyInstance } from "fastify";
import { resolveProviderApiKey } from "../../config/env.js";
import type { ArtifactStore } from "../../store/artifact-store.js";
import type { Config } from "../../types/entities.js";

const redactConfig = (config: Config): Omit<Config, "apiKey"> & { hasApiKey: boolean } => {
  const { apiKey, ...rest } = config;
  return { ...rest, hasApiKey: Boolean(apiKey) };
};

export interface RegisterProviderRoutesOptions {
  store: ArtifactStore;
  fetchImpl: typeof fetch;
}

export const registerProviderRoutes = (app: FastifyInstance, options: RegisterProviderRoutesOptions): void => {
  const { store, fetchImpl } = options;

  app.put("/api/config", async (request, reply) => {
    const body = (request.body ?? {}) as Partial<{
      provider: "anthropic" | "openai" | "openrouter";
      model: string;
      apiKey: string;
      port: number;
      host: string;
      repoInstructionFile: string;
    }>;

    const existing = store.config ?? {
      provider: "openrouter" as const,
      model: "openrouter/auto",
      apiKey: "",
      port: 3141,
      host: "127.0.0.1",
      repoInstructionFile: "specflow/AGENTS.md"
    };

    const nextConfig = {
      ...existing,
      ...body
    };

    await store.upsertConfig(nextConfig);
    await reply.send({ config: redactConfig(nextConfig) });
  });

  app.get("/api/providers/:provider/models", async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (provider !== "openrouter") {
      await reply.code(400).send({
        error: "Bad Request",
        message: `Provider '${provider}' is not supported for model discovery`
      });
      return;
    }

    const query = (request.query ?? {}) as Partial<{ q: string }>;
    const searchTerm = (query.q ?? "").trim().toLowerCase();
    const apiKey = resolveProviderApiKey("openrouter", store.config?.apiKey);
    try {
      const response = await fetchImpl("https://openrouter.ai/api/v1/models", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        }
      });

      if (!response.ok) {
        const body = await response.text();
        await reply.code(502).send({
          error: "Provider Error",
          message: `OpenRouter model discovery failed (${response.status})`,
          details: body.slice(0, 200)
        });
        return;
      }

      const payload = (await response.json()) as {
        data?: Array<{
          id?: string;
          name?: string;
          context_length?: number;
        }>;
      };

      const models = (payload.data ?? [])
        .filter(
          (model): model is { id: string; name?: string; context_length?: number } => typeof model.id === "string"
        )
        .map((model) => ({
          id: model.id,
          name: model.name ?? model.id,
          contextLength: typeof model.context_length === "number" ? model.context_length : null
        }))
        .filter((model) => {
          if (!searchTerm) {
            return true;
          }

          return model.id.toLowerCase().includes(searchTerm) || model.name.toLowerCase().includes(searchTerm);
        })
        .sort((left, right) => left.id.localeCompare(right.id));

      await reply.send({
        provider: "openrouter",
        count: models.length,
        models
      });
    } catch (error) {
      await reply.code(502).send({
        error: "Provider Error",
        message: "Failed to reach OpenRouter model registry",
        details: (error as Error).message
      });
    }
  });
};
