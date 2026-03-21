import type { AgentTarget, Ticket, TicketStatus } from "../types";
import { chooseSavePath, isDesktopRuntime, transportJsonRequest, transportRequest, type TransportEvent } from "./transport";

export const updateTicketStatus = async (ticketId: string, status: TicketStatus): Promise<Ticket> => {
  const payload = await transportJsonRequest<{ ticket: Ticket }>(
    "tickets.update",
    { id: ticketId, body: { status } },
    { url: `/api/tickets/${ticketId}`, method: "PATCH", body: { status } }
  );
  return payload.ticket;
};

export const triageQuickTask = async (
  description: string
): Promise<
  | {
      decision: "ok";
      reason: string;
      ticketId: string;
      ticketTitle: string;
      acceptanceCriteria: Array<{ id: string; text: string }>;
      implementationPlan: string;
      fileTargets: string[];
    }
  | { decision: "too-large"; reason: string; initiativeId: string; initiativeTitle: string }
> => {
  return transportJsonRequest(
    "tickets.create",
    { body: { description } },
    { url: "/api/tickets", method: "POST", body: { description } }
  );
};

export const exportBundle = async (
  ticketId: string,
  agent: AgentTarget,
  exportMode?: "standard" | "quick-fix"
): Promise<{ runId: string; attemptId: string; bundlePath: string }> => {
  return transportJsonRequest(
    "tickets.exportBundle",
    { id: ticketId, body: { agent, exportMode } },
    { url: `/api/tickets/${ticketId}/export-bundle`, method: "POST", body: { agent, exportMode } }
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
    type: "unexpected-file" | "missing-requirement" | "pre-capture-drift" | "widened-scope-drift";
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
    {
      url: `/api/tickets/${ticketId}/capture-results`,
      method: "POST",
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
  }
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
    { url: `/api/tickets/${ticketId}/capture-preview`, method: "POST", body: payload }
  );
};

export const overrideDone = async (
  ticketId: string,
  reason: string,
  overrideAccepted: boolean
): Promise<{ runId: string; attemptId: string }> => {
  return transportJsonRequest(
    "tickets.overrideDone",
    { id: ticketId, body: { reason, overrideAccepted } },
    { url: `/api/tickets/${ticketId}/override-done`, method: "POST", body: { reason, overrideAccepted } }
  );
};

export const saveBundleZip = async (
  runId: string,
  attemptId: string,
  defaultFilename: string
): Promise<string | null> => {
  if (!isDesktopRuntime()) {
    return null;
  }

  const destinationPath = await chooseSavePath(defaultFilename);
  if (!destinationPath) {
    return null;
  }

  const payload = await transportRequest<{ path: string }>(
    "runs.saveBundleZip",
    { runId, attemptId, destinationPath },
    async () => ({ path: destinationPath })
  );

  return payload.path;
};
