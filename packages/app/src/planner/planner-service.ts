import { randomUUID } from "node:crypto";
import { loadEnvironment } from "../config/env.js";
import { HttpLlmClient, type LlmClient, type LlmTokenHandler } from "../llm/client.js";
import { ArtifactStore } from "../store/artifact-store.js";
import type {
  Initiative,
  InitiativeArtifactStep,
  PlanningReviewArtifact,
  PlanningReviewKind,
  Ticket
} from "../types/entities.js";
import {
  createInitiativeWorkflow
} from "./workflow-state.js";
import { toStructuredPlannerError } from "./internal/error-shaping.js";
import { deriveInitiativeTitle } from "./internal/ticket-factory.js";
import {
  type PlannerServiceRuntimeContext,
  executePlannerJob as executePlannerJobRuntime,
} from "./planner-service-runtime.js";
import type { PlannerJob } from "./prompt-builder.js";
import type {
  ClarifyHelpResult,
  PhaseCheckResult,
  PlanResult,
  RefinementStep
} from "./types.js";
import {
  commitPendingPlanForInitiative,
  runPlanJob,
  runTriageJob
} from "./internal/planner-service-plans.js";
import {
  type GeneratedPhaseResult,
  type PlannerJobInput,
  type PlannerServiceDependencies
} from "./internal/planner-service-shared.js";
import {
  generateArtifact,
  runClarificationHelpJob,
  runPhaseCheckJob
} from "./internal/planner-service-refinement.js";
import {
  markPlanningArtifactsStale,
  overridePlanningReview,
  runPlanningReviewJob
} from "./internal/planner-service-reviews.js";

export interface PlannerServiceOptions {
  rootDir: string;
  store: ArtifactStore;
  llmClient?: LlmClient;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  idGenerator?: () => string;
}

export class PlannerService {
  private readonly rootDir: string;
  private readonly store: ArtifactStore;
  private readonly llmClient: LlmClient;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  public constructor(options: PlannerServiceOptions) {
    this.rootDir = options.rootDir;
    loadEnvironment(this.rootDir);
    this.store = options.store;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.llmClient = options.llmClient ?? new HttpLlmClient(this.fetchImpl);
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID().slice(0, 8));
  }

  public async createDraftInitiative(input: { description: string; projectRoot?: string }): Promise<Initiative> {
    const nowIso = this.now().toISOString();
    const initiative: Initiative = {
      id: `initiative-${this.idGenerator()}`,
      title: deriveInitiativeTitle(input.description),
      description: input.description,
      projectRoot: input.projectRoot ?? this.rootDir,
      status: "draft",
      phases: [],
      specIds: [],
      ticketIds: [],
      workflow: createInitiativeWorkflow(),
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await this.store.upsertInitiative(initiative);
    return initiative;
  }

  public async runPhaseCheckJob(
    input: {
      initiativeId: string;
      step: RefinementStep;
      validationFeedback?: string;
    },
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<PhaseCheckResult> {
    return runPhaseCheckJob(this.getServiceDependencies(), input, onToken, signal);
  }

  public async runClarificationHelpJob(
    input: { initiativeId: string; questionId: string; note?: string },
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<ClarifyHelpResult> {
    return runClarificationHelpJob(this.getServiceDependencies(), input, onToken, signal);
  }

  public async runBriefJob(
    input: { initiativeId: string },
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<GeneratedPhaseResult> {
    return generateArtifact(this.getServiceDependencies(), "brief", input.initiativeId, "brief-gen", onToken, signal);
  }

  public async runCoreFlowsJob(
    input: { initiativeId: string },
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<GeneratedPhaseResult> {
    return generateArtifact(
      this.getServiceDependencies(),
      "core-flows",
      input.initiativeId,
      "core-flows-gen",
      onToken,
      signal
    );
  }

  public async runPrdJob(
    input: { initiativeId: string },
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<GeneratedPhaseResult> {
    return generateArtifact(this.getServiceDependencies(), "prd", input.initiativeId, "prd-gen", onToken, signal);
  }

  public async runTechSpecJob(
    input: { initiativeId: string },
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<GeneratedPhaseResult> {
    return generateArtifact(
      this.getServiceDependencies(),
      "tech-spec",
      input.initiativeId,
      "tech-spec-gen",
      onToken,
      signal
    );
  }

  public async runPlanningReviewJob(
    input: { initiativeId: string; kind: PlanningReviewKind },
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<PlanningReviewArtifact> {
    return runPlanningReviewJob(this.getServiceDependencies(), input, onToken, signal);
  }

  public async overridePlanningReview(input: {
    initiativeId: string;
    kind: PlanningReviewKind;
    reason: string;
  }): Promise<PlanningReviewArtifact> {
    return overridePlanningReview(this.getServiceDependencies(), input);
  }

  public async markPlanningArtifactsStale(
    initiativeId: string,
    step: InitiativeArtifactStep
  ): Promise<void> {
    await markPlanningArtifactsStale(this.getServiceDependencies(), initiativeId, step);
  }

  public async runPlanJob(
    input: { initiativeId: string },
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<PlanResult> {
    return runPlanJob(this.getServiceDependencies(), input, onToken, signal);
  }

  public async commitPendingPlan(input: { initiativeId: string }): Promise<void> {
    await commitPendingPlanForInitiative(this.getServiceDependencies(), input);
  }

  public async runTriageJob(
    input: { description: string },
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<
    | { decision: "too-large"; reason: string; initiative: Initiative }
    | { decision: "ok"; reason: string; ticket: Ticket }
  > {
    return runTriageJob(this.getServiceDependencies(), input, onToken, signal);
  }

  public toStructuredError(error: unknown): {
    code: string;
    message: string;
    statusCode: number;
    details?: unknown;
  } {
    return toStructuredPlannerError(error);
  }

  private requireInitiative(initiativeId: string): Initiative {
    const initiative = this.store.initiatives.get(initiativeId);
    if (!initiative) {
      throw new Error(`Initiative ${initiativeId} not found`);
    }

    return initiative;
  }

  private async executePlannerJob<T>(
    job: PlannerJob,
    input: PlannerJobInput,
    onToken?: LlmTokenHandler,
    signal?: AbortSignal,
    projectRoot = this.rootDir
  ): Promise<T> {
    return executePlannerJobRuntime<T>(this.getRuntimeContext(), job, input, onToken, signal, projectRoot);
  }

  private getRuntimeContext(): PlannerServiceRuntimeContext {
    return {
      rootDir: this.rootDir,
      store: this.store,
      llmClient: this.llmClient,
      fetchImpl: this.fetchImpl,
      now: this.now
    };
  }

  private getServiceDependencies(): PlannerServiceDependencies {
    return {
      rootDir: this.rootDir,
      store: this.store,
      now: this.now,
      idGenerator: this.idGenerator,
      createDraftInitiative: (input) => this.createDraftInitiative(input),
      markPlanningArtifactsStale: (initiativeId, step) => this.markPlanningArtifactsStale(initiativeId, step),
      requireInitiative: (initiativeId) => this.requireInitiative(initiativeId),
      executePlannerJob: (job, input, onToken, signal, projectRoot) =>
        this.executePlannerJob(job, input, onToken, signal, projectRoot),
      getRuntimeContext: () => this.getRuntimeContext()
    };
  }
}
