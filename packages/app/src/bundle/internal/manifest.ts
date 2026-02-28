import { createHash } from "node:crypto";
import type { BundleContextFile, BundleManifest, BundleAgentTarget, BundleExportMode } from "../types.js";

export const buildBundleManifest = (input: {
  rendererVersion: string;
  agentTarget: BundleAgentTarget;
  exportMode: BundleExportMode;
  ticketId: string;
  runId: string;
  attemptId: string;
  sourceRunId: string | null;
  sourceFindingId: string | null;
  contextFiles: BundleContextFile[];
  rendererFiles: Array<{ relativePath: string }>;
  flatString: string;
  generatedAt: string;
}): BundleManifest => {
  const digest = createHash("sha256").update(input.flatString, "utf8").digest("hex");

  return {
    bundleSchemaVersion: "1.0.0",
    rendererVersion: input.rendererVersion,
    agentTarget: input.agentTarget,
    exportMode: input.exportMode,
    ticketId: input.ticketId,
    runId: input.runId,
    attemptId: input.attemptId,
    sourceRunId: input.sourceRunId,
    sourceFindingId: input.sourceFindingId,
    contextFiles: input.contextFiles.map((file) => `bundle/${file.relativePath}`),
    requiredFiles: [
      "bundle/PROMPT.md",
      "bundle/AGENTS.md",
      ...input.rendererFiles.map((file) => file.relativePath)
    ],
    contentDigest: digest,
    generatedAt: input.generatedAt
  };
};
