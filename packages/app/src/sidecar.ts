#!/usr/bin/env node
import process from "node:process";
import readline from "node:readline";
import { createSpecFlowRuntime } from "./runtime/create-runtime.js";
import type { SidecarFailure, SidecarRequest } from "./runtime/sidecar-contract.js";
import { dispatchSidecarRequest, isMutatingSidecarMethod } from "./sidecar/dispatcher.js";

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

    const runDispatch = async (): Promise<void> => {
      await dispatchSidecarRequest(runtime, request, writeMessage);
    };

    const task = isMutatingSidecarMethod(request.method)
      ? (mutationQueue = mutationQueue.then(runDispatch, runDispatch))
      : runDispatch();

    pending.add(task);
    void task.finally(() => {
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
