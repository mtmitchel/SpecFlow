import type { ArtifactsSnapshot, AuditReport, Config, RunDetail, RunListItem, Ticket, TicketStatus } from "./types";

const parse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
};

export const fetchArtifacts = async (): Promise<ArtifactsSnapshot> => {
  const response = await fetch("/api/artifacts");
  return parse<ArtifactsSnapshot>(response);
};

const parseSseResult = async <T>(response: Response): Promise<T> => {
  if (!response.body) {
    throw new Error("Streaming response body missing");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let latestResult: T | null = null;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }

    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.replace("event:", "").trim();
      } else if (line.startsWith("data:")) {
        const payload = JSON.parse(line.replace("data:", "").trim()) as unknown;
        if (currentEvent === "planner-result") {
          latestResult = payload as T;
        }
      }
    }
  }

  if (!latestResult) {
    throw new Error("No planner-result event was emitted");
  }

  return latestResult;
};

export const createInitiative = async (
  description: string
): Promise<{ initiativeId: string; questions: Array<{ id: string; label: string; type: string; options?: string[] }> }> => {
  const response = await fetch("/api/initiatives", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ description })
  });

  return parseSseResult(response);
};

export const generateInitiativeSpecs = async (
  initiativeId: string,
  answers: Record<string, string | string[] | boolean>
): Promise<{ briefMarkdown: string; prdMarkdown: string; techSpecMarkdown: string }> => {
  const response = await fetch(`/api/initiatives/${initiativeId}/generate-specs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ answers })
  });

  return parseSseResult(response);
};

export const generateInitiativePlan = async (
  initiativeId: string
): Promise<{
  phases: Array<{
    name: string;
    order: number;
    tickets: Array<{
      title: string;
      description: string;
      acceptanceCriteria: string[];
      fileTargets: string[];
    }>;
  }>;
}> => {
  const response = await fetch(`/api/initiatives/${initiativeId}/generate-plan`, {
    method: "POST"
  });

  return parseSseResult(response);
};

export const updateInitiativePhases = async (
  initiativeId: string,
  phases: Array<{ id: string; name: string; order: number; status: "active" | "complete" }>
): Promise<void> => {
  await parse(
    await fetch(`/api/initiatives/${initiativeId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ phases })
    })
  );
};

export const saveInitiativeSpecs = async (
  initiativeId: string,
  payload: { briefMarkdown: string; prdMarkdown: string; techSpecMarkdown: string }
): Promise<void> => {
  await parse(
    await fetch(`/api/initiatives/${initiativeId}/specs`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })
  );
};

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
  agent: "claude-code" | "codex-cli" | "opencode" | "generic"
): Promise<{ runId: string; attemptId: string; bundlePath: string; flatString: string }> => {
  const response = await fetch(`/api/tickets/${ticketId}/export-bundle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ agent })
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

export const fetchRunState = async (
  runId: string
): Promise<{
  run: { id: string };
  attempts: Array<{
    attemptId: string;
    overallPass: boolean;
    criteriaResults: Array<{ criterionId: string; pass: boolean; evidence: string }>;
    driftFlags: Array<{ type: string; file: string; description: string }>;
  }>;
}> => {
  const response = await fetch(`/api/runs/${runId}/state`);
  return parse(response);
};

export const saveConfig = async (config: Config): Promise<Config> => {
  const response = await fetch("/api/config", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(config)
  });

  const payload = await parse<{ config: Config }>(response);
  return payload.config;
};

export const fetchOperationStatus = async (
  operationId: string
): Promise<{ state: "prepared" | "committed" | "abandoned" | "superseded" | "failed" } | null> => {
  const response = await fetch(`/api/operations/${operationId}`);
  if (response.status === 404) {
    return null;
  }

  return parse<{ state: "prepared" | "committed" | "abandoned" | "superseded" | "failed" }>(response);
};

export const fetchRuns = async (filters: {
  ticketId?: string;
  agent?: "claude-code" | "codex-cli" | "opencode" | "generic";
  status?: "pending" | "complete";
  dateFrom?: string;
  dateTo?: string;
} = {}): Promise<RunListItem[]> => {
  const params = new URLSearchParams();
  if (filters.ticketId) {
    params.set("ticketId", filters.ticketId);
  }

  if (filters.agent) {
    params.set("agent", filters.agent);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }

  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }

  const query = params.toString();
  const response = await fetch(query ? `/api/runs?${query}` : "/api/runs");
  const payload = await parse<{ runs: RunListItem[] }>(response);
  return payload.runs;
};

export const fetchRunDetail = async (runId: string): Promise<RunDetail> => {
  const response = await fetch(`/api/runs/${runId}`);
  return parse<RunDetail>(response);
};

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
  agent: "claude-code" | "codex-cli" | "opencode" | "generic"
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
