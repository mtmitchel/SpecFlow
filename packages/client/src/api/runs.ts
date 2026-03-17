import type { AgentTarget, Run, RunAttemptDetail, RunDetail, RunDiffPayload, RunListItem } from "../types";
import { parse } from "./http";
import { transportRequest } from "./transport";

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
  return transportRequest(
    "runs.state",
    { id: runId },
    async () => {
      const response = await fetch(`/api/runs/${runId}/state`);
      return parse(response);
    }
  );
};

export const fetchRunProgress = async (
  runId: string,
  options?: { signal?: AbortSignal }
): Promise<{
  run: Run;
  operationState: "prepared" | "committed" | "abandoned" | "superseded" | "failed" | null;
  attempts: Array<{
    attemptId: string;
    overallPass: boolean;
    overrideReason: string | null;
    overrideAccepted: boolean;
    createdAt: string;
  }>;
}> => {
  return transportRequest(
    "runs.progress",
    { id: runId },
    async (signal) => {
      const response = await fetch(`/api/runs/${runId}/progress`, { signal });
      return parse(response);
    },
    undefined,
    options
  );
};

export const fetchOperationStatus = async (
  operationId: string
): Promise<{ state: "prepared" | "committed" | "abandoned" | "superseded" | "failed" } | null> => {
  return transportRequest(
    "operations.status",
    { id: operationId },
    async () => {
      const response = await fetch(`/api/operations/${operationId}`);
      if (response.status === 404) {
        return null;
      }

      return parse<{ state: "prepared" | "committed" | "abandoned" | "superseded" | "failed" }>(response);
    }
  );
};

export const fetchRuns = async (filters: {
  ticketId?: string;
  agent?: AgentTarget;
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
  const payload = await transportRequest<{ runs: RunListItem[] }>(
    "runs.list",
    filters,
    async () => {
      const response = await fetch(query ? `/api/runs?${query}` : "/api/runs");
      return parse<{ runs: RunListItem[] }>(response);
    }
  );
  return payload.runs;
};

export const fetchRunDetail = async (runId: string, options?: { signal?: AbortSignal }): Promise<RunDetail> => {
  return transportRequest(
    "runs.detail",
    { id: runId },
    async (signal) => {
      const response = await fetch(`/api/runs/${runId}`, { signal });
      return parse<RunDetail>(response);
    },
    undefined,
    options
  );
};

export const fetchRunAttemptDetail = async (
  runId: string,
  attemptId: string,
  options?: { signal?: AbortSignal }
): Promise<RunAttemptDetail> => {
  const payload = await transportRequest<{ attempt: RunAttemptDetail }>(
    "runs.attemptDetail",
    { runId, attemptId },
    async (signal) => {
      const response = await fetch(`/api/runs/${runId}/attempts/${attemptId}`, { signal });
      return parse<{ attempt: RunAttemptDetail }>(response);
    },
    undefined,
    options
  );
  return payload.attempt;
};

export const fetchRunDiff = async (
  runId: string,
  attemptId: string,
  kind: "primary" | "drift",
  options?: { signal?: AbortSignal }
): Promise<RunDiffPayload> => {
  return transportRequest(
    "runs.diff",
    { runId, attemptId, kind },
    async (signal) => {
      const response = await fetch(`/api/runs/${runId}/attempts/${attemptId}/diff?kind=${kind}`, { signal });
      return parse<RunDiffPayload>(response);
    },
    undefined,
    options
  );
};

export const fetchBundleText = async (runId: string, attemptId: string): Promise<string> => {
  const payload = await transportRequest<{ content: string }>(
    "runs.bundleText",
    { runId, attemptId },
    async () => {
      const response = await fetch(`/api/runs/${runId}/attempts/${attemptId}/bundle-text`);
      return parse<{ content: string }>(response);
    }
  );
  return payload.content;
};
