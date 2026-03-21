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
    { runId, body: payload }
  );
};

export const createTicketFromAuditFinding = async (runId: string, findingId: string): Promise<Ticket> => {
  const payload = await transportJsonRequest<{ ticket: Ticket }>(
    "audit.createTicket",
    { runId, findingId }
  );
  return payload.ticket;
};

export const dismissAuditFinding = async (runId: string, findingId: string, note: string): Promise<void> => {
  await transportJsonRequest(
    "audit.dismiss",
    { runId, findingId, note }
  );
};

export const exportFixBundle = async (
  runId: string,
  findingId: string,
  agent: AgentTarget
): Promise<{ runId: string; attemptId: string; bundlePath: string }> => {
  return transportJsonRequest(
    "tickets.exportFixBundle",
    { runId, findingId, body: { agent } }
  );
};
