import type { FastifyInstance } from "fastify";
import { importGithubIssue } from "../../runtime/handlers/import-handlers.js";
import { isHandlerError } from "../../runtime/errors.js";
import { sendHandlerError } from "../../runtime/handlers/shared.js";
import type { SpecFlowRuntime } from "../../runtime/types.js";

export interface RegisterImportRoutesOptions {
  runtime: SpecFlowRuntime;
}

export const registerImportRoutes = (
  app: FastifyInstance,
  options: RegisterImportRoutesOptions
): void => {
  const { runtime } = options;

  app.post("/api/import/github-issue", async (request, reply) => {
    try {
      const result = await importGithubIssue(
        runtime,
        (request.body ?? {}) as {
          url?: string;
          owner?: string;
          repo?: string;
          number?: number;
        }
      );
      await reply.code(201).send(result);
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });
};
