import process from "node:process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
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
      };
      const bundleTextResponse = await fetch(
        `${baseUrl}/api/runs/${payload.runId}/attempts/${payload.attemptId}/bundle-text`
      );
      if (!bundleTextResponse.ok) {
        throw new Error(`Delegated bundle text fetch failed with status ${bundleTextResponse.status}`);
      }
      const bundleTextPayload = (await bundleTextResponse.json()) as { content: string };

      printOutput(options.format, payload, () => {
        return [`Delegated export complete`, `bundlePath: ${payload.bundlePath}`, "", bundleTextPayload.content].join("\n");
      });

      return;
    }

    const payload = delegated.value;
    const bundleTextResponse = await fetch(
      `${baseUrl}/api/runs/${payload.runId}/attempts/${payload.attemptId}/bundle-text`
    );
    if (!bundleTextResponse.ok) {
      throw new Error(`Delegated bundle text fetch failed with status ${bundleTextResponse.status}`);
    }
    const bundleTextPayload = (await bundleTextResponse.json()) as { content: string };
    printOutput(options.format, payload, () => {
      return [`Delegated export complete`, `bundlePath: ${payload.bundlePath}`, "", bundleTextPayload.content].join("\n");
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
    const promptPath = path.join(local.bundlePath, "PROMPT.md");
    const bundleText = await readFile(promptPath, "utf8");

    printOutput(options.format, local, () => {
      return [`Local export complete`, `bundlePath: ${local.bundlePath}`, "", bundleText].join("\n");
    });
  } finally {
    await store.close();
  }
};
