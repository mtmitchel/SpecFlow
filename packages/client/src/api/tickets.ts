import type { AgentTarget, Ticket, TicketStatus } from "../types";
import { parse } from "./http";

export const updateTicketStatus = async (ticketId: string, status: TicketStatus): Promise<Ticket> => {
  const response = await fetch(`/api/tickets/${ticketId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status })
  });

  const payload = await parse<{ ticket: Ticket }>(response);
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
  const response = await fetch("/api/tickets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ description })
  });

  return parse(response);
};

export const exportBundle = async (
  ticketId: string,
  agent: AgentTarget,
  exportMode?: "standard" | "quick-fix"
): Promise<{ runId: string; attemptId: string; bundlePath: string; flatString: string }> => {
  const response = await fetch(`/api/tickets/${ticketId}/export-bundle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ agent, exportMode })
  });

  return parse(response);
};

export const captureResults = async (
  ticketId: string,
  agentSummary: string,
  scopePaths: string[],
  widenedScopePaths: string[]
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
  const response = await fetch(`/api/tickets/${ticketId}/capture-preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parse(response);
};

export const overrideDone = async (
  ticketId: string,
  reason: string,
  overrideAccepted: boolean
): Promise<{ runId: string; attemptId: string }> => {
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
};
