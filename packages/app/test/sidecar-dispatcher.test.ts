import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestCancelledError } from "../src/cancellation.js";
import { createHandlerError } from "../src/runtime/errors.js";
import type { SpecFlowRuntime } from "../src/runtime/types.js";

const saveConfigMock = vi.fn();
const continueInitiativeArtifactStepMock = vi.fn();
const continueInitiativeValidationMock = vi.fn();
const generateInitiativeArtifactMock = vi.fn();
const generateInitiativePlanMock = vi.fn();

vi.mock("../src/runtime/handlers/runtime-handlers.js", () => ({
  getArtifactsSnapshot: vi.fn(),
  getSpecDetail: vi.fn()
}));

vi.mock("../src/runtime/handlers/provider-handlers.js", () => ({
  getProviderModels: vi.fn(),
  saveConfig: (...args: unknown[]) => saveConfigMock(...args),
  saveProviderKey: vi.fn()
}));

vi.mock("../src/runtime/handlers/initiative-handlers.js", () => ({
  createDraftInitiative: vi.fn(),
  deleteInitiative: vi.fn(),
  generateInitiativeArtifact: (...args: unknown[]) => generateInitiativeArtifactMock(...args),
  generateInitiativePlan: (...args: unknown[]) => generateInitiativePlanMock(...args),
  overrideInitiativeReview: vi.fn(),
  requestInitiativeClarificationHelp: vi.fn(),
  runInitiativePhaseCheck: vi.fn(),
  runInitiativeReview: vi.fn(),
  saveInitiativeRefinement: vi.fn(),
  saveInitiativeSpec: vi.fn(),
  updateInitiative: vi.fn()
}));

vi.mock("../src/runtime/handlers/initiative-continue-handlers.js", () => ({
  continueInitiativeArtifactStep: (...args: unknown[]) => continueInitiativeArtifactStepMock(...args),
  continueInitiativeValidation: (...args: unknown[]) => continueInitiativeValidationMock(...args),
}));

vi.mock("../src/runtime/handlers/import-handlers.js", () => ({
  importGithubIssue: vi.fn()
}));

vi.mock("../src/runtime/handlers/operation-handlers.js", () => ({
  getOperationStatus: vi.fn()
}));

vi.mock("../src/runtime/handlers/run-audit-handlers.js", () => ({
  createTicketFromAuditFinding: vi.fn(),
  dismissAuditFinding: vi.fn(),
  runAudit: vi.fn()
}));

vi.mock("../src/runtime/handlers/run-query-handlers.js", () => ({
  getBundleText: vi.fn(),
  getRunAttemptDetail: vi.fn(),
  getRunDetail: vi.fn(),
  getRunDiff: vi.fn(),
  getRunProgress: vi.fn(),
  getRunState: vi.fn(),
  listRuns: vi.fn(),
  saveBundleZipToFile: vi.fn()
}));

vi.mock("../src/runtime/handlers/ticket-handlers.js", () => ({
  capturePreview: vi.fn(),
  captureResults: vi.fn(),
  exportBundle: vi.fn(),
  exportFixBundle: vi.fn(),
  listTickets: vi.fn(),
  overrideDone: vi.fn(),
  triageQuickTask: vi.fn(),
  updateTicket: vi.fn()
}));

const { dispatchSidecarRequest } = await import("../src/sidecar/dispatcher.js");

const createRuntimeStub = (): SpecFlowRuntime => ({
  rootDir: "/tmp/specflow-sidecar-dispatcher-test",
  store: {} as SpecFlowRuntime["store"],
  plannerService: {} as SpecFlowRuntime["plannerService"],
  bundleGenerator: {} as SpecFlowRuntime["bundleGenerator"],
  verifierService: {} as SpecFlowRuntime["verifierService"],
  diffEngine: {} as SpecFlowRuntime["diffEngine"],
  fetchImpl: fetch,
  close: async () => undefined
});

describe("sidecar dispatcher", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a success response and artifacts.changed for mutating methods", async () => {
    const runtime = createRuntimeStub();
    const messages: unknown[] = [];

    saveConfigMock.mockResolvedValueOnce({ ok: true });

    await dispatchSidecarRequest(
      runtime,
      { id: "req-save", method: "config.save", params: { provider: "openai" } },
      (message) => {
        messages.push(message);
      }
    );

    expect(messages).toEqual([
      {
        id: "req-save",
        ok: true,
        result: { ok: true }
      },
      {
        event: "artifacts.changed",
        requestId: "req-save",
        payload: {
          reason: "config.save",
          method: "config.save",
          requestId: "req-save",
          correlationId: "req-save"
        }
      }
    ]);
  });

  it("forwards planner-token notifications before the final success result", async () => {
    const runtime = createRuntimeStub();
    const messages: unknown[] = [];

    generateInitiativeArtifactMock.mockImplementationOnce(async (_runtime, _id, _kind, onChunk) => {
      await onChunk("chunk-1");
      await onChunk("chunk-2");
      return { artifactId: "spec-12345678" };
    });

    await dispatchSidecarRequest(
      runtime,
      { id: "req-generate", method: "initiatives.generate.prd", params: { id: "initiative-1" } },
      (message) => {
        messages.push(message);
      }
    );

    expect(messages).toEqual([
      {
        event: "planner-token",
        requestId: "req-generate",
        payload: { chunk: "chunk-1" }
      },
      {
        event: "planner-token",
        requestId: "req-generate",
        payload: { chunk: "chunk-2" }
      },
      {
        id: "req-generate",
        ok: true,
        result: { artifactId: "spec-12345678" }
      },
      {
        event: "artifacts.changed",
        requestId: "req-generate",
        payload: {
          reason: "initiatives.generate.prd",
          method: "initiatives.generate.prd",
          requestId: "req-generate",
          correlationId: "req-generate"
        }
      }
    ]);
  });

  it("forwards planner-token notifications for the combined continuation flow", async () => {
    const runtime = createRuntimeStub();
    const messages: unknown[] = [];

    continueInitiativeArtifactStepMock.mockImplementationOnce(async (_runtime, _id, _kind, _body, onChunk) => {
      await onChunk("chunk-1");
      return { decision: "proceed", generated: true };
    });

    await dispatchSidecarRequest(
      runtime,
      {
        id: "req-continue",
        method: "initiatives.continueArtifactStep",
        params: {
          id: "initiative-1",
          step: "prd",
          body: {
            draft: {
              answers: { audience: "teams" },
              defaultAnswerQuestionIds: [],
              preferredSurface: "questions",
            },
          },
        },
      },
      (message) => {
        messages.push(message);
      }
    );

    expect(messages).toEqual([
      {
        event: "planner-token",
        requestId: "req-continue",
        payload: { chunk: "chunk-1" }
      },
      {
        id: "req-continue",
        ok: true,
        result: { decision: "proceed", generated: true }
      },
      {
        event: "artifacts.changed",
        requestId: "req-continue",
        payload: {
          reason: "initiatives.continueArtifactStep",
          method: "initiatives.continueArtifactStep",
          requestId: "req-continue",
          correlationId: "req-continue"
        }
      }
    ]);
  });

  it("forwards planner-status notifications before the plan-generation success result", async () => {
    const runtime = createRuntimeStub();
    const messages: unknown[] = [];

    generateInitiativePlanMock.mockImplementationOnce(
      async (_runtime, _id, onChunk, _signal, onStatus) => {
        await onStatus("Preparing validation inputs...");
        await onChunk("chunk-1");
        await onStatus("Running ticket coverage review...");
        return { phases: [], uncoveredCoverageItemIds: [] };
      }
    );

    await dispatchSidecarRequest(
      runtime,
      { id: "req-plan", method: "initiatives.generatePlan", params: { id: "initiative-1" } },
      (message) => {
        messages.push(message);
      }
    );

    expect(messages).toEqual([
      {
        event: "planner-status",
        requestId: "req-plan",
        payload: { message: "Preparing validation inputs..." }
      },
      {
        event: "planner-token",
        requestId: "req-plan",
        payload: { chunk: "chunk-1" }
      },
      {
        event: "planner-status",
        requestId: "req-plan",
        payload: { message: "Running ticket coverage review..." }
      },
      {
        id: "req-plan",
        ok: true,
        result: { phases: [], uncoveredCoverageItemIds: [] }
      },
      {
        event: "artifacts.changed",
        requestId: "req-plan",
        payload: {
          reason: "initiatives.generatePlan",
          method: "initiatives.generatePlan",
          requestId: "req-plan",
          correlationId: "req-plan"
        }
      }
    ]);
  });

  it("forwards planner-status notifications for the combined validation flow", async () => {
    const runtime = createRuntimeStub();
    const messages: unknown[] = [];

    continueInitiativeValidationMock.mockImplementationOnce(
      async (_runtime, _id, _body, onChunk, _signal, onStatus) => {
        await onStatus("Preparing validation inputs...");
        await onChunk("chunk-1");
        await onStatus("Committing ticket plan...");
        return { decision: "proceed", generated: true, blockedSteps: [] };
      }
    );

    await dispatchSidecarRequest(
      runtime,
      {
        id: "req-validation",
        method: "initiatives.continueValidation",
        params: { id: "initiative-1", body: { draftByStep: {} } },
      },
      (message) => {
        messages.push(message);
      }
    );

    expect(messages).toEqual([
      {
        event: "planner-status",
        requestId: "req-validation",
        payload: { message: "Preparing validation inputs..." }
      },
      {
        event: "planner-token",
        requestId: "req-validation",
        payload: { chunk: "chunk-1" }
      },
      {
        event: "planner-status",
        requestId: "req-validation",
        payload: { message: "Committing ticket plan..." }
      },
      {
        id: "req-validation",
        ok: true,
        result: { decision: "proceed", generated: true, blockedSteps: [] }
      },
      {
        event: "artifacts.changed",
        requestId: "req-validation",
        payload: {
          reason: "initiatives.continueValidation",
          method: "initiatives.continueValidation",
          requestId: "req-validation",
          correlationId: "req-validation"
        }
      }
    ]);
  });

  it("shapes handler errors into structured sidecar failures", async () => {
    const runtime = createRuntimeStub();
    const messages: unknown[] = [];

    saveConfigMock.mockRejectedValueOnce(
      createHandlerError("Blocked", 409, "Provider is locked", {
        error: "Blocked",
        field: "provider"
      })
    );

    await dispatchSidecarRequest(
      runtime,
      { id: "req-error", method: "config.save", params: { provider: "openai" } },
      (message) => {
        messages.push(message);
      }
    );

    expect(messages).toEqual([
      {
        id: "req-error",
        ok: false,
        error: {
          code: "Blocked",
          message: "Provider is locked",
          statusCode: 409,
          details: {
            error: "Blocked",
            field: "provider"
          }
        }
      }
    ]);
  });

  it("shapes request cancellation into a 499 failure without mutation notifications", async () => {
    const runtime = createRuntimeStub();
    const messages: unknown[] = [];

    generateInitiativeArtifactMock.mockRejectedValueOnce(new RequestCancelledError("Request timed out"));

    await dispatchSidecarRequest(
      runtime,
      { id: "req-cancelled", method: "initiatives.generate.prd", params: { id: "initiative-1" } },
      (message) => {
        messages.push(message);
      }
    );

    expect(messages).toEqual([
      {
        id: "req-cancelled",
        ok: false,
        error: {
          code: "Request Cancelled",
          message: "Request timed out",
          statusCode: 499
        }
      }
    ]);
  });

  it("returns an internal error for unsupported sidecar methods", async () => {
    const runtime = createRuntimeStub();
    const messages: unknown[] = [];

    await dispatchSidecarRequest(
      runtime,
      { id: "req-unknown", method: "unknown.method", params: {} },
      (message) => {
        messages.push(message);
      }
    );

    expect(messages).toEqual([
      {
        id: "req-unknown",
        ok: false,
        error: {
          code: "Internal Error",
          message: "Unsupported sidecar method: unknown.method",
          statusCode: 500
        }
      }
    ]);
  });
});
