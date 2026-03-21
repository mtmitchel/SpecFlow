import type { AgentTarget, Run, RunAttemptDetail, RunDetail, RunDiffPayload, RunListItem } from "../types";
import { ApiError } from "./http";
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
    { id: runId }
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
    undefined,
    options
  );
};

export const fetchOperationStatus = async (
  operationId: string
): Promise<{ state: "prepared" | "committed" | "abandoned" | "superseded" | "failed" } | null> => {
  try {
    return await transportRequest("operations.status", { id: operationId });
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) {
      return null;
    }

    throw error;
  }
};

export const fetchRuns = async (filters: {
  ticketId?: string;
  agent?: AgentTarget;
  status?: "pending" | "complete";
  dateFrom?: string;
  dateTo?: string;
} = {}): Promise<RunListItem[]> => {
  const payload = await transportJsonRequest<{ runs: RunListItem[] }>(
    "runs.list",
    filters
  );
  return payload.runs;
};

export const fetchRunDetail = async (runId: string, options?: { signal?: AbortSignal }): Promise<RunDetail> => {
  return transportJsonRequest(
    "runs.detail",
    { id: runId },
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
    undefined,
    options
  );
};

export const fetchBundleText = async (runId: string, attemptId: string): Promise<string> => {
  const payload = await transportJsonRequest<{ content: string }>(
    "runs.bundleText",
    { runId, attemptId }
  );
  return payload.content;
};
