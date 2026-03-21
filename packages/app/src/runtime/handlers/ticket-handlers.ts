import type { AgentType } from "../../types/entities.js";
import type { NotificationSink, SpecFlowRuntime } from "../types.js";
import { badRequest } from "../errors.js";
import { getTicketStatusTransitionGate } from "../../planner/execution-gates.js";
import { isValidFindingId } from "../../validation.js";
import { readTicket, requireTicketExecutionAllowed, requireValidEntityId, structuredPlannerError, structuredVerifierError } from "./shared.js";
import { resolveTicketProjectRoot } from "../../project-roots.js";

export const listTickets = (runtime: SpecFlowRuntime) => ({
  tickets: Array.from(runtime.store.tickets.values())
});

export const updateTicket = async (
  runtime: SpecFlowRuntime,
  ticketId: string,
  body: {
    status?: "backlog" | "ready" | "in-progress" | "verify" | "done";
    title?: string;
    description?: string;
  }
) => {
  const ticket = readTicket(runtime, ticketId);
  const nextStatus = body.status ?? ticket.status;
  const transitionGate = getTicketStatusTransitionGate(
    ticket,
    nextStatus,
    runtime.store.planningReviews,
    runtime.store.tickets
  );
  if (!transitionGate.allowed) {
    throw badRequest(transitionGate.message, {
      error: "Blocked",
      message: transitionGate.message,
      reviewKind: transitionGate.code === "coverage-review-unresolved" ? transitionGate.reviewKind : undefined,
      blockingTicketIds:
        transitionGate.code === "blocked-by-open-ticket" ? transitionGate.blockingTicketIds : undefined
    });
  }

  const updated = {
    ...ticket,
    status: nextStatus,
    title: body.title ?? ticket.title,
    description: body.description ?? ticket.description,
    updatedAt: new Date().toISOString()
  };

  await runtime.store.upsertTicket(updated);
  return {
    ticket: updated
  };
};

export const triageQuickTask = async (
  runtime: SpecFlowRuntime,
  body: { description?: string },
  signal?: AbortSignal
) => {
  if (!body.description?.trim()) {
    throw badRequest("description is required");
  }

  try {
    const triage = await runtime.plannerService.runTriageJob({ description: body.description }, undefined, signal);
    if (triage.decision === "too-large") {
      return {
        decision: triage.decision,
        reason: triage.reason,
        initiativeId: triage.initiative.id,
        initiativeTitle: triage.initiative.title
      };
    }

    return {
      decision: triage.decision,
      reason: triage.reason,
      ticketId: triage.ticket.id,
      ticketTitle: triage.ticket.title,
      acceptanceCriteria: triage.ticket.acceptanceCriteria,
      implementationPlan: triage.ticket.implementationPlan,
      fileTargets: triage.ticket.fileTargets
    };
  } catch (error) {
    throw structuredPlannerError(runtime, error);
  }
};

interface ExportBundleInput {
  agent?: AgentType;
  exportMode?: "standard" | "quick-fix";
  operationId?: string;
}

const requireValidOperationId = (operationId: string | undefined): void => {
  if (operationId !== undefined) {
    requireValidEntityId(operationId, "operationId");
  }
};

export const exportBundle = async (
  runtime: SpecFlowRuntime,
  ticketId: string,
  input: ExportBundleInput,
  signal?: AbortSignal
) => {
  requireValidOperationId(input.operationId);
  const ticket = readTicket(runtime, ticketId);
  requireTicketExecutionAllowed(runtime, ticket);

  try {
    const result = await runtime.bundleGenerator.exportBundle({
      ticketId,
      agentTarget: input.agent ?? "codex-cli",
      exportMode: input.exportMode === "quick-fix" ? "quick-fix" : "standard",
      operationId: input.operationId
    }, signal);

    return {
      runId: result.runId,
      attemptId: result.attemptId,
      bundlePath: result.bundlePath,
      manifest: result.manifest
    };
  } catch (error) {
    throw badRequest((error as Error).message, {
      error: "Export Failed",
      message: (error as Error).message
    });
  }
};

export const exportFixBundle = async (
  runtime: SpecFlowRuntime,
  runId: string,
  findingId: string,
  body: { agent?: AgentType; operationId?: string },
  signal?: AbortSignal
) => {
  requireValidEntityId(runId, "run ID");
  if (!isValidFindingId(findingId)) {
    throw badRequest("Invalid finding ID format");
  }
  requireValidOperationId(body.operationId);

  const run = runtime.store.runs.get(runId);
  if (!run) {
    throw badRequest(`Run ${runId} not found`, { error: "Not Found", message: `Run ${runId} not found` });
  }
  if (!run.ticketId) {
    throw badRequest("Run is not linked to a ticket");
  }

  const ticket = readTicket(runtime, run.ticketId);
  requireTicketExecutionAllowed(runtime, ticket);

  try {
    const result = await runtime.bundleGenerator.exportBundle({
      ticketId: run.ticketId,
      agentTarget: body.agent ?? "codex-cli",
      exportMode: "quick-fix",
      sourceRunId: run.id,
      sourceFindingId: findingId,
      operationId: body.operationId
    }, signal);

    return {
      runId: result.runId,
      attemptId: result.attemptId,
      bundlePath: result.bundlePath,
      manifest: result.manifest
    };
  } catch (error) {
    throw badRequest((error as Error).message, {
      error: "Export Failed",
      message: (error as Error).message
    });
  }
};

export const captureResults = async (
  runtime: SpecFlowRuntime,
  ticketId: string,
  body: {
    agentSummary?: string;
    scopePaths?: string[];
    widenedScopePaths?: string[];
    operationId?: string;
  },
  onEvent?: NotificationSink,
  signal?: AbortSignal
) => {
  requireValidOperationId(body.operationId);
  readTicket(runtime, ticketId);

  try {
    await onEvent?.("verify-started", { ticketId });

    const result = await runtime.verifierService.captureAndVerify(
      {
        ticketId,
        agentSummary: body.agentSummary,
        scopePaths: body.scopePaths ?? [],
        widenedScopePaths: body.widenedScopePaths ?? [],
        operationId: body.operationId
      },
      async (chunk) => {
        await onEvent?.("verify-token", { chunk });
      },
      signal
    );

    await onEvent?.("verify-complete", {
      ticketId,
      runId: result.runId,
      attemptId: result.attempt.attemptId,
      overallPass: result.overallPass
    });

    return {
      runId: result.runId,
      attemptId: result.attempt.attemptId,
      overallPass: result.overallPass,
      criteriaResults: result.attempt.criteriaResults,
      driftFlags: result.attempt.driftFlags
    };
  } catch (error) {
    const structured = structuredVerifierError(runtime, error);
    await onEvent?.("verify-error", structured.shape.response);
    throw structured;
  }
};

export const capturePreview = async (
  runtime: SpecFlowRuntime,
  ticketId: string,
  body: {
    scopePaths?: string[];
    widenedScopePaths?: string[];
    diffSource?: { mode: "auto" | "snapshot" };
  }
) => {
  const ticket = readTicket(runtime, ticketId);
  if (!ticket.runId) {
    throw badRequest(`Ticket ${ticketId} has no active run for preview`);
  }

  const run = runtime.store.runs.get(ticket.runId);
  if (!run) {
    throw badRequest(`Run ${ticket.runId} not found`, {
      error: "Not Found",
      message: `Run ${ticket.runId} not found`
    });
  }

  const projectRoot = resolveTicketProjectRoot(runtime.rootDir, runtime.store, ticket);
  const diffResult = await runtime.diffEngine.computeDiff({
    ticket,
    runId: run.id,
    baselineAttemptId: run.committedAttemptId,
    rootDir: projectRoot,
    scopePaths: body.scopePaths ?? [],
    widenedScopePaths: body.widenedScopePaths ?? [],
    diffSource: body.diffSource ?? { mode: "auto" }
  });

  return {
    source: diffResult.diffSource,
    defaultScope: Array.from(new Set([...ticket.fileTargets, ...diffResult.changedFiles])),
    changedPaths: diffResult.changedFiles,
    primaryDiff: diffResult.primaryDiff,
    driftDiff: diffResult.driftDiff
  };
};

export const overrideDone = async (
  runtime: SpecFlowRuntime,
  ticketId: string,
  body: {
    reason?: string;
    overrideAccepted?: boolean;
    operationId?: string;
  },
  signal?: AbortSignal
) => {
  requireValidOperationId(body.operationId);
  readTicket(runtime, ticketId);

  try {
    const result = await runtime.verifierService.overrideDone({
      ticketId,
      reason: body.reason ?? "",
      overrideAccepted: body.overrideAccepted === true,
      operationId: body.operationId
    }, signal);

    return {
      runId: result.runId,
      attemptId: result.attempt.attemptId,
      overrideReason: result.attempt.overrideReason,
      overrideAccepted: result.attempt.overrideAccepted
    };
  } catch (error) {
    throw structuredVerifierError(runtime, error);
  }
};
