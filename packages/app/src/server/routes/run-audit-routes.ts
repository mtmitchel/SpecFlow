import type { FastifyInstance } from "fastify";
import {
  createTicketFromAuditFinding,
  dismissAuditFinding,
  runAudit
} from "../../runtime/handlers/run-audit-handlers.js";
import { isHandlerError } from "../../runtime/errors.js";
import { sendHandlerError } from "../../runtime/handlers/shared.js";
import type { SpecFlowRuntime } from "../../runtime/types.js";

export interface RegisterRunAuditRoutesOptions {
  runtime: SpecFlowRuntime;
}

export const registerRunAuditRoutes = (app: FastifyInstance, options: RegisterRunAuditRoutesOptions): void => {
  const { runtime } = options;

  app.post("/api/runs/:id/audit", async (request, reply) => {
    try {
      await reply.send(
        await runAudit(
          runtime,
          (request.params as { id: string }).id,
          (request.body ?? {}) as Record<string, unknown>
        )
      );
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.post("/api/runs/:id/findings/:findingId/create-ticket", async (request, reply) => {
    try {
      const params = request.params as { id: string; findingId: string };
      await reply.code(201).send(await createTicketFromAuditFinding(runtime, params.id, params.findingId));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.post("/api/runs/:id/findings/:findingId/dismiss", async (request, reply) => {
    try {
      const params = request.params as { id: string; findingId: string };
      const body = (request.body ?? {}) as { note?: string };
      await reply.send(await dismissAuditFinding(runtime, params.id, params.findingId, body.note));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });
};
