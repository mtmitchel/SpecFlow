import process from "node:process";
import { randomUUID } from "node:crypto";
import { ArtifactStore } from "../../store/artifact-store.js";
import { VerifierService } from "../../verify/verifier-service.js";
import { printOutput } from "../output.js";
import {
  assertDelegationCompatible,
  loadCliConfig,
  normalizeServerBaseUrl,
  probeOperationStatus,
  probeRuntimeStatus
} from "../probe.js";
import { withTimeout } from "../timeout.js";
import type { OutputFormat } from "../types.js";

export const runVerifyCommand = async (options: {
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
