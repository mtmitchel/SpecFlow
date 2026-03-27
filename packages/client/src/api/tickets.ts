import type { AgentTarget, Initiative, Ticket, TicketStatus } from "../types";
import {
  saveDesktopBundleZip,
  transportJsonRequest,
  type TransportEvent
} from "./transport";

export const updateTicketStatus = async (ticketId: string, status: TicketStatus): Promise<Ticket> => {
  const payload = await transportJsonRequest<{ ticket: Ticket }>(
    "tickets.update",
    { id: ticketId, body: { status } },
    undefined,
    { localMutationApplied: true }
  );
  return payload.ticket;
};

export const triageQuickTask = async (
  description: string
): Promise<
  | {
      decision: "ok";
      reason: string;
      ticket: Ticket;
      acceptanceCriteria: Array<{ id: string; text: string }>;
      implementationPlan: string;
      fileTargets: string[];
    }
  | { decision: "too-large"; reason: string; initiative: Initiative }
> => {
  return transportJsonRequest(
    "tickets.create",
    { body: { description } },
    undefined,
    { localMutationApplied: true }
  );
};

export const exportBundle = async (
  ticketId: string,
  agent: AgentTarget,
  exportMode?: "standard" | "quick-fix"
): Promise<{ runId: string; attemptId: string; bundlePath: string }> => {
  return transportJsonRequest(
    "tickets.exportBundle",
    { id: ticketId, body: { agent, exportMode } }
  );
};

export const captureResults = async (
  ticketId: string,
  agentSummary: string,
  scopePaths: string[],
  widenedScopePaths: string[],
  onEvent?: (event: TransportEvent) => void
): Promise<{
  runId: string;
  attemptId: string;
  overallPass: boolean;
  criteriaResults: Array<{ criterionId: string; pass: boolean; evidence: string }>;
  driftFlags: Array<{
    type: "unexpected-file" | "missing-requirement" | "pre-capture-drift" | "widened-scope-drift" | "snapshot-partial-scope";
    file: string;
    description: string;
  }>;
}> => {
  return transportJsonRequest(
    "tickets.captureResults",
    {
      id: ticketId,
      body: {
        agentSummary,
        scopePaths,
        widenedScopePaths
      }
    },
    onEvent
  );
};

export const capturePreview = async (
  ticketId: string,
  payload: {
    scopePaths: string[];
    widenedScopePaths: string[];
    diffSource: { mode: "auto" | "snapshot" };
  },
  options?: { signal?: AbortSignal }
): Promise<{
  source: "git" | "snapshot";
  defaultScope: string[];
  changedPaths: string[];
  primaryDiff: string;
  driftDiff: string | null;
}> => {
  return transportJsonRequest(
    "tickets.capturePreview",
    { id: ticketId, body: payload },
    undefined,
    options
  );
};

export const overrideDone = async (
  ticketId: string,
  reason: string,
  overrideAccepted: boolean
): Promise<{ runId: string; attemptId: string }> => {
  return transportJsonRequest(
    "tickets.overrideDone",
    { id: ticketId, body: { reason, overrideAccepted } }
  );
};

export const saveBundleZip = async (
  runId: string,
  attemptId: string,
  defaultFilename: string
): Promise<boolean> => {
  return saveDesktopBundleZip(runId, attemptId, defaultFilename);
};
