import type { FastifyInstance } from "fastify";
import {
  capturePreview,
  captureResults,
  exportBundle,
  exportFixBundle,
  listTickets,
  overrideDone,
  triageQuickTask,
  updateTicket
} from "../../runtime/handlers/ticket-handlers.js";
import { isHandlerError } from "../../runtime/errors.js";
import { sendHandlerError } from "../../runtime/handlers/shared.js";
import type { NotificationSink, SpecFlowRuntime } from "../../runtime/types.js";
import { startSseSession, type SseSession } from "../sse/session.js";
import { isValidEntityId } from "../validation.js";

export interface RegisterTicketRoutesOptions {
  runtime: SpecFlowRuntime;
  broadcastVerificationEvent: (ticketId: string, event: string, payload: unknown) => void;
  verificationSubscribers: Map<string, Set<SseSession>>;
}

const MAX_SSE_SUBSCRIBERS = 10;

export const registerTicketRoutes = (app: FastifyInstance, options: RegisterTicketRoutesOptions): void => {
  const {
    runtime,
    broadcastVerificationEvent,
    verificationSubscribers
  } = options;

  app.get("/api/tickets", async (_request, reply) => {
    await reply.send(listTickets(runtime));
  });

  app.patch("/api/tickets/:id", async (request, reply) => {
    try {
      await reply.send(
        await updateTicket(
          runtime,
          (request.params as { id: string }).id,
          (request.body ?? {}) as {
            status?: "backlog" | "ready" | "in-progress" | "verify" | "done";
            title?: string;
            description?: string;
          }
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

  app.post("/api/tickets", async (request, reply) => {
    try {
      await reply.code(201).send(await triageQuickTask(runtime, (request.body ?? {}) as { description?: string }));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.post("/api/tickets/:id/export-bundle", async (request, reply) => {
    try {
      await reply.code(201).send(
        await exportBundle(
          runtime,
          (request.params as { id: string }).id,
          (request.body ?? {}) as {
            agent?: "claude-code" | "codex-cli" | "opencode" | "generic";
            exportMode?: "standard" | "quick-fix";
            operationId?: string;
          }
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

  app.post("/api/runs/:id/findings/:findingId/export-fix-bundle", async (request, reply) => {
    try {
      await reply.code(201).send(
        await exportFixBundle(
          runtime,
          (request.params as { id: string }).id,
          (request.params as { findingId: string }).findingId,
          (request.body ?? {}) as {
            agent?: "claude-code" | "codex-cli" | "opencode" | "generic";
            operationId?: string;
          }
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

  app.post("/api/tickets/:id/capture-results", async (request, reply) => {
    const ticketId = (request.params as { id: string }).id;
    const onEvent: NotificationSink = async (event, payload) => {
      broadcastVerificationEvent(ticketId, event, payload);
    };

    try {
      await reply.code(201).send(
        await captureResults(
          runtime,
          ticketId,
          (request.body ?? {}) as {
            agentSummary?: string;
            scopePaths?: string[];
            widenedScopePaths?: string[];
            operationId?: string;
          },
          onEvent
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

  app.post("/api/tickets/:id/capture-preview", async (request, reply) => {
    try {
      await reply.send(
        await capturePreview(
          runtime,
          (request.params as { id: string }).id,
          (request.body ?? {}) as {
            scopePaths?: string[];
            widenedScopePaths?: string[];
            diffSource?: { mode: "auto" | "snapshot" };
          }
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

  app.post("/api/tickets/:id/override-done", async (request, reply) => {
    try {
      await reply.code(201).send(
        await overrideDone(
          runtime,
          (request.params as { id: string }).id,
          (request.body ?? {}) as {
            reason?: string;
            overrideAccepted?: boolean;
            operationId?: string;
          }
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

  app.get("/api/tickets/:id/verify/stream", (request, reply) => {
    const ticketId = (request.params as { id: string }).id;
    if (!isValidEntityId(ticketId)) {
      void reply.code(400).send({ error: "Bad Request", message: "Invalid ticket ID format" });
      return;
    }
    if (!runtime.store.tickets.has(ticketId)) {
      void reply.code(404).send({ error: "Not Found", message: `Ticket ${ticketId} not found` });
      return;
    }

    const existing = verificationSubscribers.get(ticketId);
    if (existing && existing.size >= MAX_SSE_SUBSCRIBERS) {
      void reply.code(429).send({ error: "Too Many Requests", message: "Too many SSE subscribers for this ticket" });
      return;
    }

    const session = startSseSession(request, reply, "verify-ready");
    const subscribers = existing ?? new Set<SseSession>();
    subscribers.add(session);
    verificationSubscribers.set(ticketId, subscribers);

    request.raw.on("close", () => {
      const active = verificationSubscribers.get(ticketId);
      if (!active) {
        return;
      }

      active.delete(session);
      if (active.size === 0) {
        verificationSubscribers.delete(ticketId);
      }
    });
  });
};
