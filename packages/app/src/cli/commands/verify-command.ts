import process from "node:process";
import { randomUUID } from "node:crypto";
import { ArtifactStore } from "../../store/artifact-store.js";
import { VerifierService } from "../../verify/verifier-service.js";
import { printOutput } from "../output.js";
import type { OutputFormat } from "../types.js";

export const runVerifyCommand = async (options: {
  ticket: string;
  summary?: string;
  widen?: string[];
  format: OutputFormat;
  operationId?: string;
}): Promise<void> => {
  const rootDir = process.cwd();
  const operationId = options.operationId ?? `op-${randomUUID()}`;
  const widened = options.widen ?? [];

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
      return [`Verify complete`, `overallPass: ${local.overallPass}`, criteria].join("\n");
    });
  } finally {
    await store.close();
  }
};
