import {
  createDraftInitiative,
  deleteInitiative,
  generateInitiativeArtifact,
  generateInitiativePlan,
  listInitiatives,
  overrideInitiativeReview,
  requestInitiativeClarificationHelp,
  runInitiativePhaseCheck,
  runInitiativeReview,
  saveInitiativeRefinement,
  saveInitiativeSpec,
  updateInitiative
} from "../runtime/handlers/initiative-handlers.js";
import { importGithubIssue } from "../runtime/handlers/import-handlers.js";
import { getOperationStatus } from "../runtime/handlers/operation-handlers.js";
import { getProviderModels, saveConfig } from "../runtime/handlers/provider-handlers.js";
import { createTicketFromAuditFinding, dismissAuditFinding, runAudit } from "../runtime/handlers/run-audit-handlers.js";
import {
  getRunDetail,
  getRunState,
  listRuns,
  saveBundleZipToFile
} from "../runtime/handlers/run-query-handlers.js";
import { getArtifactsSnapshot, getRuntimeStatus } from "../runtime/handlers/runtime-handlers.js";
import {
  capturePreview,
  captureResults,
  exportBundle,
  exportFixBundle,
  listTickets,
  overrideDone,
  triageQuickTask,
  updateTicket
} from "../runtime/handlers/ticket-handlers.js";
import { isHandlerError } from "../runtime/errors.js";
import type { SidecarFailure, SidecarNotification, SidecarRequest, SidecarSuccess } from "../runtime/sidecar-contract.js";
import type { SpecFlowRuntime } from "../runtime/types.js";

export type SidecarWriter = (message: SidecarSuccess | SidecarFailure | SidecarNotification) => void;

const MUTATING_METHODS = new Set([
  "config.save",
  "initiatives.delete",
  "initiatives.update",
  "initiatives.refinement.save",
  "initiatives.spec.save",
  "initiatives.create",
  "initiatives.phaseCheck",
  "initiatives.generate.brief",
  "initiatives.generate.coreFlows",
  "initiatives.generate.prd",
  "initiatives.generate.techSpec",
  "initiatives.review.run",
  "initiatives.review.override",
  "initiatives.generatePlan",
  "tickets.update",
  "tickets.create",
  "tickets.exportBundle",
  "tickets.exportFixBundle",
  "tickets.captureResults",
  "tickets.overrideDone",
  "audit.createTicket",
  "import.githubIssue"
]);

export const isMutatingSidecarMethod = (method: string): boolean => MUTATING_METHODS.has(method);

const emitArtifactsChanged = (write: SidecarWriter, requestId: string, method: string): void => {
  write({
    event: "artifacts.changed",
    requestId,
    payload: { reason: method }
  });
};

export const dispatchSidecarRequest = async (
  runtime: SpecFlowRuntime,
  request: SidecarRequest,
  write: SidecarWriter
): Promise<void> => {
  const notify = (event: string, payload: unknown): void => {
    write({
      event,
      requestId: request.id,
      payload
    });
  };

  try {
    const result = await routeSidecarMethod(runtime, request, notify);
    write({
      id: request.id,
      ok: true,
      result
    });

    if (isMutatingSidecarMethod(request.method)) {
      emitArtifactsChanged(write, request.id, request.method);
    }
  } catch (error) {
    if (isHandlerError(error)) {
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
  notify: (event: string, payload: unknown) => void
): Promise<unknown> => {
  const params = (request.params ?? {}) as Record<string, unknown>;

  switch (request.method) {
    case "runtime.status":
      return getRuntimeStatus();
    case "artifacts.snapshot":
      return getArtifactsSnapshot(runtime);
    case "config.save":
      return saveConfig(runtime, params);
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
    case "runs.state":
      return getRunState(runtime, String(params.id ?? ""));
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
    case "initiatives.list":
      return listInitiatives(runtime);
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
        }
      );
    case "initiatives.refinement.help":
      return requestInitiativeClarificationHelp(runtime, String(params.id ?? ""), params.body as Record<string, unknown>);
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
      return runInitiativePhaseCheck(runtime, String(params.id ?? ""), params.step as "brief" | "core-flows" | "prd" | "tech-spec");
    case "initiatives.generate.brief":
      return generateInitiativeArtifact(runtime, String(params.id ?? ""), "brief", async (chunk) => notify("planner-token", { chunk }));
    case "initiatives.generate.coreFlows":
      return generateInitiativeArtifact(runtime, String(params.id ?? ""), "core-flows", async (chunk) => notify("planner-token", { chunk }));
    case "initiatives.generate.prd":
      return generateInitiativeArtifact(runtime, String(params.id ?? ""), "prd", async (chunk) => notify("planner-token", { chunk }));
    case "initiatives.generate.techSpec":
      return generateInitiativeArtifact(runtime, String(params.id ?? ""), "tech-spec", async (chunk) => notify("planner-token", { chunk }));
    case "initiatives.review.run":
      return runInitiativeReview(
        runtime,
        String(params.id ?? ""),
        String(params.kind ?? ""),
        async (chunk) => notify("planner-token", { chunk })
      );
    case "initiatives.review.override":
      return overrideInitiativeReview(
        runtime,
        String(params.id ?? ""),
        String(params.kind ?? ""),
        params.body as { reason?: string }
      );
    case "initiatives.generatePlan":
      return generateInitiativePlan(runtime, String(params.id ?? ""), async (chunk) => notify("planner-token", { chunk }));
    case "tickets.list":
      return listTickets(runtime);
    case "tickets.update":
      return updateTicket(runtime, String(params.id ?? ""), params.body as Record<string, unknown>);
    case "tickets.create":
      return triageQuickTask(runtime, params.body as { description?: string });
    case "tickets.exportBundle":
      return exportBundle(runtime, String(params.id ?? ""), params.body as Record<string, unknown>);
    case "tickets.exportFixBundle":
      return exportFixBundle(
        runtime,
        String(params.runId ?? ""),
        String(params.findingId ?? ""),
        params.body as Record<string, unknown>
      );
    case "tickets.captureResults":
      return captureResults(
        runtime,
        String(params.id ?? ""),
        params.body as Record<string, unknown>,
        async (event, payload) => notify(event, payload)
      );
    case "tickets.capturePreview":
      return capturePreview(runtime, String(params.id ?? ""), params.body as Record<string, unknown>);
    case "tickets.overrideDone":
      return overrideDone(runtime, String(params.id ?? ""), params.body as Record<string, unknown>);
    default:
      throw new Error(`Unsupported sidecar method: ${request.method}`);
  }
};
