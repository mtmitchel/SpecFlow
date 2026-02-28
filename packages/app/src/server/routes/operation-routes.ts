import type { FastifyInstance } from "fastify";
import type { ArtifactStore } from "../../store/artifact-store.js";

export interface RegisterOperationRoutesOptions {
  store: ArtifactStore;
}

export const registerOperationRoutes = (app: FastifyInstance, options: RegisterOperationRoutesOptions): void => {
  const { store } = options;

  app.get("/api/operations/:id", async (request, reply) => {
    const operationId = (request.params as { id: string }).id;
    const status = await store.getOperationStatus(operationId);

    if (!status) {
      await reply.code(404).send({ error: "Not Found", message: `Operation ${operationId} not found` });
      return;
    }

    await reply.send(status);
  });
};
