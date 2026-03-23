import {
  createDraftInitiative,
  deleteInitiative,
  generateInitiativeArtifact,
  generateInitiativePlan,
  overrideInitiativeReview,
  requestInitiativeClarificationHelp,
  runInitiativePhaseCheck,
  runInitiativeReview,
  saveInitiativeRefinement,
  saveInitiativeSpec,
  updateInitiative
} from "../runtime/handlers/initiative-handlers.js";
import {
  continueInitiativeArtifactStep,
  continueInitiativeValidation,
} from "../runtime/handlers/initiative-continue-handlers.js";
import type { InitiativePlanningSurface } from "../types/entities.js";
import { importGithubIssue } from "../runtime/handlers/import-handlers.js";
import { getOperationStatus } from "../runtime/handlers/operation-handlers.js";
import { getProviderModels, saveConfig, saveProviderKey } from "../runtime/handlers/provider-handlers.js";
import { createTicketFromAuditFinding, dismissAuditFinding, runAudit } from "../runtime/handlers/run-audit-handlers.js";
import {
  getBundleText,
  getRunDetail,
  getRunAttemptDetail,
  getRunDiff,
  getRunState,
  getRunProgress,
  listRuns,
  saveBundleZipToFile
} from "../runtime/handlers/run-query-handlers.js";
import { getArtifactsSnapshot, getSpecDetail } from "../runtime/handlers/runtime-handlers.js";
import {
  capturePreview,
  captureResults,
  exportBundle,
  exportFixBundle,
  overrideDone,
  triageQuickTask,
  updateTicket
} from "../runtime/handlers/ticket-handlers.js";
import { describeObservabilityError, logObservabilityEvent } from "../observability.js";
import { isHandlerError } from "../runtime/errors.js";
import type { SidecarFailure, SidecarNotification, SidecarRequest, SidecarSuccess } from "../runtime/sidecar-contract.js";
import type { SpecFlowRuntime } from "../runtime/types.js";
import { RequestCancelledError } from "../cancellation.js";
import { isMutatingSidecarMethod } from "./method-catalog.js";

export { isMutatingSidecarMethod } from "./method-catalog.js";

export type SidecarWriter = (message: SidecarSuccess | SidecarFailure | SidecarNotification) => void;

const emitArtifactsChanged = (write: SidecarWriter, requestId: string, method: string): void => {
  write({
    event: "artifacts.changed",
    requestId,
    payload: {
      reason: method,
      method,
      requestId,
      correlationId: requestId
    }
  });
};

export const dispatchSidecarRequest = async (
  runtime: SpecFlowRuntime,
  request: SidecarRequest,
  write: SidecarWriter,
  signal?: AbortSignal
): Promise<void> => {
  const startedAt = Date.now();
  const notify = (event: string, payload: unknown): void => {
    write({
      event,
      requestId: request.id,
      payload
    });
  };

  try {
    logObservabilityEvent({
      layer: "sidecar",
      event: "request.dispatch",
      requestId: request.id,
      method: request.method,
      status: "start"
    });
    const result = await routeSidecarMethod(runtime, request, notify, signal);
    write({
      id: request.id,
      ok: true,
      result
    });

    if (isMutatingSidecarMethod(request.method)) {
      emitArtifactsChanged(write, request.id, request.method);
    }

    logObservabilityEvent({
      layer: "sidecar",
      event: "request.dispatch",
      requestId: request.id,
      method: request.method,
      status: "ok",
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    if (error instanceof RequestCancelledError) {
      logObservabilityEvent({
        layer: "sidecar",
        event: "request.dispatch",
        requestId: request.id,
        method: request.method,
        status: error.message === "Request timed out" ? "timeout" : "cancelled",
        durationMs: Date.now() - startedAt,
        details: {
          message: error.message
        }
      });
      write({
        id: request.id,
        ok: false,
        error: {
          code: "Request Cancelled",
          message: error.message,
          statusCode: 499
        }
      });
      return;
    }

    if (isHandlerError(error)) {
      logObservabilityEvent({
        layer: "sidecar",
        event: "request.dispatch",
        requestId: request.id,
        method: request.method,
        status: "error",
        durationMs: Date.now() - startedAt,
        details: {
          code: error.shape.code,
          message: error.shape.message
        }
      });
      write({
        id: request.id,
        ok: false,
        error: {
          code: error.shape.code,
          message: error.shape.message,
          statusCode: error.shape.statusCode,
          details: error.shape.response
        }
      });
      return;
    }

    logObservabilityEvent({
      layer: "sidecar",
      event: "request.dispatch",
      requestId: request.id,
      method: request.method,
      status: "error",
      durationMs: Date.now() - startedAt,
      details: {
        message: describeObservabilityError(error)
      }
    });
    write({
      id: request.id,
      ok: false,
      error: {
        code: "Internal Error",
        message: (error as Error).message,
        statusCode: 500
      }
    });
  }
};

const routeSidecarMethod = async (
  runtime: SpecFlowRuntime,
  request: SidecarRequest,
  notify: (event: string, payload: unknown) => void,
  signal?: AbortSignal
): Promise<unknown> => {
  const params = (request.params ?? {}) as Record<string, unknown>;

  switch (request.method) {
    case "artifacts.snapshot":
      return getArtifactsSnapshot(runtime);
    case "specs.detail":
      return getSpecDetail(runtime, String(params.id ?? ""));
    case "config.save":
      return saveConfig(runtime, params);
    case "config.saveProviderKey":
      return saveProviderKey(runtime, params);
    case "providers.models":
      return getProviderModels(runtime, String(params.provider ?? ""), typeof params.q === "string" ? params.q : undefined);
    case "operations.status":
      return getOperationStatus(runtime, String(params.id ?? ""));
    case "import.githubIssue":
      return importGithubIssue(runtime, params);
    case "runs.list":
      return listRuns(runtime, params);
    case "runs.detail":
      return getRunDetail(runtime, String(params.id ?? ""));
    case "runs.attemptDetail":
      return getRunAttemptDetail(runtime, String(params.runId ?? ""), String(params.attemptId ?? ""));
    case "runs.diff":
      return getRunDiff(
        runtime,
        String(params.runId ?? ""),
        String(params.attemptId ?? ""),
        params.kind === "drift" ? "drift" : "primary"
      );
    case "runs.bundleText":
      return getBundleText(runtime, String(params.runId ?? ""), String(params.attemptId ?? ""));
    case "runs.state":
      return getRunState(runtime, String(params.id ?? ""));
    case "runs.progress":
      return getRunProgress(runtime, String(params.id ?? ""));
    case "runs.saveBundleZip":
      return saveBundleZipToFile(
        runtime,
        String(params.runId ?? ""),
        String(params.attemptId ?? ""),
        String(params.destinationPath ?? "")
      );
    case "audit.run":
      return runAudit(runtime, String(params.runId ?? ""), params.body as Record<string, unknown>);
    case "audit.createTicket":
      return createTicketFromAuditFinding(runtime, String(params.runId ?? ""), String(params.findingId ?? ""));
    case "audit.dismiss":
      return dismissAuditFinding(
        runtime,
        String(params.runId ?? ""),
        String(params.findingId ?? ""),
        typeof params.note === "string" ? params.note : undefined
      );
    case "initiatives.delete":
      return deleteInitiative(runtime, String(params.id ?? ""));
    case "initiatives.update":
      return updateInitiative(runtime, String(params.id ?? ""), params.body as Record<string, unknown>);
    case "initiatives.refinement.save":
      return saveInitiativeRefinement(
        runtime,
        String(params.id ?? ""),
        String(params.step ?? ""),
        params.body as {
          answers?: Record<string, string | string[] | boolean>;
          defaultAnswerQuestionIds?: string[];
          preferredSurface?: InitiativePlanningSurface | null;
        }
      );
    case "initiatives.continueArtifactStep":
      return continueInitiativeArtifactStep(
        runtime,
        String(params.id ?? ""),
        String(params.step ?? ""),
        params.body as import("../types/contracts.js").InitiativeArtifactStepContinuePayload,
        async (chunk) => notify("planner-token", { chunk }),
        signal
      );
    case "initiatives.continueValidation":
      return continueInitiativeValidation(
        runtime,
        String(params.id ?? ""),
        params.body as import("../types/contracts.js").InitiativeValidationContinuePayload,
        async (chunk) => notify("planner-token", { chunk }),
        signal,
        async (message) => notify("planner-status", { message })
      );
    case "initiatives.refinement.help":
      return requestInitiativeClarificationHelp(runtime, String(params.id ?? ""), params.body as Record<string, unknown>, signal);
    case "initiatives.spec.save":
      return saveInitiativeSpec(
        runtime,
        String(params.id ?? ""),
        String(params.type ?? ""),
        params.body as { content?: string }
      );
    case "initiatives.create":
      return createDraftInitiative(runtime, params.body as { description?: string });
    case "initiatives.phaseCheck":
      return runInitiativePhaseCheck(
        runtime,
        String(params.id ?? ""),
        params.step as "brief" | "core-flows" | "prd" | "tech-spec",
        params.body as { validationFeedback?: string } | undefined,
        signal
      );
    case "initiatives.generate.brief":
      return generateInitiativeArtifact(runtime, String(params.id ?? ""), "brief", async (chunk) => notify("planner-token", { chunk }), signal);
    case "initiatives.generate.coreFlows":
      return generateInitiativeArtifact(runtime, String(params.id ?? ""), "core-flows", async (chunk) => notify("planner-token", { chunk }), signal);
    case "initiatives.generate.prd":
      return generateInitiativeArtifact(runtime, String(params.id ?? ""), "prd", async (chunk) => notify("planner-token", { chunk }), signal);
    case "initiatives.generate.techSpec":
      return generateInitiativeArtifact(runtime, String(params.id ?? ""), "tech-spec", async (chunk) => notify("planner-token", { chunk }), signal);
    case "initiatives.review.run":
      return runInitiativeReview(
        runtime,
        String(params.id ?? ""),
        String(params.kind ?? ""),
        async (chunk) => notify("planner-token", { chunk }),
        signal
      );
    case "initiatives.review.override":
      return overrideInitiativeReview(
        runtime,
        String(params.id ?? ""),
        String(params.kind ?? ""),
        params.body as { reason?: string }
      );
    case "initiatives.generatePlan":
      return generateInitiativePlan(
        runtime,
        String(params.id ?? ""),
        async (chunk) => notify("planner-token", { chunk }),
        signal,
        async (message) => notify("planner-status", { message })
      );
    case "tickets.update":
      return updateTicket(runtime, String(params.id ?? ""), params.body as Record<string, unknown>);
    case "tickets.create":
      return triageQuickTask(runtime, params.body as { description?: string }, signal);
    case "tickets.exportBundle":
      return exportBundle(runtime, String(params.id ?? ""), params.body as Record<string, unknown>, signal);
    case "tickets.exportFixBundle":
      return exportFixBundle(
        runtime,
        String(params.runId ?? ""),
        String(params.findingId ?? ""),
        params.body as Record<string, unknown>,
        signal
      );
    case "tickets.captureResults":
      return captureResults(
        runtime,
        String(params.id ?? ""),
        params.body as Record<string, unknown>,
        async (event, payload) => notify(event, payload),
        signal
      );
    case "tickets.capturePreview":
      return capturePreview(runtime, String(params.id ?? ""), params.body as Record<string, unknown>);
    case "tickets.overrideDone":
      return overrideDone(runtime, String(params.id ?? ""), params.body as Record<string, unknown>, signal);
    default:
      throw new Error(`Unsupported sidecar method: ${request.method}`);
  }
};
