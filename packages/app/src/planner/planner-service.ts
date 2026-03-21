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
  BRIEF_CONSULTATION_REQUIRED_MESSAGE,
  buildRequiredBriefConsultationResult,
  requiresInitialBriefConsultation
} from "./brief-consultation.js";
import { getImpactedReviewKinds } from "./planning-reviews.js";
import { PlannerConflictError } from "./planner-errors.js";
import {
  blockWorkflowAtStep,
  createInitiativeWorkflow,
  getRefinementAssumptions,
  updateRefinementState
} from "./workflow-state.js";
import {
  buildPhaseCheckInput,
  buildSpecGenerationInput,
  getArtifactMarkdownMap,
  getSavedContext,
  requireSpecMarkdown,
  requireSpecUpdatedAt
} from "./internal/context.js";
import { toStructuredPlannerError } from "./internal/error-shaping.js";
import { resolveValidatedPlanResult } from "./internal/plan-generation-job.js";
import { buildPendingTicketPlanArtifact, commitPendingTicketPlanArtifact } from "./internal/plan-job.js";
import { validateCoverageMappings } from "./internal/plan-validation.js";
import { canonicalizePhaseCheckResult, resolveValidatedPhaseCheckResult } from "./internal/phase-check-job.js";
import { scanRepo } from "./internal/repo-scanner.js";
import {
  buildPersistedTicketCoverageArtifact,
  buildTicketCoverageInput,
  persistPhaseMarkdown as persistPhaseMarkdownInternal,
} from "./internal/spec-artifacts.js";
import { createTicketFromDraft, deriveInitiativeTitle } from "./internal/ticket-factory.js";
import { normalizeInitiativeTitle } from "./internal/title-style.js";
import {
  validateClarifyHelpResult,
  validatePhaseMarkdownResult,
  validatePlanResult,
  validateTriageResult
} from "./internal/validators.js";
import {
  type PlannerServiceRuntimeContext,
  ensureArtifactTrace as ensureArtifactTraceRuntime,
  executePlannerJob as executePlannerJobRuntime,
  executeReviewJob as executeReviewJobRuntime,
  runAutoReviews as runAutoReviewsRuntime,
  shouldIncludePrdRepoContext
} from "./planner-service-runtime.js";
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
import { resolveInitiativeProjectRoot } from "../project-roots.js";

export interface PlannerServiceOptions {
  rootDir: string;
  store: ArtifactStore;
  llmClient?: LlmClient;
  fetchImpl?: typeof fetch;
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
    const initiative = this.requireInitiative(input.initiativeId);
    const projectRoot = resolveInitiativeProjectRoot(this.rootDir, initiative);
    const markdownByStep = await getArtifactMarkdownMap(initiative.id, (specId) => this.store.readSpecMarkdown(specId));
    const savedContext = getSavedContext(initiative, input.step);
    const repoContext =
      input.step === "tech-spec" ||
      (
        input.step === "prd" &&
        shouldIncludePrdRepoContext({
          initiative,
          markdownByStep,
          savedContext
        })
      )
        ? await scanRepo(projectRoot).catch(() => undefined)
        : undefined;
    const phaseCheckInput = buildPhaseCheckInput(
      initiative,
      input.step,
      markdownByStep,
      repoContext,
      input.validationFeedback
    );
    const initialBriefConsultationRequired =
      input.step === "brief" &&
      requiresInitialBriefConsultation({
        initiative,
        briefMarkdown: markdownByStep.brief
      });
    const result: PhaseCheckResult = initialBriefConsultationRequired
      ? canonicalizePhaseCheckResult(buildRequiredBriefConsultationResult())
      : input.step === "brief"
        ? canonicalizePhaseCheckResult({
            decision: "proceed" as const,
            questions: [],
            assumptions: getRefinementAssumptions(initiative.workflow, "brief")
          })
        : await resolveValidatedPhaseCheckResult({
            phaseCheckInput,
            priorQuestions: initiative.workflow.refinements[input.step].questions,
            executePhaseCheck: (nextPhaseCheckInput) =>
              this.executePlannerJob<PhaseCheckResult>(
                REFINEMENT_JOB_BY_STEP[input.step],
                nextPhaseCheckInput,
                onToken,
                signal,
                projectRoot
              )
          });

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
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<ClarifyHelpResult> {
    const initiative = this.requireInitiative(input.initiativeId);
    const projectRoot = resolveInitiativeProjectRoot(this.rootDir, initiative);
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
      onToken,
      signal,
      projectRoot
    );

    validateClarifyHelpResult(result);
    return result;
  }

  public async runBriefJob(
    input: { initiativeId: string },
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<GeneratedPhaseResult> {
    return this.generateArtifact("brief", input.initiativeId, "brief-gen", onToken, signal);
  }

  public async runCoreFlowsJob(
    input: { initiativeId: string },
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<GeneratedPhaseResult> {
    return this.generateArtifact("core-flows", input.initiativeId, "core-flows-gen", onToken, signal);
  }

  public async runPrdJob(
    input: { initiativeId: string },
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<GeneratedPhaseResult> {
    return this.generateArtifact("prd", input.initiativeId, "prd-gen", onToken, signal);
  }

  public async runTechSpecJob(
    input: { initiativeId: string },
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<GeneratedPhaseResult> {
    return this.generateArtifact("tech-spec", input.initiativeId, "tech-spec-gen", onToken, signal);
  }

  public async runPlanningReviewJob(
    input: { initiativeId: string; kind: PlanningReviewKind },
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<PlanningReviewArtifact> {
    const initiative = this.requireInitiative(input.initiativeId);
    const review = await executeReviewJobRuntime(this.getRuntimeContext(), initiative, input.kind, onToken, signal);
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
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<PlanResult> {
    const initiative = this.requireInitiative(input.initiativeId);
    const projectRoot = resolveInitiativeProjectRoot(this.rootDir, initiative);
    const brief = await requireSpecMarkdown(initiative.id, "brief", (specId) => this.store.readSpecMarkdown(specId));
    const coreFlows = await requireSpecMarkdown(initiative.id, "core-flows", (specId) => this.store.readSpecMarkdown(specId));
    const prd = await requireSpecMarkdown(initiative.id, "prd", (specId) => this.store.readSpecMarkdown(specId));
    const techSpec = await requireSpecMarkdown(initiative.id, "tech-spec", (specId) => this.store.readSpecMarkdown(specId));
    const coverageInput = await buildTicketCoverageInput({
      initiative,
      requireSpecUpdatedAt: (currentInitiativeId, step) =>
        requireSpecUpdatedAt(currentInitiativeId, step, this.store.specs),
      ensureArtifactTrace: (currentInitiative, step) =>
        ensureArtifactTraceRuntime(this.getRuntimeContext(), currentInitiative, step, signal)
    });
    const repoContext = await scanRepo(projectRoot).catch(() => undefined);

    const planInput = {
      initiativeDescription: initiative.description,
      briefMarkdown: brief,
      coreFlowsMarkdown: coreFlows,
      prdMarkdown: prd,
      techSpecMarkdown: techSpec,
      coverageItems: coverageInput.items,
      repoContext
    } satisfies PlanInput;

    const result = await resolveValidatedPlanResult({
      planInput,
      executePlan: (nextPlanInput) =>
        this.executePlannerJob<PlanResult>("plan", nextPlanInput, onToken, signal, projectRoot),
      executePlanRepair: (nextPlanInput) =>
        this.executePlannerJob<PlanResult>("plan-repair", nextPlanInput, onToken, signal, projectRoot),
      validateResult: (nextResult) => {
        validatePlanResult(nextResult);
        validateCoverageMappings(nextResult, coverageInput.items);
      }
    });

    const nowIso = this.now().toISOString();
    const pendingPlan = buildPendingTicketPlanArtifact({
      initiativeId: initiative.id,
      result,
      coverageItems: coverageInput.items,
      sourceUpdatedAts: coverageInput.sourceUpdatedAts,
      nowIso
    });
    await this.store.upsertPendingTicketPlanArtifact(pendingPlan);

    const review = await executeReviewJobRuntime(
      this.getRuntimeContext(),
      initiative,
      "ticket-coverage-review",
      undefined,
      signal
    );
    await this.store.upsertPlanningReview(review);

    if (review.status === "blocked") {
      await this.store.upsertInitiative({
        ...this.requireInitiative(initiative.id),
        workflow: blockWorkflowAtStep(this.requireInitiative(initiative.id).workflow, "validation", nowIso),
        updatedAt: nowIso
      });
      return result;
    }

    await commitPendingTicketPlanArtifact({
      initiative: this.requireInitiative(initiative.id),
      pendingPlan,
      nowIso,
      idGenerator: this.idGenerator,
      upsertTicket: (ticket) => this.store.upsertTicket(ticket),
      deleteTicket: (ticketId) => this.store.deleteTicket(ticketId),
      getTicket: (ticketId) => this.store.tickets.get(ticketId),
      listInitiativeTickets: (initiativeId) =>
        Array.from(this.store.tickets.values()).filter((ticket) => ticket.initiativeId === initiativeId),
      upsertInitiative: (updatedInitiative) => this.store.upsertInitiative(updatedInitiative),
      deletePendingTicketPlanArtifact: (initiativeId) => this.store.deletePendingTicketPlanArtifact(initiativeId),
      upsertTicketCoverageArtifact: (artifact) => this.store.upsertTicketCoverageArtifact(artifact),
      buildTicketCoverageArtifact: ({ initiativeId, items, uncoveredItemIds, sourceUpdatedAts, nowIso: artifactNowIso }) =>
        buildPersistedTicketCoverageArtifact({
          initiativeId,
          items,
          uncoveredItemIds,
          sourceUpdatedAts,
          nowIso: artifactNowIso
        }),
    });

    return result;
  }

  public async commitPendingPlan(input: { initiativeId: string }): Promise<void> {
    const initiative = this.requireInitiative(input.initiativeId);
    const pendingPlan = this.store.pendingTicketPlans.get(`${initiative.id}:pending-ticket-plan`);
    if (!pendingPlan) {
      throw new Error(`Pending ticket plan is missing for initiative ${initiative.id}`);
    }

    await commitPendingTicketPlanArtifact({
      initiative,
      pendingPlan,
      nowIso: this.now().toISOString(),
      idGenerator: this.idGenerator,
      upsertTicket: (ticket) => this.store.upsertTicket(ticket),
      deleteTicket: (ticketId) => this.store.deleteTicket(ticketId),
      getTicket: (ticketId) => this.store.tickets.get(ticketId),
      listInitiativeTickets: (initiativeId) =>
        Array.from(this.store.tickets.values()).filter((ticket) => ticket.initiativeId === initiativeId),
      upsertInitiative: (updatedInitiative) => this.store.upsertInitiative(updatedInitiative),
      deletePendingTicketPlanArtifact: (initiativeId) => this.store.deletePendingTicketPlanArtifact(initiativeId),
      upsertTicketCoverageArtifact: (artifact) => this.store.upsertTicketCoverageArtifact(artifact),
      buildTicketCoverageArtifact: ({ initiativeId, items, uncoveredItemIds, sourceUpdatedAts, nowIso }) =>
        buildPersistedTicketCoverageArtifact({
          initiativeId,
          items,
          uncoveredItemIds,
          sourceUpdatedAts,
          nowIso
        })
    });
  }

  public async runTriageJob(
    input: { description: string },
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<
    | { decision: "too-large"; reason: string; initiative: Initiative }
    | { decision: "ok"; reason: string; ticket: Ticket }
  > {
    const result = await this.executePlannerJob<TriageResult>("triage", input, onToken, signal);
    validateTriageResult(result);

    const normalizedDecision = result.decision.toLowerCase();
    const nowIso = this.now().toISOString();

    if (normalizedDecision === "too-large") {
      const initiative = await this.createDraftInitiative({ description: input.description });
      const titledInitiative =
        result.initiativeTitle?.trim() && normalizeInitiativeTitle(result.initiativeTitle) !== initiative.title
          ? { ...initiative, title: normalizeInitiativeTitle(result.initiativeTitle), updatedAt: nowIso }
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
    details?: unknown;
  } {
    return toStructuredPlannerError(error);
  }

  private async generateArtifact(
    step: RefinementStep,
    initiativeId: string,
    job: Extract<PlannerJob, "brief-gen" | "core-flows-gen" | "prd-gen" | "tech-spec-gen">,
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<GeneratedPhaseResult> {
    const initiative = this.requireInitiative(initiativeId);
    const projectRoot = resolveInitiativeProjectRoot(this.rootDir, initiative);
    const markdownByStep = await getArtifactMarkdownMap(initiative.id, (specId) => this.store.readSpecMarkdown(specId));
    const repoContext =
      step === "tech-spec"
        ? await scanRepo(projectRoot).catch(() => undefined)
        : undefined;
    const isInitialBriefDraft = step === "brief" && markdownByStep.brief.trim().length === 0;
    if (
      step === "brief" &&
      requiresInitialBriefConsultation({
        initiative,
        briefMarkdown: markdownByStep.brief
      })
    ) {
      throw new PlannerConflictError(BRIEF_CONSULTATION_REQUIRED_MESSAGE);
    }

    const result = await this.executePlannerJob<PhaseMarkdownResult>(
      job,
      buildSpecGenerationInput(initiative, step, markdownByStep, repoContext),
      onToken,
      signal,
      projectRoot
    );

    validatePhaseMarkdownResult(result, { requireInitiativeTitle: step === "brief" });
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
    const reviews = await runAutoReviewsRuntime(this.getRuntimeContext(), refreshedInitiative, step, {
      useIntakeResolvedBriefReview: isInitialBriefDraft
    }, signal);
    return {
      markdown: result.markdown,
      reviews
    };
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
    input: ClarifyHelpInput | PhaseCheckInput | ReviewRunInput | SpecGenInput | PlanInput | TriageInput,
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
}
