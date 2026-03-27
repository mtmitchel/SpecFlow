import type { LlmClient, LlmTokenHandler } from "../llm/client.js";
import { ArtifactStore } from "../store/artifact-store.js";
import type {
  Initiative,
  InitiativeArtifactStep,
  PendingTicketPlanArtifact,
  PlanningReviewArtifact,
  PlanningReviewKind,
} from "../types/entities.js";
import { AUTO_REVIEW_KINDS_BY_STEP } from "./planning-reviews.js";
import { loadPlannerAgentsMd } from "./internal/agents-md.js";
import { buildSpecGenerationInput, getArtifactMarkdownMap, getInitiativeTickets, requireSpecUpdatedAt } from "./internal/context.js";
import { getResolvedPlannerConfig } from "./internal/config.js";
import { executePlannerJob as executePlannerJobInternal } from "./internal/job-executor.js";
import { scanRepo } from "./internal/repo-scanner.js";
import { buildReviewFindings, executeReviewJob as executeReviewJobInternal } from "./internal/review-job.js";
import {
  ensureArtifactTrace as ensureArtifactTraceInternal,
  requireTicketCoverageArtifact,
} from "./internal/spec-artifacts.js";
import { validatePhaseMarkdownResult, validateReviewRunResult } from "./internal/validators.js";
import type {
  PlanInput,
  ReviewRunInput,
  ReviewRunResult,
  SpecGenInput,
  ClarifyHelpInput,
  PhaseCheckInput,
  TriageInput,
} from "./types.js";
import type { PlannerJob } from "./prompt-builder.js";
import { resolveInitiativeProjectRoot } from "../project-roots.js";

const INITIAL_BRIEF_REVIEW_SUMMARY =
  "Brief intake resolved the blockers for the initial brief draft.";

const PRD_REPO_CONTEXT_SIGNAL_TERMS = [
  "existing system",
  "existing-system",
  "compatibility",
  "compatible",
  "migration",
  "migrate",
  "integrate",
  "integration",
  "extend",
];

export interface PlannerServiceRuntimeContext {
  rootDir: string;
  store: ArtifactStore;
  llmClient: LlmClient;
  fetchImpl: typeof fetch;
  now: () => Date;
}

export const shouldIncludePrdRepoContext = (input: {
  initiative: Initiative;
  markdownByStep: Record<InitiativeArtifactStep, string>;
  savedContext: Record<string, string | string[] | boolean>;
}): boolean => {
  const contextText = [
    input.initiative.description,
    input.markdownByStep.brief,
    input.markdownByStep["core-flows"],
    JSON.stringify(input.savedContext, null, 2),
  ]
    .join("\n")
    .toLowerCase();

  return PRD_REPO_CONTEXT_SIGNAL_TERMS.some((term) => contextText.includes(term));
};

const buildInitialBriefReview = (
  context: PlannerServiceRuntimeContext,
  initiative: Initiative,
): PlanningReviewArtifact => {
  const nowIso = context.now().toISOString();

  return {
    id: `${initiative.id}:brief-review`,
    initiativeId: initiative.id,
    kind: "brief-review",
    status: "passed",
    summary: INITIAL_BRIEF_REVIEW_SUMMARY,
    findings: [],
    sourceUpdatedAts: {
      brief: requireSpecUpdatedAt(initiative.id, "brief", context.store.specs),
    },
    overrideReason: null,
    reviewedAt: nowIso,
    updatedAt: nowIso,
  };
};

export const executePlannerJob = async <T>(
  context: PlannerServiceRuntimeContext,
  job: PlannerJob,
  input: ClarifyHelpInput | PhaseCheckInput | ReviewRunInput | SpecGenInput | PlanInput | TriageInput,
  onToken?: LlmTokenHandler,
  signal?: AbortSignal,
  projectRoot = context.rootDir,
): Promise<T> => {
  const config = await getResolvedPlannerConfig(context.store, context.fetchImpl);
  const agentsMd = await loadPlannerAgentsMd(projectRoot, config.repoInstructionFile);

  return executePlannerJobInternal<T>({
    llmClient: context.llmClient,
    config,
    job,
    payload: input,
    agentsMd,
    onToken,
    signal,
  });
};

export const ensureArtifactTrace = async (
  context: PlannerServiceRuntimeContext,
  initiative: Initiative,
  step: InitiativeArtifactStep,
  signal?: AbortSignal,
) =>
  ensureArtifactTraceInternal({
    initiative,
    step,
    specs: context.store.specs,
    artifactTraces: context.store.artifactTraces,
    nowIso: context.now().toISOString(),
    validatePhaseMarkdownResult,
    readSpecMarkdown: (specId) => context.store.readSpecMarkdown(specId),
    buildSpecGenerationInput: (currentInitiative, refinementStep) => {
      const projectRoot = resolveInitiativeProjectRoot(context.rootDir, currentInitiative);
      return Promise.all([
        getArtifactMarkdownMap(currentInitiative.id, (specId) => context.store.readSpecMarkdown(specId)),
        refinementStep === "tech-spec"
          ? scanRepo(projectRoot).catch((err: unknown) => {
              console.warn("[planner] repo context unavailable:", (err as Error).message);
              return undefined;
            })
          : Promise.resolve(undefined),
      ]).then(([markdownByStep, repoContext]) =>
        buildSpecGenerationInput(currentInitiative, refinementStep, markdownByStep, repoContext),
      );
    },
    executePlannerJob: (job, payload, plannerOnToken) => {
      const projectRoot = resolveInitiativeProjectRoot(context.rootDir, initiative);
      return executePlannerJob(context, job, payload, plannerOnToken, signal, projectRoot);
    },
    upsertArtifactTrace: (trace) => context.store.upsertArtifactTrace(trace),
  });

const executeTicketCoverageReviewForPendingPlan = async (
  context: PlannerServiceRuntimeContext,
  initiative: Initiative,
  pendingPlan: PendingTicketPlanArtifact,
  onToken?: LlmTokenHandler,
  signal?: AbortSignal,
): Promise<PlanningReviewArtifact> => {
  const projectRoot = resolveInitiativeProjectRoot(context.rootDir, initiative);
  const markdownByStep = await getArtifactMarkdownMap(initiative.id, (specId) => context.store.readSpecMarkdown(specId));
  const traceOutlines: ReviewRunInput["traceOutlines"] = {};

  for (const step of ["brief", "core-flows", "prd", "tech-spec"] as const) {
    if (!markdownByStep[step]?.trim()) {
      throw new Error(`Cannot run ticket coverage review before ${step} exists`);
    }

    const trace = await ensureArtifactTrace(context, initiative, step, signal);
    traceOutlines[step] = { sections: trace.sections };
  }

  const result = await executePlannerJob<ReviewRunResult>(
    context,
    "review",
    {
      initiativeDescription: initiative.description,
      kind: "ticket-coverage-review",
      briefMarkdown: markdownByStep.brief,
      coreFlowsMarkdown: markdownByStep["core-flows"],
      prdMarkdown: markdownByStep.prd,
      techSpecMarkdown: markdownByStep["tech-spec"],
      traceOutlines,
      coverageItems: pendingPlan.coverageItems,
      uncoveredCoverageItemIds: pendingPlan.uncoveredItemIds,
      tickets: pendingPlan.phases.flatMap((phase) => phase.tickets),
    },
    onToken,
    signal,
    projectRoot,
  );

  validateReviewRunResult(result);

  const nowIso = context.now().toISOString();
  return {
    id: `${initiative.id}:ticket-coverage-review`,
    initiativeId: initiative.id,
    kind: "ticket-coverage-review",
    status: result.blockers.length > 0 ? "blocked" : "passed",
    summary: result.summary,
    findings: buildReviewFindings("ticket-coverage-review", result),
    sourceUpdatedAts: {
      ...pendingPlan.sourceUpdatedAts,
      validation: nowIso,
    },
    overrideReason: null,
    reviewedAt: nowIso,
    updatedAt: nowIso,
  };
};

export const executeReviewJob = async (
  context: PlannerServiceRuntimeContext,
  initiative: Initiative,
  kind: PlanningReviewKind,
  onToken?: LlmTokenHandler,
  signal?: AbortSignal,
): Promise<PlanningReviewArtifact> => {
  const projectRoot = resolveInitiativeProjectRoot(context.rootDir, initiative);
  if (kind === "ticket-coverage-review") {
    const pendingPlan = context.store.pendingTicketPlans.get(`${initiative.id}:pending-ticket-plan`);
    if (pendingPlan) {
      return executeTicketCoverageReviewForPendingPlan(context, initiative, pendingPlan, onToken, signal);
    }
  }

  return executeReviewJobInternal({
    initiative,
    kind,
    nowIso: context.now().toISOString(),
    validateReviewRunResult,
    executePlannerJob: (job, payload, reviewOnToken) =>
      executePlannerJob(context, job, payload, reviewOnToken, signal, projectRoot),
    getArtifactMarkdownMap: (initiativeId) =>
      getArtifactMarkdownMap(initiativeId, (specId) => context.store.readSpecMarkdown(specId)),
    ensureArtifactTrace: (currentInitiative, step) => ensureArtifactTrace(context, currentInitiative, step, signal),
    requireSpecUpdatedAt: (initiativeId, step) => requireSpecUpdatedAt(initiativeId, step, context.store.specs),
    requireTicketCoverageArtifact: (initiativeId) =>
      requireTicketCoverageArtifact(initiativeId, context.store.ticketCoverageArtifacts),
    getInitiativeTickets: (currentInitiative) => getInitiativeTickets(currentInitiative, context.store.tickets),
    onToken,
  });
};

export const runAutoReviews = async (
  context: PlannerServiceRuntimeContext,
  initiative: Initiative,
  step: InitiativeArtifactStep,
  options: { useIntakeResolvedBriefReview?: boolean } = {},
  signal?: AbortSignal,
): Promise<PlanningReviewArtifact[]> => {
  const reviews: PlanningReviewArtifact[] = [];
  for (const kind of AUTO_REVIEW_KINDS_BY_STEP[step]) {
    const review =
      options.useIntakeResolvedBriefReview && kind === "brief-review"
        ? buildInitialBriefReview(context, initiative)
        : await executeReviewJob(context, initiative, kind, undefined, signal);
    await context.store.upsertPlanningReview(review);
    reviews.push(review);
  }
  return reviews;
};
