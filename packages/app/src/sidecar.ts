#!/usr/bin/env node
import process from "node:process";
import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { RequestCancelledError } from "./cancellation.js";
import { createSpecFlowRuntime } from "./runtime/create-runtime.js";
import type { SidecarFailure, SidecarRequest } from "./runtime/sidecar-contract.js";
import type { SpecFlowRuntime } from "./runtime/types.js";
import { dispatchSidecarRequest, isMutatingSidecarMethod } from "./sidecar/dispatcher.js";
import { isLongRunningSidecarMethod } from "./sidecar/method-catalog.js";

export const DEFAULT_REQUEST_TTL_MS = 5 * 60_000;
export const LONG_REQUEST_TTL_MS = 10 * 60_000;

// Planner generation/review and verification flows can chain multiple internal jobs.
// Their aggregate budget can exceed the default request window even when each child job
// stays within its own timeout, so they need a longer sidecar allowance.
export const usesLongRequestTimeout = (method: string): boolean =>
  isLongRunningSidecarMethod(method);

export const getRequestTtlMs = (method: string): number =>
  usesLongRequestTimeout(method) ? LONG_REQUEST_TTL_MS : DEFAULT_REQUEST_TTL_MS;

const writeMessage = (message: unknown): void => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

export const parseSidecarRequest = (line: string): SidecarRequest => {
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

export const createInvalidRequestFailure = (id: string, message: string): SidecarFailure => ({
  id,
  ok: false,
  error: {
    code: "Bad Request",
    message,
    statusCode: 400
  }
});

export interface SidecarLoopState {
  mutationQueue: Promise<void>;
  pending: Set<Promise<void>>;
  inflight: Map<string, AbortController>;
}

export const createSidecarLoopState = (): SidecarLoopState => ({
  mutationQueue: Promise.resolve(),
  pending: new Set<Promise<void>>(),
  inflight: new Map<string, AbortController>()
});

export const handleSidecarLine = (
  line: string,
  runtime: SpecFlowRuntime,
  state: SidecarLoopState,
  write: (message: unknown) => void
): void => {
  if (!line.trim()) {
    return;
  }

  let request: SidecarRequest;
  try {
    request = parseSidecarRequest(line);
  } catch (error) {
    write(createInvalidRequestFailure("unknown", (error as Error).message));
    return;
  }

  if (request.method === "runtime.cancel") {
    const requestId = typeof request.params === "object" && request.params !== null
      ? String((request.params as { requestId?: string }).requestId ?? "")
      : "";
    const controller = state.inflight.get(requestId);
    if (controller) {
      controller.abort(new RequestCancelledError());
    }

    write({
      id: request.id,
      ok: true,
      result: { cancelled: Boolean(controller) }
    });
    return;
  }

  const controller = new AbortController();
  state.inflight.set(request.id, controller);
  const requestTimeout = setTimeout(() => {
    controller.abort(new RequestCancelledError("Request timed out"));
  }, getRequestTtlMs(request.method));

  const runDispatch = async (): Promise<void> => {
    await dispatchSidecarRequest(runtime, request, write, controller.signal);
  };

  const task = isMutatingSidecarMethod(request.method)
    ? (state.mutationQueue = state.mutationQueue.then(runDispatch, runDispatch))
    : runDispatch();

  state.pending.add(task);
  void task.finally(() => {
    clearTimeout(requestTimeout);
    state.inflight.delete(request.id);
    state.pending.delete(task);
  });
};

const main = async (): Promise<void> => {
  const runtime = await createSpecFlowRuntime({ rootDir: process.env.SPECFLOW_ROOT_DIR ?? process.cwd() });
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });
  const state = createSidecarLoopState();

  const shutdown = async (signal: string): Promise<void> => {
    rl.close();
    await Promise.allSettled(Array.from(state.pending));
    await runtime.close();
    if (signal) {
      process.stderr.write(`Sidecar shutting down on ${signal}\n`);
    }
    process.exit(0);
  };

  process.once("SIGINT", () => { void shutdown("SIGINT"); });
  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });

  rl.on("line", (line) => {
    handleSidecarLine(line, runtime, state, writeMessage);
  });

  rl.on("close", () => {
    void shutdown("");
  });
};

const isDirectExecution = (): boolean => {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && pathToFileURL(entryPoint).href === import.meta.url;
};

if (isDirectExecution()) {
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
}
