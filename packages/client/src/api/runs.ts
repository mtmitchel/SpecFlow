import type { AgentTarget, Run, RunAttemptDetail, RunDetail, RunDiffPayload, RunListItem } from "../types";
import { parse } from "./http";
import { transportJsonRequest, transportRequest } from "./transport";

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
  return transportJsonRequest(
    "runs.state",
    { id: runId },
    { url: `/api/runs/${runId}/state` }
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
  return transportJsonRequest(
    "runs.progress",
    { id: runId },
    { url: `/api/runs/${runId}/progress` },
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
  const payload = await transportJsonRequest<{ runs: RunListItem[] }>(
    "runs.list",
    filters,
    { url: query ? `/api/runs?${query}` : "/api/runs" }
  );
  return payload.runs;
};

export const fetchRunDetail = async (runId: string, options?: { signal?: AbortSignal }): Promise<RunDetail> => {
  return transportJsonRequest(
    "runs.detail",
    { id: runId },
    { url: `/api/runs/${runId}` },
    undefined,
    options
  );
};

export const fetchRunAttemptDetail = async (
  runId: string,
  attemptId: string,
  options?: { signal?: AbortSignal }
): Promise<RunAttemptDetail> => {
  const payload = await transportJsonRequest<{ attempt: RunAttemptDetail }>(
    "runs.attemptDetail",
    { runId, attemptId },
    { url: `/api/runs/${runId}/attempts/${attemptId}` },
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
  return transportJsonRequest(
    "runs.diff",
    { runId, attemptId, kind },
    { url: `/api/runs/${runId}/attempts/${attemptId}/diff?kind=${kind}` },
    undefined,
    options
  );
};

export const fetchBundleText = async (runId: string, attemptId: string): Promise<string> => {
  const payload = await transportJsonRequest<{ content: string }>(
    "runs.bundleText",
    { runId, attemptId },
    { url: `/api/runs/${runId}/attempts/${attemptId}/bundle-text` }
  );
  return payload.content;
};
