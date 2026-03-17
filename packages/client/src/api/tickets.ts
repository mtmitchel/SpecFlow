import type { AgentTarget, Ticket, TicketStatus } from "../types";
import { parse } from "./http";
import { chooseSavePath, isDesktopRuntime, transportRequest, type TransportEvent } from "./transport";

export const updateTicketStatus = async (ticketId: string, status: TicketStatus): Promise<Ticket> => {
  const payload = await transportRequest<{ ticket: Ticket }>(
    "tickets.update",
    { id: ticketId, body: { status } },
    async () => {
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
      });

      return parse<{ ticket: Ticket }>(response);
    }
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
  return transportRequest(
    "tickets.create",
    { body: { description } },
    async () => {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ description })
      });

      return parse(response);
    }
  );
};

export const exportBundle = async (
  ticketId: string,
  agent: AgentTarget,
  exportMode?: "standard" | "quick-fix"
): Promise<{ runId: string; attemptId: string; bundlePath: string }> => {
  return transportRequest(
    "tickets.exportBundle",
    { id: ticketId, body: { agent, exportMode } },
    async () => {
      const response = await fetch(`/api/tickets/${ticketId}/export-bundle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ agent, exportMode })
      });

      return parse(response);
    }
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
  return transportRequest(
    "tickets.captureResults",
    {
      id: ticketId,
      body: {
        agentSummary,
        scopePaths,
        widenedScopePaths
      }
    },
    async () => {
      const response = await fetch(`/api/tickets/${ticketId}/capture-results`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          agentSummary,
          scopePaths,
          widenedScopePaths
        })
      });

      return parse(response);
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
  return transportRequest(
    "tickets.capturePreview",
    { id: ticketId, body: payload },
    async () => {
      const response = await fetch(`/api/tickets/${ticketId}/capture-preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      return parse(response);
    }
  );
};

export const overrideDone = async (
  ticketId: string,
  reason: string,
  overrideAccepted: boolean
): Promise<{ runId: string; attemptId: string }> => {
  return transportRequest(
    "tickets.overrideDone",
    { id: ticketId, body: { reason, overrideAccepted } },
    async () => {
      const response = await fetch(`/api/tickets/${ticketId}/override-done`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reason,
          overrideAccepted
        })
      });

      return parse(response);
    }
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
