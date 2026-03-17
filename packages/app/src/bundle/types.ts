import type { AgentType, Ticket, TicketCoverageItem } from "../types/entities.js";

export type BundleAgentTarget = AgentType;
export type BundleExportMode = "standard" | "quick-fix";

export interface BundleManifest {
  bundleSchemaVersion: "1.0.0";
  rendererVersion: string;
  agentTarget: BundleAgentTarget;
  exportMode: BundleExportMode;
  ticketId: string | null;
  runId: string;
  attemptId: string;
  sourceRunId: string | null;
  sourceFindingId: string | null;
  contextFiles: string[];
  requiredFiles: string[];
  contentDigest: string;
  generatedAt: string;
}

export interface BundleContextFile {
  relativePath: string;
  content: string;
}

export interface RenderBundleInput {
  agentTarget: BundleAgentTarget;
  ticket: Ticket;
  coveredItems: TicketCoverageItem[];
  exportMode: BundleExportMode;
  sourceRunId: string | null;
  sourceFindingId: string | null;
  agentsMd: string;
  contextFiles: BundleContextFile[];
}

export interface RenderBundleOutput {
  prompt: string;
  flatString: string;
  rendererFiles: Array<{ relativePath: string; content: string }>;
}

export interface ExportBundleRequest {
  ticketId: string;
  agentTarget: BundleAgentTarget;
  exportMode: BundleExportMode;
  sourceRunId?: string;
  sourceFindingId?: string;
  operationId?: string;
}

export interface ExportBundleResult {
  runId: string;
  attemptId: string;
  operationId: string;
  bundlePath: string;
  manifest: BundleManifest;
}
