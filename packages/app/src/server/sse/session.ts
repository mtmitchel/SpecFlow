import type { FastifyReply, FastifyRequest } from "fastify";
import { sanitizeSseEventName } from "../validation.js";

const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_BUFFERED_BYTES = 256 * 1024;

interface QueuedFrame {
  event: string;
  payload: unknown;
  frame: string;
  size: number;
  coalescible: boolean;
}

export interface SseSession {
  send: (event: string, payload: unknown) => void;
  close: () => void;
}

export const startSseSession = (request: FastifyRequest, reply: FastifyReply, eventName: string): SseSession => {
  reply.hijack();
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("Connection", "keep-alive");

  let closed = false;
  let bufferedBytes = 0;
  let waitingForDrain = false;
  const queue: QueuedFrame[] = [];

  const buildFrame = (event: string, payload: unknown): QueuedFrame => {
    const safeEvent = sanitizeSseEventName(event);
    const frame = `event: ${safeEvent}\ndata: ${JSON.stringify(payload)}\n\n`;
    return {
      event: safeEvent,
      payload,
      frame,
      size: Buffer.byteLength(frame),
      coalescible:
        safeEvent.endsWith("-token") &&
        typeof payload === "object" &&
        payload !== null &&
        "chunk" in payload &&
        typeof (payload as { chunk?: unknown }).chunk === "string"
    };
  };

  const cleanup = (): void => {
    if (closed) {
      return;
    }

    closed = true;
    waitingForDrain = false;
    bufferedBytes = 0;
    queue.length = 0;
    clearInterval(heartbeat);
    reply.raw.off("drain", handleDrain);
    request.raw.off("close", handleRequestClose);
  };

  const close = (): void => {
    cleanup();
    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }
  };

  const overflow = (): void => {
    if (closed || reply.raw.writableEnded) {
      close();
      return;
    }

    const frame = buildFrame("stream-error", {
      message: "SSE client is too slow; stream closed"
    });
    reply.raw.write(frame.frame);
    close();
  };

  const flushQueue = (): void => {
    if (closed || waitingForDrain || reply.raw.writableEnded) {
      return;
    }

    while (queue.length > 0) {
      const next = queue[0];
      bufferedBytes -= next.size;
      queue.shift();

      if (!reply.raw.write(next.frame)) {
        waitingForDrain = true;
        reply.raw.once("drain", handleDrain);
        return;
      }
    }
  };

  const enqueue = (event: string, payload: unknown): void => {
    if (closed || reply.raw.writableEnded) {
      return;
    }

    const nextFrame = buildFrame(event, payload);
    if (waitingForDrain && nextFrame.coalescible && queue.length > 0) {
      const previous = queue[queue.length - 1];
      if (previous.coalescible && previous.event === nextFrame.event) {
        const mergedPayload = {
          ...(previous.payload as Record<string, unknown>),
          chunk: `${String((previous.payload as { chunk: string }).chunk)}${String((nextFrame.payload as { chunk: string }).chunk)}`
        };
        bufferedBytes -= previous.size;
        queue[queue.length - 1] = buildFrame(previous.event, mergedPayload);
        bufferedBytes += queue[queue.length - 1].size;
        if (bufferedBytes > MAX_BUFFERED_BYTES) {
          overflow();
        }
        return;
      }
    }

    if (bufferedBytes + nextFrame.size > MAX_BUFFERED_BYTES) {
      overflow();
      return;
    }

    queue.push(nextFrame);
    bufferedBytes += nextFrame.size;
    flushQueue();
  };

  const handleDrain = (): void => {
    waitingForDrain = false;
    flushQueue();
  };

  const handleRequestClose = (): void => {
    cleanup();
  };

  const send = (event: string, payload: unknown): void => {
    enqueue(event, payload);
  };

  send(eventName, { status: "connected" });

  const heartbeat = setInterval(() => {
    if (!closed && !waitingForDrain && bufferedBytes === 0 && !reply.raw.writableEnded) {
      reply.raw.write(":keepalive\n\n");
    }
  }, HEARTBEAT_INTERVAL_MS);

  request.raw.on("close", handleRequestClose);

  return { send, close };
};
