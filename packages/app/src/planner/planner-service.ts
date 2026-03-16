import { randomUUID } from "node:crypto";
import { loadEnvironment } from "../config/env.js";
import { HttpLlmClient, type LlmClient, type LlmTokenHandler } from "../llm/client.js";
import { LlmProviderError } from "../llm/errors.js";
import { ArtifactStore } from "../store/artifact-store.js";
import type {
  ArtifactTraceOutline,
  Initiative,
  InitiativeArtifactStep,
  PlanningReviewArtifact,
  PlanningReviewFinding,
  PlanningReviewFindingType,
  PlanningReviewKind,
  Ticket
} from "../types/entities.js";
import { AUTO_REVIEW_KINDS_BY_STEP, REVIEW_KIND_SOURCE_STEPS, getImpactedReviewKinds } from "./planning-reviews.js";
import {
  completeWorkflowStep,
  createInitiativeWorkflow,
  getRefinementAssumptions,
  updateRefinementState
} from "./workflow-state.js";
import { loadPlannerAgentsMd } from "./internal/agents-md.js";
import { getResolvedPlannerConfig } from "./internal/config.js";
import { executePlannerJob as executePlannerJobInternal } from "./internal/job-executor.js";
import { scanRepo } from "./internal/repo-scanner.js";
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
  ReviewRunResult,
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

const REVIEW_FINDING_ORDER: PlanningReviewFindingType[] = [
  "blocker",
  "warning",
  "traceability-gap",
  "assumption",
  "recommended-fix"
];

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
    input: {
      initiativeId: string;
      step: RefinementStep;
    },
    onToken?: LlmTokenHandler
  ): Promise<PhaseCheckResult> {
    const initiative = this.requireInitiative(input.initiativeId);
    const result = await this.executePlannerJob<PhaseCheckResult>(
      REFINEMENT_JOB_BY_STEP[input.step],
      this.buildPhaseCheckInput(initiative, input.step),
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
    input: {
      initiativeId: string;
      questionId: string;
      note?: string;
    },
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
        savedContext: this.getSavedContext(initiative, question.affectedArtifact),
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
    input: {
      initiativeId: string;
    },
    onToken?: LlmTokenHandler
  ): Promise<PlanResult> {
    const initiative = this.requireInitiative(input.initiativeId);
    const brief = this.requireSpecMarkdown(initiative.id, "brief");
    const coreFlows = this.requireSpecMarkdown(initiative.id, "core-flows");
    const prd = this.requireSpecMarkdown(initiative.id, "prd");
    const techSpec = this.requireSpecMarkdown(initiative.id, "tech-spec");
    const repoContext = await scanRepo(this.rootDir).catch(() => undefined);

    const result = await this.executePlannerJob<PlanResult>(
      "plan",
      {
        initiativeDescription: initiative.description,
        briefMarkdown: brief,
        coreFlowsMarkdown: coreFlows,
        prdMarkdown: prd,
        techSpecMarkdown: techSpec,
        repoContext
      } satisfies PlanInput,
      onToken
    );

    validatePlanResult(result);

    const nowIso = this.now().toISOString();
    const phaseIds: Initiative["phases"] = [];
    const createdTicketIds: string[] = [];
    const phaseTicketIds: string[][] = [];

    for (const [phaseIndex, phase] of result.phases.entries()) {
      const phaseId = `phase-${phaseIndex + 1}-${this.idGenerator()}`;
      phaseIds.push({
        id: phaseId,
        name: phase.name,
        order: phase.order,
        status: "active"
      });

      const idsInPhase: string[] = [];
      for (const draft of phase.tickets) {
        const ticket = createTicketFromDraft({
          initiativeId: initiative.id,
          phaseId,
          status: "backlog",
          draft,
          nowIso,
          idGenerator: this.idGenerator
        });

        await this.store.upsertTicket(ticket);
        createdTicketIds.push(ticket.id);
        idsInPhase.push(ticket.id);
      }

      phaseTicketIds.push(idsInPhase);
    }

    for (let index = 1; index < phaseTicketIds.length; index += 1) {
      const prevIds = phaseTicketIds[index - 1];
      const currentIds = phaseTicketIds[index];

      for (const id of currentIds) {
        const ticket = this.store.tickets.get(id);
        if (ticket) {
          await this.store.upsertTicket({ ...ticket, blockedBy: prevIds });
        }
      }

      for (const id of prevIds) {
        const ticket = this.store.tickets.get(id);
        if (ticket) {
          await this.store.upsertTicket({ ...ticket, blocks: [...ticket.blocks, ...currentIds] });
        }
      }
    }

    const updatedInitiative: Initiative = {
      ...initiative,
      status: "active",
      workflow: completeWorkflowStep(initiative.workflow, "tickets", nowIso),
      phases: phaseIds,
      ticketIds: Array.from(new Set([...initiative.ticketIds, ...createdTicketIds])),
      mermaidDiagram: result.mermaidDiagram ?? undefined,
      updatedAt: nowIso
    };

    await this.store.upsertInitiative(updatedInitiative);
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
    if (error instanceof LlmProviderError) {
      const statusCode =
        error.code === "invalid_api_key"
          ? 401
          : error.code === "rate_limit"
            ? 429
            : error.code === "timeout"
              ? 504
              : error.statusCode ?? 502;

      return {
        code: error.code,
        message: error.message,
        statusCode
      };
    }

    return {
      code: "planner_error",
      message: (error as Error).message ?? "Planner execution failed",
      statusCode: 500
    };
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
      this.buildSpecGenerationInput(initiative, step),
      onToken
    );

    validatePhaseMarkdownResult(result);
    await this.persistPhaseMarkdown(initiative, step, result);

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
    const sourceSteps = REVIEW_KIND_SOURCE_STEPS[kind];
    const markdownByStep = this.getArtifactMarkdownMap(initiative.id);
    const traceOutlines: ReviewRunInput["traceOutlines"] = {};
    const sourceUpdatedAts: Partial<Record<InitiativeArtifactStep, string>> = {};

    for (const step of sourceSteps) {
      if (!markdownByStep[step]?.trim()) {
        throw new Error(`Cannot run ${kind} before ${step} exists`);
      }
      const trace = await this.ensureArtifactTrace(initiative, step);
      traceOutlines[step] = { sections: trace.sections };
      sourceUpdatedAts[step] = this.requireSpecUpdatedAt(initiative.id, step);
    }

    const result = await this.executePlannerJob<ReviewRunResult>(
      "review",
      {
        initiativeDescription: initiative.description,
        kind,
        briefMarkdown: markdownByStep.brief,
        coreFlowsMarkdown: markdownByStep["core-flows"],
        prdMarkdown: markdownByStep.prd,
        techSpecMarkdown: markdownByStep["tech-spec"],
        traceOutlines
      } satisfies ReviewRunInput,
      onToken
    );

    validateReviewRunResult(result);

    const nowIso = this.now().toISOString();
    return {
      id: `${initiative.id}:${kind}`,
      initiativeId: initiative.id,
      kind,
      status: result.blockers.length > 0 ? "blocked" : "passed",
      summary: result.summary,
      findings: this.buildReviewFindings(kind, result),
      sourceUpdatedAts,
      overrideReason: null,
      reviewedAt: nowIso,
      updatedAt: nowIso
    };
  }

  private buildReviewFindings(
    kind: PlanningReviewKind,
    result: ReviewRunResult
  ): PlanningReviewFinding[] {
    const relatedArtifacts = REVIEW_KIND_SOURCE_STEPS[kind];
    const groups: Array<{ type: PlanningReviewFindingType; values: string[] }> = [
      { type: "blocker", values: result.blockers },
      { type: "warning", values: result.warnings },
      { type: "traceability-gap", values: result.traceabilityGaps },
      { type: "assumption", values: result.assumptions },
      { type: "recommended-fix", values: result.recommendedFixes }
    ];

    const findings: PlanningReviewFinding[] = [];
    for (const { type, values } of groups) {
      for (const value of values) {
        findings.push({
          id: `${kind}:${type}:${findings.length + 1}`,
          type,
          message: value,
          relatedArtifacts
        });
      }
    }

    return findings.sort(
      (left, right) => REVIEW_FINDING_ORDER.indexOf(left.type) - REVIEW_FINDING_ORDER.indexOf(right.type)
    );
  }

  private requireInitiative(initiativeId: string): Initiative {
    const initiative = this.store.initiatives.get(initiativeId);
    if (!initiative) {
      throw new Error(`Initiative ${initiativeId} not found`);
    }
    return initiative;
  }

  private getSavedContext(
    initiative: Initiative,
    step: RefinementStep
  ): Record<string, string | string[] | boolean> {
    const context: Record<string, string | string[] | boolean> = {};
    for (const phase of ["brief", "core-flows", "prd", "tech-spec"] as const) {
      const refinement = initiative.workflow.refinements[phase];
      for (const [questionId, answer] of Object.entries(refinement.answers)) {
        context[`${phase}:${questionId}`] = answer;
      }
      for (const assumption of getRefinementAssumptions(initiative.workflow, phase)) {
        context[`${phase}:assumption:${Object.keys(context).length}`] = assumption;
      }
      if (phase === step) {
        break;
      }
    }
    return context;
  }

  private buildPhaseCheckInput(initiative: Initiative, step: RefinementStep): PhaseCheckInput {
    const markdownByStep = this.getArtifactMarkdownMap(initiative.id);
    return {
      initiativeDescription: initiative.description,
      phase: step,
      briefMarkdown: markdownByStep.brief,
      coreFlowsMarkdown: markdownByStep["core-flows"],
      prdMarkdown: markdownByStep.prd,
      savedContext: this.getSavedContext(initiative, step)
    };
  }

  private buildSpecGenerationInput(initiative: Initiative, step: RefinementStep): SpecGenInput {
    const markdownByStep = this.getArtifactMarkdownMap(initiative.id);
    return {
      initiativeDescription: initiative.description,
      savedContext: this.getSavedContext(initiative, step),
      assumptions: getRefinementAssumptions(initiative.workflow, step),
      briefMarkdown: step === "brief" ? undefined : markdownByStep.brief,
      coreFlowsMarkdown:
        step === "brief" || step === "core-flows" ? undefined : markdownByStep["core-flows"],
      prdMarkdown: step === "tech-spec" ? markdownByStep.prd : undefined,
      techSpecMarkdown: step === "tech-spec" ? markdownByStep["tech-spec"] : undefined
    };
  }

  private getArtifactMarkdownMap(initiativeId: string): Record<InitiativeArtifactStep, string> {
    return {
      brief: this.store.specs.get(`${initiativeId}:brief`)?.content ?? "",
      "core-flows": this.store.specs.get(`${initiativeId}:core-flows`)?.content ?? "",
      prd: this.store.specs.get(`${initiativeId}:prd`)?.content ?? "",
      "tech-spec": this.store.specs.get(`${initiativeId}:tech-spec`)?.content ?? ""
    };
  }

  private requireSpecMarkdown(initiativeId: string, step: InitiativeArtifactStep): string {
    const markdown = this.store.specs.get(`${initiativeId}:${step}`)?.content ?? "";
    if (!markdown.trim()) {
      throw new Error(`Artifact ${step} is missing for initiative ${initiativeId}`);
    }
    return markdown;
  }

  private requireSpecUpdatedAt(initiativeId: string, step: InitiativeArtifactStep): string {
    const updatedAt = this.store.specs.get(`${initiativeId}:${step}`)?.updatedAt;
    if (!updatedAt) {
      throw new Error(`Artifact ${step} metadata is missing for initiative ${initiativeId}`);
    }
    return updatedAt;
  }

  private async ensureArtifactTrace(
    initiative: Initiative,
    step: InitiativeArtifactStep
  ): Promise<ArtifactTraceOutline> {
    const spec = this.store.specs.get(`${initiative.id}:${step}`);
    if (!spec || !spec.content.trim()) {
      throw new Error(`Artifact ${step} is missing for initiative ${initiative.id}`);
    }

    const existing = this.store.artifactTraces.get(`${initiative.id}:${step}`);
    if (existing && existing.sourceUpdatedAt === spec.updatedAt) {
      return existing;
    }

    const result = await this.executePlannerJob<PhaseMarkdownResult>(
      "trace-outline",
      {
        ...this.buildSpecGenerationInput(initiative, step),
        artifact: step,
        briefMarkdown: step === "brief" ? spec.content : this.store.specs.get(`${initiative.id}:brief`)?.content ?? "",
        coreFlowsMarkdown:
          step === "core-flows" ? spec.content : this.store.specs.get(`${initiative.id}:core-flows`)?.content ?? "",
        prdMarkdown: step === "prd" ? spec.content : this.store.specs.get(`${initiative.id}:prd`)?.content ?? "",
        techSpecMarkdown:
          step === "tech-spec" ? spec.content : this.store.specs.get(`${initiative.id}:tech-spec`)?.content ?? ""
      } as SpecGenInput & { artifact: RefinementStep },
      undefined
    );

    validatePhaseMarkdownResult(result);

    const nowIso = this.now().toISOString();
    const trace: ArtifactTraceOutline = {
      id: `${initiative.id}:${step}`,
      initiativeId: initiative.id,
      step,
      sections: result.traceOutline.sections,
      sourceUpdatedAt: spec.updatedAt,
      generatedAt: nowIso,
      updatedAt: nowIso
    };
    await this.store.upsertArtifactTrace(trace);
    return trace;
  }

  private async persistPhaseMarkdown(
    initiative: Initiative,
    step: RefinementStep,
    result: PhaseMarkdownResult
  ): Promise<void> {
    const nowIso = this.now().toISOString();
    const updatedInitiative: Initiative = {
      ...initiative,
      status: "active",
      specIds: uniqueIds([...initiative.specIds, `${initiative.id}:${step}`]),
      workflow: completeWorkflowStep(initiative.workflow, step, nowIso),
      updatedAt: nowIso
    };

    await this.store.upsertInitiative(updatedInitiative, {
      brief: step === "brief" ? result.markdown : undefined,
      coreFlows: step === "core-flows" ? result.markdown : undefined,
      prd: step === "prd" ? result.markdown : undefined,
      techSpec: step === "tech-spec" ? result.markdown : undefined
    });

    await this.markPlanningArtifactsStale(initiative.id, step);

    const refreshedSpec = this.store.specs.get(`${initiative.id}:${step}`);
    if (!refreshedSpec) {
      throw new Error(`Failed to persist ${step} for initiative ${initiative.id}`);
    }

    const trace: ArtifactTraceOutline = {
      id: `${initiative.id}:${step}`,
      initiativeId: initiative.id,
      step,
      sections: result.traceOutline.sections,
      sourceUpdatedAt: refreshedSpec.updatedAt,
      generatedAt: nowIso,
      updatedAt: nowIso
    };
    await this.store.upsertArtifactTrace(trace);
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

const uniqueIds = (values: string[]): string[] => Array.from(new Set(values));
