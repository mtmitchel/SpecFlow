import type { AgentTarget, AuditReport, Ticket } from "../types";
import { parse } from "./http";
import { transportRequest } from "./transport";

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
  return transportRequest(
    "audit.run",
    { runId, body: payload },
    async () => {
      const response = await fetch(`/api/runs/${runId}/audit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      return parse<AuditReport>(response);
    }
  );
};

export const createTicketFromAuditFinding = async (runId: string, findingId: string): Promise<Ticket> => {
  const payload = await transportRequest<{ ticket: Ticket }>(
    "audit.createTicket",
    { runId, findingId },
    async () => {
      const response = await fetch(`/api/runs/${runId}/findings/${findingId}/create-ticket`, {
        method: "POST"
      });

      return parse<{ ticket: Ticket }>(response);
    }
  );
  return payload.ticket;
};

export const dismissAuditFinding = async (runId: string, findingId: string, note: string): Promise<void> => {
  await transportRequest(
    "audit.dismiss",
    { runId, findingId, note },
    async () =>
      parse(
        await fetch(`/api/runs/${runId}/findings/${findingId}/dismiss`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ note })
        })
      )
  );
};

export const exportFixBundle = async (
  runId: string,
  findingId: string,
  agent: AgentTarget
): Promise<{ runId: string; attemptId: string; bundlePath: string; flatString: string }> => {
  return transportRequest(
    "tickets.exportFixBundle",
    { runId, findingId, body: { agent } },
    async () => {
      const response = await fetch(`/api/runs/${runId}/findings/${findingId}/export-fix-bundle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ agent })
      });

      return parse(response);
    }
  );
};
