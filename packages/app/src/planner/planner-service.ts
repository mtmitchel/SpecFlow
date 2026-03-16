import { randomUUID } from "node:crypto";
import { loadEnvironment } from "../config/env.js";
import { HttpLlmClient, type LlmClient, type LlmTokenHandler } from "../llm/client.js";
import { ArtifactStore } from "../store/artifact-store.js";
import type {
  Initiative,
  InitiativeArtifactStep,
  PlanningReviewArtifact,
  PlanningReviewKind,
  Ticket,
  TicketCoverageItem
} from "../types/entities.js";
import { AUTO_REVIEW_KINDS_BY_STEP, getImpactedReviewKinds } from "./planning-reviews.js";
import { createInitiativeWorkflow, updateRefinementState } from "./workflow-state.js";
import { loadPlannerAgentsMd } from "./internal/agents-md.js";
import {
  buildPhaseCheckInput,
  buildSpecGenerationInput,
  getArtifactMarkdownMap,
  getInitiativeTickets,
  getSavedContext,
  requireSpecMarkdown,
  requireSpecUpdatedAt
} from "./internal/context.js";
import { getResolvedPlannerConfig } from "./internal/config.js";
import { toStructuredPlannerError } from "./internal/error-shaping.js";
import { executePlannerJob as executePlannerJobInternal } from "./internal/job-executor.js";
import { persistPlanArtifacts } from "./internal/plan-job.js";
import { scanRepo } from "./internal/repo-scanner.js";
import { executeReviewJob as executeReviewJobInternal } from "./internal/review-job.js";
import {
  buildPersistedTicketCoverageArtifact,
  buildTicketCoverageInput,
  ensureArtifactTrace as ensureArtifactTraceInternal,
  persistPhaseMarkdown as persistPhaseMarkdownInternal,
  requireTicketCoverageArtifact
} from "./internal/spec-artifacts.js";
import { createTicketFromDraft, deriveInitiativeTitle } from "./internal/ticket-factory.js";
import {
  validateClarifyHelpResult,
  validatePhaseCheckResult,
  validatePhaseMarkdownResult,
  validatePlanResult,
  validateReviewRunResult,
  validateTriageResult
} from "./internal/validators.js";
import type { PlannerJob } from "./prompt-builder.js";
import type {
  ClarifyHelpInput,
  ClarifyHelpResult,
  PhaseCheckInput,
  PhaseCheckResult,
  PhaseMarkdownResult,
  PlanInput,
  PlanResult,
  RefinementStep,
  ReviewRunInput,
  SpecGenInput,
  TriageInput,
  TriageResult
} from "./types.js";

export interface PlannerServiceOptions {
  rootDir: string;
  store: ArtifactStore;
  llmClient?: LlmClient;
  now?: () => Date;
  idGenerator?: () => string;
}

export interface GeneratedPhaseResult {
  markdown: string;
  reviews: PlanningReviewArtifact[];
}

const REFINEMENT_JOB_BY_STEP: Record<
  RefinementStep,
  Extract<PlannerJob, "brief-check" | "core-flows-check" | "prd-check" | "tech-spec-check">
> = {
  brief: "brief-check",
  "core-flows": "core-flows-check",
  prd: "prd-check",
  "tech-spec": "tech-spec-check"
};

const CHECK_BUDGET_BY_STEP: Record<RefinementStep, number> = {
  brief: 2,
  "core-flows": 2,
  prd: 3,
  "tech-spec": 3
};

export class PlannerService {
  private readonly rootDir: string;
  private readonly store: ArtifactStore;
  private readonly llmClient: LlmClient;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  public constructor(options: PlannerServiceOptions) {
    this.rootDir = options.rootDir;
    loadEnvironment(this.rootDir);
    this.store = options.store;
    this.llmClient = options.llmClient ?? new HttpLlmClient();
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID().slice(0, 8));
  }

  public async createDraftInitiative(input: { description: string }): Promise<Initiative> {
    const nowIso = this.now().toISOString();
    const initiative: Initiative = {
      id: `initiative-${this.idGenerator()}`,
      title: deriveInitiativeTitle(input.description),
      description: input.description,
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
    input: { initiativeId: string; step: RefinementStep },
    onToken?: LlmTokenHandler
  ): Promise<PhaseCheckResult> {
    const initiative = this.requireInitiative(input.initiativeId);
    const result = await this.executePlannerJob<PhaseCheckResult>(
      REFINEMENT_JOB_BY_STEP[input.step],
      buildPhaseCheckInput(initiative, input.step, getArtifactMarkdownMap(initiative.id, this.store.specs)),
      onToken
    );

    validatePhaseCheckResult(result, CHECK_BUDGET_BY_STEP[input.step]);

    const nowIso = this.now().toISOString();
    await this.store.upsertInitiative({
      ...initiative,
      workflow: updateRefinementState(initiative.workflow, input.step, {
        questions: result.questions,
        answers: initiative.workflow.refinements[input.step].answers,
        defaultAnswerQuestionIds: initiative.workflow.refinements[input.step].defaultAnswerQuestionIds,
        baseAssumptions: result.assumptions,
        checkedAt: nowIso
      }),
      updatedAt: nowIso
    });

    return result;
  }

  public async runClarificationHelpJob(
    input: { initiativeId: string; questionId: string; note?: string },
    onToken?: LlmTokenHandler
  ): Promise<ClarifyHelpResult> {
    const initiative = this.requireInitiative(input.initiativeId);
    const question = Object.values(initiative.workflow.refinements)
      .flatMap((refinement) => refinement.questions)
      .find((item) => item.id === input.questionId);
    if (!question) {
      throw new Error(`Refinement question ${input.questionId} not found`);
    }

    const result = await this.executePlannerJob<ClarifyHelpResult>(
      "clarify-help",
      {
        initiativeDescription: initiative.description,
        savedContext: getSavedContext(initiative, question.affectedArtifact),
        question,
        note: input.note
      } satisfies ClarifyHelpInput,
      onToken
    );

    validateClarifyHelpResult(result);
    return result;
  }

  public async runBriefJob(
    input: { initiativeId: string },
    onToken?: LlmTokenHandler
  ): Promise<GeneratedPhaseResult> {
    return this.generateArtifact("brief", input.initiativeId, "brief-gen", onToken);
  }

  public async runCoreFlowsJob(
    input: { initiativeId: string },
    onToken?: LlmTokenHandler
  ): Promise<GeneratedPhaseResult> {
    return this.generateArtifact("core-flows", input.initiativeId, "core-flows-gen", onToken);
  }

  public async runPrdJob(
    input: { initiativeId: string },
    onToken?: LlmTokenHandler
  ): Promise<GeneratedPhaseResult> {
    return this.generateArtifact("prd", input.initiativeId, "prd-gen", onToken);
  }

  public async runTechSpecJob(
    input: { initiativeId: string },
    onToken?: LlmTokenHandler
  ): Promise<GeneratedPhaseResult> {
    return this.generateArtifact("tech-spec", input.initiativeId, "tech-spec-gen", onToken);
  }

  public async runPlanningReviewJob(
    input: { initiativeId: string; kind: PlanningReviewKind },
    onToken?: LlmTokenHandler
  ): Promise<PlanningReviewArtifact> {
    const initiative = this.requireInitiative(input.initiativeId);
    const review = await this.executeReviewJob(initiative, input.kind, onToken);
    await this.store.upsertPlanningReview(review);
    return review;
  }

  public async overridePlanningReview(input: {
    initiativeId: string;
    kind: PlanningReviewKind;
    reason: string;
  }): Promise<PlanningReviewArtifact> {
    const reviewId = `${input.initiativeId}:${input.kind}`;
    const existing = this.store.planningReviews.get(reviewId);
    if (!existing) {
      throw new Error(`Review ${input.kind} not found for initiative ${input.initiativeId}`);
    }

    const nowIso = this.now().toISOString();
    const overridden: PlanningReviewArtifact = {
      ...existing,
      status: "overridden",
      overrideReason: input.reason,
      updatedAt: nowIso
    };
    await this.store.upsertPlanningReview(overridden);
    return overridden;
  }

  public async markPlanningArtifactsStale(
    initiativeId: string,
    step: InitiativeArtifactStep
  ): Promise<void> {
    const nowIso = this.now().toISOString();
    for (const kind of getImpactedReviewKinds(step)) {
      const reviewId = `${initiativeId}:${kind}`;
      const review = this.store.planningReviews.get(reviewId);
      if (!review) {
        continue;
      }

      await this.store.upsertPlanningReview({
        ...review,
        status: "stale",
        overrideReason: null,
        updatedAt: nowIso
      });
    }
  }

  public async runPlanJob(
    input: { initiativeId: string },
    onToken?: LlmTokenHandler
  ): Promise<PlanResult> {
    const initiative = this.requireInitiative(input.initiativeId);
    const brief = requireSpecMarkdown(initiative.id, "brief", this.store.specs);
    const coreFlows = requireSpecMarkdown(initiative.id, "core-flows", this.store.specs);
    const prd = requireSpecMarkdown(initiative.id, "prd", this.store.specs);
    const techSpec = requireSpecMarkdown(initiative.id, "tech-spec", this.store.specs);
    const coverageInput = await buildTicketCoverageInput({
      initiative,
      requireSpecUpdatedAt: (currentInitiativeId, step) =>
        requireSpecUpdatedAt(currentInitiativeId, step, this.store.specs),
      ensureArtifactTrace: (currentInitiative, step) => this.ensureArtifactTrace(currentInitiative, step)
    });
    const repoContext = await scanRepo(this.rootDir).catch(() => undefined);

    const result = await this.executePlannerJob<PlanResult>(
      "plan",
      {
        initiativeDescription: initiative.description,
        briefMarkdown: brief,
        coreFlowsMarkdown: coreFlows,
        prdMarkdown: prd,
        techSpecMarkdown: techSpec,
        coverageItems: coverageInput.items,
        repoContext
      } satisfies PlanInput,
      onToken
    );

    validatePlanResult(result);
    this.validateCoverageMappings(result, coverageInput.items);

    const nowIso = this.now().toISOString();
    await persistPlanArtifacts({
      initiative,
      result,
      nowIso,
      idGenerator: this.idGenerator,
      upsertTicket: (ticket) => this.store.upsertTicket(ticket),
      getTicket: (ticketId) => this.store.tickets.get(ticketId),
      upsertInitiative: (updatedInitiative) => this.store.upsertInitiative(updatedInitiative),
      upsertTicketCoverageArtifact: (artifact) => this.store.upsertTicketCoverageArtifact(artifact),
      buildTicketCoverageArtifact: ({ initiativeId, items, uncoveredItemIds, sourceUpdatedAts, nowIso: artifactNowIso }) =>
        buildPersistedTicketCoverageArtifact({
          initiativeId,
          items,
          uncoveredItemIds,
          sourceUpdatedAts,
          nowIso: artifactNowIso
        }),
      coverageItems: coverageInput.items,
      coverageSourceUpdatedAts: coverageInput.sourceUpdatedAts,
      executeCoverageReview: (updatedInitiative) => this.executeReviewJob(updatedInitiative, "ticket-coverage-review"),
      upsertPlanningReview: (review) => this.store.upsertPlanningReview(review)
    });

    return result;
  }

  public async runTriageJob(
    input: { description: string },
    onToken?: LlmTokenHandler
  ): Promise<
    | { decision: "too-large"; reason: string; initiative: Initiative }
    | { decision: "ok"; reason: string; ticket: Ticket }
  > {
    const result = await this.executePlannerJob<TriageResult>("triage", input, onToken);
    validateTriageResult(result);

    const normalizedDecision = result.decision.toLowerCase();
    const nowIso = this.now().toISOString();

    if (normalizedDecision === "too-large") {
      const initiative = await this.createDraftInitiative({ description: input.description });
      const titledInitiative =
        result.initiativeTitle?.trim() && result.initiativeTitle.trim() !== initiative.title
          ? { ...initiative, title: result.initiativeTitle.trim(), updatedAt: nowIso }
          : initiative;
      if (titledInitiative !== initiative) {
        await this.store.upsertInitiative(titledInitiative);
      }

      return {
        decision: "too-large",
        reason: result.reason,
        initiative: titledInitiative
      };
    }

    const ticket = createTicketFromDraft({
      initiativeId: null,
      phaseId: null,
      status: "ready",
      draft: result.ticketDraft,
      nowIso,
      idGenerator: this.idGenerator
    });

    await this.store.upsertTicket(ticket);
    return {
      decision: "ok",
      reason: result.reason,
      ticket
    };
  }

  public toStructuredError(error: unknown): {
    code: string;
    message: string;
    statusCode: number;
  } {
    return toStructuredPlannerError(error);
  }

  private async generateArtifact(
    step: RefinementStep,
    initiativeId: string,
    job: Extract<PlannerJob, "brief-gen" | "core-flows-gen" | "prd-gen" | "tech-spec-gen">,
    onToken?: LlmTokenHandler
  ): Promise<GeneratedPhaseResult> {
    const initiative = this.requireInitiative(initiativeId);
    const result = await this.executePlannerJob<PhaseMarkdownResult>(
      job,
      buildSpecGenerationInput(initiative, step, getArtifactMarkdownMap(initiative.id, this.store.specs)),
      onToken
    );

    validatePhaseMarkdownResult(result);
    await persistPhaseMarkdownInternal({
      initiative,
      step,
      result,
      nowIso: this.now().toISOString(),
      upsertInitiative: (updatedInitiative, docs) => this.store.upsertInitiative(updatedInitiative, docs),
      specs: this.store.specs,
      upsertArtifactTrace: (trace) => this.store.upsertArtifactTrace(trace),
      markPlanningArtifactsStale: (currentInitiativeId, artifactStep) =>
        this.markPlanningArtifactsStale(currentInitiativeId, artifactStep)
    });

    const refreshedInitiative = this.requireInitiative(initiativeId);
    const reviews = await this.runAutoReviews(refreshedInitiative, step);
    return {
      markdown: result.markdown,
      reviews
    };
  }

  private async runAutoReviews(
    initiative: Initiative,
    step: InitiativeArtifactStep
  ): Promise<PlanningReviewArtifact[]> {
    const reviews: PlanningReviewArtifact[] = [];
    for (const kind of AUTO_REVIEW_KINDS_BY_STEP[step]) {
      const review = await this.executeReviewJob(initiative, kind);
      await this.store.upsertPlanningReview(review);
      reviews.push(review);
    }
    return reviews;
  }

  private async executeReviewJob(
    initiative: Initiative,
    kind: PlanningReviewKind,
    onToken?: LlmTokenHandler
  ): Promise<PlanningReviewArtifact> {
    return executeReviewJobInternal({
      initiative,
      kind,
      nowIso: this.now().toISOString(),
      validateReviewRunResult,
      executePlannerJob: (job, payload, reviewOnToken) => this.executePlannerJob(job, payload, reviewOnToken),
      getArtifactMarkdownMap: (initiativeId) => getArtifactMarkdownMap(initiativeId, this.store.specs),
      ensureArtifactTrace: (currentInitiative, step) => this.ensureArtifactTrace(currentInitiative, step),
      requireSpecUpdatedAt: (initiativeId, step) => requireSpecUpdatedAt(initiativeId, step, this.store.specs),
      requireTicketCoverageArtifact: (initiativeId) =>
        requireTicketCoverageArtifact(initiativeId, this.store.ticketCoverageArtifacts),
      getInitiativeTickets: (currentInitiative) => getInitiativeTickets(currentInitiative, this.store.tickets),
      onToken
    });
  }

  private validateCoverageMappings(result: PlanResult, coverageItems: TicketCoverageItem[]): void {
    const knownCoverageItemIds = new Set(coverageItems.map((item) => item.id));
    const assignedCoverageItemIds = new Set<string>();

    for (const phase of result.phases) {
      for (const ticket of phase.tickets) {
        if (knownCoverageItemIds.size > 0 && ticket.coverageItemIds.length === 0) {
          throw new Error(`Plan ticket "${ticket.title}" must reference at least one coverage item`);
        }

        for (const coverageItemId of ticket.coverageItemIds) {
          if (!knownCoverageItemIds.has(coverageItemId)) {
            throw new Error(`Plan ticket "${ticket.title}" references unknown coverage item "${coverageItemId}"`);
          }

          assignedCoverageItemIds.add(coverageItemId);
        }
      }
    }

    const uncoveredCoverageItemIds = new Set<string>();
    for (const coverageItemId of result.uncoveredCoverageItemIds) {
      if (!knownCoverageItemIds.has(coverageItemId)) {
        throw new Error(`Plan uncoveredCoverageItemIds references unknown coverage item "${coverageItemId}"`);
      }

      if (assignedCoverageItemIds.has(coverageItemId)) {
        throw new Error(`Coverage item "${coverageItemId}" cannot be both assigned and uncovered`);
      }

      uncoveredCoverageItemIds.add(coverageItemId);
    }

    for (const coverageItemId of knownCoverageItemIds) {
      if (!assignedCoverageItemIds.has(coverageItemId) && !uncoveredCoverageItemIds.has(coverageItemId)) {
        throw new Error(`Coverage item "${coverageItemId}" is missing from the generated plan`);
      }
    }
  }

  private requireInitiative(initiativeId: string): Initiative {
    const initiative = this.store.initiatives.get(initiativeId);
    if (!initiative) {
      throw new Error(`Initiative ${initiativeId} not found`);
    }

    return initiative;
  }

  private async ensureArtifactTrace(
    initiative: Initiative,
    step: InitiativeArtifactStep
  ) {
    return ensureArtifactTraceInternal({
      initiative,
      step,
      specs: this.store.specs,
      artifactTraces: this.store.artifactTraces,
      nowIso: this.now().toISOString(),
      validatePhaseMarkdownResult,
      buildSpecGenerationInput: (currentInitiative, refinementStep) =>
        buildSpecGenerationInput(
          currentInitiative,
          refinementStep,
          getArtifactMarkdownMap(currentInitiative.id, this.store.specs)
        ),
      executePlannerJob: (job, payload, plannerOnToken) => this.executePlannerJob(job, payload, plannerOnToken),
      upsertArtifactTrace: (trace) => this.store.upsertArtifactTrace(trace)
    });
  }

  private async executePlannerJob<T>(
    job: PlannerJob,
    input: ClarifyHelpInput | PhaseCheckInput | ReviewRunInput | SpecGenInput | PlanInput | TriageInput,
    onToken?: LlmTokenHandler
  ): Promise<T> {
    const config = getResolvedPlannerConfig(this.store);
    const agentsMd = await loadPlannerAgentsMd(this.rootDir, config.repoInstructionFile);

    return executePlannerJobInternal<T>({
      llmClient: this.llmClient,
      config,
      job,
      payload: input,
      agentsMd,
      onToken
    });
  }
}
