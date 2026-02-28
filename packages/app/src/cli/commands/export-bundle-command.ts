import process from "node:process";
import { randomUUID } from "node:crypto";
import { BundleGenerator } from "../../bundle/bundle-generator.js";
import { ArtifactStore } from "../../store/artifact-store.js";
import { printOutput } from "../output.js";
import {
  assertDelegationCompatible,
  loadCliConfig,
  normalizeServerBaseUrl,
  probeOperationStatus,
  probeRuntimeStatus
} from "../probe.js";
import { withTimeout } from "../timeout.js";
import type { AgentTarget, OutputFormat } from "../types.js";

export const runExportBundleCommand = async (options: {
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
