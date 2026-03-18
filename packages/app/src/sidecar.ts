#!/usr/bin/env node
import process from "node:process";
import readline from "node:readline";
import { RequestCancelledError } from "./cancellation.js";
import { createSpecFlowRuntime } from "./runtime/create-runtime.js";
import type { SidecarFailure, SidecarRequest } from "./runtime/sidecar-contract.js";
import { dispatchSidecarRequest, isMutatingSidecarMethod } from "./sidecar/dispatcher.js";

const DEFAULT_REQUEST_TTL_MS = 5 * 60_000;
const LONG_REQUEST_TTL_MS = 10 * 60_000;

// Planner generation/review and verification flows can chain multiple internal jobs.
// Their aggregate budget can exceed the default request window even when each child job
// stays within its own timeout, so they need a longer sidecar allowance.
const usesLongRequestTimeout = (method: string): boolean =>
  method === "audit.run" ||
  method === "import.githubIssue" ||
  method === "initiatives.phaseCheck" ||
  method === "initiatives.refinement.help" ||
  method === "initiatives.generate.brief" ||
  method === "initiatives.generate.coreFlows" ||
  method === "initiatives.generate.prd" ||
  method === "initiatives.generate.techSpec" ||
  method === "initiatives.review.run" ||
  method === "initiatives.generatePlan" ||
  method === "tickets.create" ||
  method === "tickets.exportBundle" ||
  method === "tickets.exportFixBundle" ||
  method === "tickets.captureResults";

const getRequestTtlMs = (method: string): number =>
  usesLongRequestTimeout(method) ? LONG_REQUEST_TTL_MS : DEFAULT_REQUEST_TTL_MS;

const writeMessage = (message: unknown): void => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

const parseRequest = (line: string): SidecarRequest => {
  const parsed = JSON.parse(line) as Partial<SidecarRequest>;
  if (!parsed || typeof parsed.id !== "string" || typeof parsed.method !== "string") {
    throw new Error("Sidecar requests require string id and method");
  }

  return {
    id: parsed.id,
    method: parsed.method,
    params: parsed.params
  };
};

const invalidRequestFailure = (id: string, message: string): SidecarFailure => ({
  id,
  ok: false,
  error: {
    code: "Bad Request",
    message,
    statusCode: 400
  }
});

const main = async (): Promise<void> => {
  const runtime = await createSpecFlowRuntime({ rootDir: process.env.SPECFLOW_ROOT_DIR ?? process.cwd() });
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  let mutationQueue = Promise.resolve();
  const pending = new Set<Promise<void>>();
  const inflight = new Map<string, AbortController>();

  const shutdown = async (signal: string): Promise<void> => {
    rl.close();
    await Promise.allSettled(Array.from(pending));
    await runtime.close();
    if (signal) {
      process.stderr.write(`Sidecar shutting down on ${signal}\n`);
    }
    process.exit(0);
  };

  process.once("SIGINT", () => { void shutdown("SIGINT"); });
  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });

  rl.on("line", (line) => {
    if (!line.trim()) {
      return;
    }

    let request: SidecarRequest;
    try {
      request = parseRequest(line);
    } catch (error) {
      writeMessage(invalidRequestFailure("unknown", (error as Error).message));
      return;
    }

    if (request.method === "runtime.cancel") {
      const requestId = typeof request.params === "object" && request.params !== null
        ? String((request.params as { requestId?: string }).requestId ?? "")
        : "";
      const controller = inflight.get(requestId);
      if (controller) {
        controller.abort(new RequestCancelledError());
      }

      writeMessage({
        id: request.id,
        ok: true,
        result: { cancelled: Boolean(controller) }
      });
      return;
    }

    const controller = new AbortController();
    inflight.set(request.id, controller);
    const requestTimeout = setTimeout(() => {
      controller.abort(new RequestCancelledError("Request timed out"));
    }, getRequestTtlMs(request.method));

    const runDispatch = async (): Promise<void> => {
      await dispatchSidecarRequest(runtime, request, writeMessage, controller.signal);
    };

    const task = isMutatingSidecarMethod(request.method)
      ? (mutationQueue = mutationQueue.then(runDispatch, runDispatch))
      : runDispatch();

    pending.add(task);
    void task.finally(() => {
      clearTimeout(requestTimeout);
      inflight.delete(request.id);
      pending.delete(task);
    });
  });

  rl.on("close", () => {
    void shutdown("");
  });
};

void main().catch((error) => {
  writeMessage({
    id: "startup",
    ok: false,
    error: {
      code: "Startup Failed",
      message: (error as Error).message,
      statusCode: 500
    }
  });
  process.exit(1);
});
