import type { AgentTarget, AuditReport, Ticket } from "../types";
import { transportJsonRequest } from "./transport";

export const runAudit = async (
  runId: string,
  payload: {
    diffSource:
      | { mode: "branch"; branch: string }
      | { mode: "commit-range"; from: string; to: string }
      | { mode: "snapshot" };
    scopePaths: string[];
    widenedScopePaths: string[];
  }
): Promise<AuditReport> => {
  return transportJsonRequest(
    "audit.run",
    { runId, body: payload },
    { url: `/api/runs/${runId}/audit`, method: "POST", body: payload }
  );
};

export const createTicketFromAuditFinding = async (runId: string, findingId: string): Promise<Ticket> => {
  const payload = await transportJsonRequest<{ ticket: Ticket }>(
    "audit.createTicket",
    { runId, findingId },
    { url: `/api/runs/${runId}/findings/${findingId}/create-ticket`, method: "POST" }
  );
  return payload.ticket;
};

export const dismissAuditFinding = async (runId: string, findingId: string, note: string): Promise<void> => {
  await transportJsonRequest(
    "audit.dismiss",
    { runId, findingId, note },
    { url: `/api/runs/${runId}/findings/${findingId}/dismiss`, method: "POST", body: { note } }
  );
};

export const exportFixBundle = async (
  runId: string,
  findingId: string,
  agent: AgentTarget
): Promise<{ runId: string; attemptId: string; bundlePath: string }> => {
  return transportJsonRequest(
    "tickets.exportFixBundle",
    { runId, findingId, body: { agent } },
    { url: `/api/runs/${runId}/findings/${findingId}/export-fix-bundle`, method: "POST", body: { agent } }
  );
};
