import type { LlmTokenHandler } from "../../llm/client.js";
import { resolveInitiativeProjectRoot } from "../../project-roots.js";
import {
  BRIEF_CONSULTATION_REQUIRED_MESSAGE,
  buildRequiredBriefConsultationResult,
  requiresInitialBriefConsultation
} from "../brief-consultation.js";
import { PlannerConflictError } from "../planner-errors.js";
import { getRefinementAssumptions, updateRefinementState } from "../workflow-state.js";
import {
  buildPhaseCheckInput,
  buildSpecGenerationInput,
  getArtifactMarkdownMap,
  getSavedContext
} from "./context.js";
import { canonicalizePhaseCheckResult, resolveValidatedPhaseCheckResult } from "./phase-check-job.js";
import { scanRepo } from "./repo-scanner.js";
import { persistPhaseMarkdown } from "./spec-artifacts.js";
import { validateClarifyHelpResult, validatePhaseMarkdownResult } from "./validators.js";
import { runAutoReviews, shouldIncludePrdRepoContext } from "../planner-service-runtime.js";
import type { ClarifyHelpResult, PhaseCheckResult } from "../types.js";
import {
  type GenerateArtifactJob,
  type GeneratedPhaseResult,
  type PlannerServiceDependencies,
  REFINEMENT_JOB_BY_STEP
} from "./planner-service-shared.js";

export async function runPhaseCheckJob(
  service: PlannerServiceDependencies,
  input: {
    initiativeId: string;
    step: import("../types.js").RefinementStep;
    validationFeedback?: string;
  },
  onToken?: LlmTokenHandler,
  signal?: AbortSignal
): Promise<PhaseCheckResult> {
  const initiative = service.requireInitiative(input.initiativeId);
  const projectRoot = resolveInitiativeProjectRoot(service.rootDir, initiative);
  const markdownByStep = await getArtifactMarkdownMap(initiative.id, (specId) =>
    service.store.readSpecMarkdown(specId)
  );
  const savedContext = getSavedContext(initiative, input.step);
  const repoContext =
    input.step === "tech-spec" ||
    (input.step === "prd" &&
      shouldIncludePrdRepoContext({
        initiative,
        markdownByStep,
        savedContext
      }))
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
            service.executePlannerJob<PhaseCheckResult>(
              REFINEMENT_JOB_BY_STEP[input.step],
              nextPhaseCheckInput,
              onToken,
              signal,
              projectRoot
            )
        });

  const nowIso = service.now().toISOString();
  await service.store.upsertInitiative({
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

export async function runClarificationHelpJob(
  service: PlannerServiceDependencies,
  input: { initiativeId: string; questionId: string; note?: string },
  onToken?: LlmTokenHandler,
  signal?: AbortSignal
): Promise<ClarifyHelpResult> {
  const initiative = service.requireInitiative(input.initiativeId);
  const projectRoot = resolveInitiativeProjectRoot(service.rootDir, initiative);
  const question = Object.values(initiative.workflow.refinements)
    .flatMap((refinement) => refinement.questions)
    .find((item) => item.id === input.questionId);
  if (!question) {
    throw new Error(`Refinement question ${input.questionId} not found`);
  }

  const result = await service.executePlannerJob<ClarifyHelpResult>(
    "clarify-help",
    {
      initiativeDescription: initiative.description,
      savedContext: getSavedContext(initiative, question.affectedArtifact),
      question,
      note: input.note
    },
    onToken,
    signal,
    projectRoot
  );

  validateClarifyHelpResult(result);
  return result;
}

export async function generateArtifact(
  service: PlannerServiceDependencies,
  step: import("../types.js").RefinementStep,
  initiativeId: string,
  job: GenerateArtifactJob,
  onToken?: LlmTokenHandler,
  signal?: AbortSignal
): Promise<GeneratedPhaseResult> {
  const initiative = service.requireInitiative(initiativeId);
  const projectRoot = resolveInitiativeProjectRoot(service.rootDir, initiative);
  const markdownByStep = await getArtifactMarkdownMap(initiative.id, (specId) =>
    service.store.readSpecMarkdown(specId)
  );
  const repoContext =
    step === "tech-spec" ? await scanRepo(projectRoot).catch(() => undefined) : undefined;
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

  const result = await service.executePlannerJob<import("../types.js").PhaseMarkdownResult>(
    job,
    buildSpecGenerationInput(initiative, step, markdownByStep, repoContext),
    onToken,
    signal,
    projectRoot
  );

  validatePhaseMarkdownResult(result, { requireInitiativeTitle: step === "brief" });
  await persistPhaseMarkdown({
    initiative,
    step,
    result,
    nowIso: service.now().toISOString(),
    upsertInitiative: (updatedInitiative, docs) => service.store.upsertInitiative(updatedInitiative, docs),
    specs: service.store.specs,
    upsertArtifactTrace: (trace) => service.store.upsertArtifactTrace(trace),
    markPlanningArtifactsStale: (currentInitiativeId, artifactStep) =>
      service.markPlanningArtifactsStale(currentInitiativeId, artifactStep)
  });

  const refreshedInitiative = service.requireInitiative(initiativeId);
  const reviews = await runAutoReviews(
    service.getRuntimeContext(),
    refreshedInitiative,
    step,
    {
      useIntakeResolvedBriefReview: isInitialBriefDraft
    },
    signal
  );
  return {
    markdown: result.markdown,
    reviews
  };
}
