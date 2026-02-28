#!/usr/bin/env node
import process from "node:process";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { BundleGenerator } from "./bundle/bundle-generator.js";
import { configPath } from "./io/paths.js";
import { readYamlFile } from "./io/yaml.js";
import { createSpecFlowServer } from "./server/create-server.js";
import { openBrowser } from "./server/open-browser.js";
import { PROTOCOL_VERSION } from "./server/runtime-status.js";
import { ArtifactStore } from "./store/artifact-store.js";
import type { Config } from "./types/entities.js";
import { VerifierService } from "./verify/verifier-service.js";

type OutputFormat = "text" | "json";
type AgentTarget = "claude-code" | "codex-cli" | "opencode" | "generic";

interface RuntimeStatusPayload {
  protocolVersion?: string;
  capabilities?: Record<string, boolean>;
}

const parseInteger = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected integer but received '${value}'`);
  }

  return parsed;
};

const parseOutputFormat = (value: string): OutputFormat => {
  if (value === "json" || value === "text") {
    return value;
  }

  throw new Error(`Unsupported format '${value}'. Use 'text' or 'json'.`);
};

const parseAgent = (value: string): AgentTarget => {
  if (value === "claude-code" || value === "codex-cli" || value === "opencode" || value === "generic") {
    return value;
  }

  throw new Error(`Unsupported agent '${value}'`);
};

const printOutput = (format: OutputFormat, payload: unknown, textRenderer: () => string): void => {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${textRenderer()}\n`);
};

const withTimeout = async <T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>
): Promise<{ timedOut: false; value: T } | { timedOut: true }> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const value = await run(controller.signal);
    return { timedOut: false, value };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { timedOut: true };
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const normalizeServerBaseUrl = (serverUrl: string): string => serverUrl.replace(/\/$/, "");

const loadCliConfig = async (rootDir: string): Promise<{ host: string; port: number }> => {
  const config = await readYamlFile<Config>(configPath(rootDir));

  return {
    host: config?.host ?? "127.0.0.1",
    port: config?.port ?? 3141
  };
};

const probeRuntimeStatus = async (
  baseUrl: string,
  timeoutMs: number
): Promise<{ reachable: boolean; payload: RuntimeStatusPayload | null }> => {
  const result = await withTimeout(timeoutMs, async (signal) => {
    const response = await fetch(`${baseUrl}/api/runtime/status`, { signal });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as RuntimeStatusPayload;
  }).catch(() => ({ timedOut: true } as const));

  if (result.timedOut) {
    return { reachable: false, payload: null };
  }

  return {
    reachable: true,
    payload: result.value
  };
};

const assertDelegationCompatible = (
  payload: RuntimeStatusPayload | null,
  requiredCapability: "exportBundle" | "verifyCapture"
): void => {
  if (!payload) {
    throw new Error("Server runtime status probe returned an invalid response");
  }

  if (payload.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(
      `Server protocol mismatch (server=${payload.protocolVersion ?? "unknown"}, cli=${PROTOCOL_VERSION}); refusing local fallback`
    );
  }

  if (!payload.capabilities?.[requiredCapability]) {
    throw new Error(`Server capability '${requiredCapability}' is unavailable; refusing local fallback`);
  }
};

const probeOperationStatus = async (
  baseUrl: string,
  operationId: string,
  timeoutMs: number
): Promise<{ state: string } | null> => {
  const result = await withTimeout(timeoutMs, async (signal) => {
    const response = await fetch(`${baseUrl}/api/operations/${operationId}`, { signal });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as { state?: string } | null;
  });

  if (result.timedOut || !result.value?.state) {
    return null;
  }

  return {
    state: result.value.state
  };
};

const runUiCommand = async (options: { host: string; port: number; noOpen: boolean }): Promise<void> => {
  const server = await createSpecFlowServer({
    rootDir: process.cwd(),
    host: options.host,
    port: options.port
  });

  const url = await server.start();
  process.stdout.write(`SpecFlow UI running at ${url}\n`);

  if (!options.noOpen) {
    try {
      await openBrowser(url);
    } catch (error) {
      process.stderr.write(`Failed to open browser automatically: ${(error as Error).message}\n`);
    }
  }

  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`Received ${signal}, shutting down...\n`);
    await server.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
};

const runExportBundleCommand = async (options: {
  ticket: string;
  agent: AgentTarget;
  format: OutputFormat;
  serverUrl?: string;
  timeoutMs: number;
  operationId?: string;
}): Promise<void> => {
  const rootDir = process.cwd();
  const config = await loadCliConfig(rootDir);
  const baseUrl = normalizeServerBaseUrl(options.serverUrl ?? `http://${config.host}:${config.port}`);
  const operationId = options.operationId ?? `op-${randomUUID()}`;

  const runtime = await probeRuntimeStatus(baseUrl, options.timeoutMs);

  if (runtime.reachable) {
    assertDelegationCompatible(runtime.payload, "exportBundle");

    const delegated = await withTimeout(options.timeoutMs, async (signal) => {
      const response = await fetch(`${baseUrl}/api/tickets/${options.ticket}/export-bundle`, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          agent: options.agent,
          operationId
        })
      });

      if (!response.ok) {
        throw new Error(`Server export failed with status ${response.status}`);
      }

      return (await response.json()) as {
        runId: string;
        attemptId: string;
        bundlePath: string;
        flatString: string;
      };
    });

    if (delegated.timedOut) {
      const status = await probeOperationStatus(baseUrl, operationId, options.timeoutMs);
      if (!status || status.state === "prepared") {
        throw new Error(`Delegated export timed out for operation ${operationId}; operation still in progress`);
      }

      const retry = await fetch(`${baseUrl}/api/tickets/${options.ticket}/export-bundle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          agent: options.agent,
          operationId
        })
      });

      if (!retry.ok) {
        throw new Error(`Delegated export retry failed with status ${retry.status}`);
      }

      const payload = (await retry.json()) as {
        runId: string;
        attemptId: string;
        bundlePath: string;
        flatString: string;
      };

      printOutput(options.format, payload, () => {
        return [`Delegated export complete`, `bundlePath: ${payload.bundlePath}`, "", payload.flatString].join("\n");
      });

      return;
    }

    const payload = delegated.value;
    printOutput(options.format, payload, () => {
      return [`Delegated export complete`, `bundlePath: ${payload.bundlePath}`, "", payload.flatString].join("\n");
    });

    return;
  }

  const store = new ArtifactStore({ rootDir });
  await store.initialize();

  try {
    const generator = new BundleGenerator({ rootDir, store });
    const local = await generator.exportBundle({
      ticketId: options.ticket,
      agentTarget: options.agent,
      exportMode: "standard",
      operationId
    });

    printOutput(options.format, local, () => {
      return [`Local export complete`, `bundlePath: ${local.bundlePath}`, "", local.flatString].join("\n");
    });
  } finally {
    await store.close();
  }
};

const runVerifyCommand = async (options: {
  ticket: string;
  summary?: string;
  widen?: string[];
  format: OutputFormat;
  serverUrl?: string;
  timeoutMs: number;
  operationId?: string;
}): Promise<void> => {
  const rootDir = process.cwd();
  const config = await loadCliConfig(rootDir);
  const baseUrl = normalizeServerBaseUrl(options.serverUrl ?? `http://${config.host}:${config.port}`);
  const operationId = options.operationId ?? `op-${randomUUID()}`;
  const widened = options.widen ?? [];

  const runtime = await probeRuntimeStatus(baseUrl, options.timeoutMs);

  if (runtime.reachable) {
    assertDelegationCompatible(runtime.payload, "verifyCapture");

    const delegated = await withTimeout(options.timeoutMs, async (signal) => {
      const response = await fetch(`${baseUrl}/api/tickets/${options.ticket}/capture-results`, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          agentSummary: options.summary,
          widenedScopePaths: widened,
          operationId
        })
      });

      if (!response.ok) {
        throw new Error(`Server verify failed with status ${response.status}`);
      }

      return (await response.json()) as {
        overallPass: boolean;
        criteriaResults: Array<{ criterionId: string; pass: boolean; evidence: string }>;
        driftFlags: Array<{ type: string; file: string; description: string }>;
      };
    });

    if (delegated.timedOut) {
      const status = await probeOperationStatus(baseUrl, operationId, options.timeoutMs);
      if (!status || status.state === "prepared") {
        throw new Error(`Delegated verify timed out for operation ${operationId}; operation still in progress`);
      }

      const retry = await fetch(`${baseUrl}/api/tickets/${options.ticket}/capture-results`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          agentSummary: options.summary,
          widenedScopePaths: widened,
          operationId
        })
      });

      if (!retry.ok) {
        throw new Error(`Delegated verify retry failed with status ${retry.status}`);
      }

      const payload = (await retry.json()) as {
        overallPass: boolean;
        criteriaResults: Array<{ criterionId: string; pass: boolean; evidence: string }>;
        driftFlags: Array<{ type: string; file: string; description: string }>;
      };

      printOutput(options.format, payload, () => {
        const criteria = payload.criteriaResults
          .map((criterion) => `- ${criterion.criterionId}: ${criterion.pass ? "pass" : "fail"} (${criterion.evidence})`)
          .join("\n");
        return [`Delegated verify complete`, `overallPass: ${payload.overallPass}`, criteria].join("\n");
      });

      return;
    }

    const payload = delegated.value;
    printOutput(options.format, payload, () => {
      const criteria = payload.criteriaResults
        .map((criterion) => `- ${criterion.criterionId}: ${criterion.pass ? "pass" : "fail"} (${criterion.evidence})`)
        .join("\n");
      return [`Delegated verify complete`, `overallPass: ${payload.overallPass}`, criteria].join("\n");
    });

    return;
  }

  const store = new ArtifactStore({ rootDir });
  await store.initialize();

  try {
    const verifier = new VerifierService({ rootDir, store });
    const local = await verifier.captureAndVerify({
      ticketId: options.ticket,
      agentSummary: options.summary,
      widenedScopePaths: widened,
      operationId
    });

    printOutput(options.format, local, () => {
      const criteria = local.attempt.criteriaResults
        .map((criterion) => `- ${criterion.criterionId}: ${criterion.pass ? "pass" : "fail"} (${criterion.evidence})`)
        .join("\n");
      return [`Local verify complete`, `overallPass: ${local.overallPass}`, criteria].join("\n");
    });
  } finally {
    await store.close();
  }
};

const main = async (): Promise<void> => {
  const program = new Command();

  program.name("specflow").description("SpecFlow CLI").version("0.1.0");

  program
    .command("ui")
    .description("Start the local SpecFlow server and board UI")
    .option("--host <host>", "Host binding", "127.0.0.1")
    .option("--port <port>", "Port binding", parseInteger, 3141)
    .option("--no-open", "Do not open browser", false)
    .action((options) => {
      void runUiCommand(options as { host: string; port: number; noOpen: boolean });
    });

  program
    .command("export-bundle")
    .description("Export a ticket bundle for an agent")
    .requiredOption("--ticket <ticket>", "Ticket ID")
    .option("--agent <agent>", "Target agent", parseAgent, "codex-cli")
    .option("--format <format>", "Output format (text|json)", parseOutputFormat, "text")
    .option("--server-url <serverUrl>", "Explicit server URL override")
    .option("--timeout-ms <timeoutMs>", "Delegated request timeout in milliseconds", parseInteger, 10_000)
    .option("--operation-id <operationId>", "Idempotency key override")
    .action(async (options) => {
      await runExportBundleCommand(options as {
        ticket: string;
        agent: AgentTarget;
        format: OutputFormat;
        serverUrl?: string;
        timeoutMs: number;
        operationId?: string;
      });
    });

  program
    .command("verify")
    .description("Capture and verify ticket results")
    .requiredOption("--ticket <ticket>", "Ticket ID")
    .option("--summary <summary>", "Agent summary text")
    .option("--widen <path...>", "Additional widened scope paths")
    .option("--format <format>", "Output format (text|json)", parseOutputFormat, "text")
    .option("--server-url <serverUrl>", "Explicit server URL override")
    .option("--timeout-ms <timeoutMs>", "Delegated request timeout in milliseconds", parseInteger, 10_000)
    .option("--operation-id <operationId>", "Idempotency key override")
    .action(async (options) => {
      await runVerifyCommand(options as {
        ticket: string;
        summary?: string;
        widen?: string[];
        format: OutputFormat;
        serverUrl?: string;
        timeoutMs: number;
        operationId?: string;
      });
    });

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
};

void main();
