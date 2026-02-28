import type { FastifyInstance } from "fastify";
import { PROTOCOL_VERSION, SERVER_VERSION, runtimeCapabilities } from "../runtime-status.js";
import type { ArtifactStore } from "../../store/artifact-store.js";

export interface RegisterRuntimeRoutesOptions {
  store: ArtifactStore;
}

export const registerRuntimeRoutes = (app: FastifyInstance, options: RegisterRuntimeRoutesOptions): void => {
  const { store } = options;

  app.get("/api/runtime/status", async (_request, reply) => {
    await reply.send({
      serverVersion: SERVER_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: runtimeCapabilities
    });
  });

  app.get("/api/artifacts", async (_request, reply) => {
    await reply.send({
      config: store.config,
      initiatives: Array.from(store.initiatives.values()),
      tickets: Array.from(store.tickets.values()),
      runs: Array.from(store.runs.values()),
      runAttempts: Array.from(store.runAttempts.entries()).map(([id, value]) => ({ id, ...value })),
      specs: Array.from(store.specs.values())
    });
  });
};
