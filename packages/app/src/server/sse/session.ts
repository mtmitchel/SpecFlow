import type { FastifyReply, FastifyRequest } from "fastify";
import { sanitizeSseEventName } from "../validation.js";

export interface SseSession {
  send: (event: string, payload: unknown) => void;
  close: () => void;
}

export const startSseSession = (request: FastifyRequest, reply: FastifyReply, eventName: string): SseSession => {
  reply.hijack();
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("Connection", "keep-alive");

  const send = (event: string, payload: unknown): void => {
    if (reply.raw.writableEnded) {
      return;
    }

    const safeEvent = sanitizeSseEventName(event);
    reply.raw.write(`event: ${safeEvent}\n`);
    reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send(eventName, { status: "connected" });

  const heartbeat = setInterval(() => {
    if (!reply.raw.writableEnded) {
      reply.raw.write(":keepalive\n\n");
    }
  }, 15_000);

  const close = (): void => {
    clearInterval(heartbeat);
    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }
  };

  request.raw.on("close", () => {
    clearInterval(heartbeat);
  });

  return { send, close };
};
