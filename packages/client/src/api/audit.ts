import type { AuditReport, Ticket } from "../types";
import { parse } from "./http";

type AgentTarget = "claude-code" | "codex-cli" | "opencode" | "generic";

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
  const response = await fetch(`/api/runs/${runId}/audit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parse<AuditReport>(response);
};

export const createTicketFromAuditFinding = async (runId: string, findingId: string): Promise<Ticket> => {
  const response = await fetch(`/api/runs/${runId}/findings/${findingId}/create-ticket`, {
    method: "POST"
  });

  const payload = await parse<{ ticket: Ticket }>(response);
  return payload.ticket;
};

export const dismissAuditFinding = async (runId: string, findingId: string, note: string): Promise<void> => {
  await parse(
    await fetch(`/api/runs/${runId}/findings/${findingId}/dismiss`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ note })
    })
  );
};

export const exportFixBundle = async (
  runId: string,
  findingId: string,
  agent: AgentTarget
): Promise<{ runId: string; attemptId: string; bundlePath: string; flatString: string }> => {
  const response = await fetch(`/api/runs/${runId}/findings/${findingId}/export-fix-bundle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ agent })
  });

  return parse(response);
};
