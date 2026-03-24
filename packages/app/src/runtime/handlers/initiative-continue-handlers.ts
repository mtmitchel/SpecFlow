import type {
  InitiativeArtifactStepContinuePayload,
  InitiativeValidationDraftByStep,
  InitiativeArtifactStepContinueResult,
  InitiativeValidationContinuePayload,
  InitiativeValidationContinueResult,
  ValidationFeedbackByStep,
} from "../../types/contracts.js";
import type {
  Initiative,
  InitiativeArtifactStep,
  InitiativePlanningQuestion,
  InitiativeRefinementState,
  PlanningReviewArtifact,
} from "../../types/entities.js";
import {
  isSemanticallyRepeatedConcern,
  materiallyNarrowsDecisionBoundary,
} from "../../planner/internal/refinement-question-comparison.js";
import { getReviewResolutionStep } from "../../planner/review-resolution.js";
import { updateRefinementState } from "../../planner/workflow-state.js";
import type { ProgressSink, SpecFlowRuntime } from "../types.js";
import { badRequest } from "../errors.js";
import { readInitiative } from "./shared.js";
import {
  generateInitiativeArtifact,
  generateInitiativePlan,
  runInitiativePhaseCheck,
  saveInitiativeRefinement,
} from "./initiative-handlers.js";

type ArtifactStep = "brief" | "core-flows" | "prd" | "tech-spec";

const SPEC_STEP_TYPES: ArtifactStep[] = ["brief", "core-flows", "prd", "tech-spec"];

type SubmittedQuestionsByStep = Partial<Record<ArtifactStep, InitiativePlanningQuestion[]>>;

const getValidationFeedbackSteps = (
  feedbackByStep: ValidationFeedbackByStep | undefined
): ArtifactStep[] =>
  SPEC_STEP_TYPES.filter((step) => {
    const feedback = feedbackByStep?.[step];
    return typeof feedback === "string" && feedback.trim().length > 0;
  });

const getValidationFeedbackForStep = (
  step: ArtifactStep,
  feedbackByStep: ValidationFeedbackByStep | undefined,
  fallbackFeedback?: string | null
): string | undefined => {
  if (getValidationFeedbackSteps(feedbackByStep).length > 0) {
    const scopedFeedback = feedbackByStep?.[step];
    return typeof scopedFeedback === "string" && scopedFeedback.trim().length > 0
      ? scopedFeedback.trim()
      : undefined;
  }

  const trimmedFallback = fallbackFeedback?.trim();
  return trimmedFallback && trimmedFallback.length > 0 ? trimmedFallback : undefined;
};

const isArtifactStep = (value: unknown): value is InitiativeArtifactStep =>
  typeof value === "string" && SPEC_STEP_TYPES.includes(value as ArtifactStep);

const collectSubmittedQuestionsByStep = (
  initiative: Initiative,
  draftByStep: InitiativeValidationDraftByStep | undefined,
): SubmittedQuestionsByStep =>
  Object.fromEntries(
    SPEC_STEP_TYPES.map((step) => {
      const draft = draftByStep?.[step];
      if (!draft) {
        return [step, []];
      }

      const submittedQuestionIds = new Set([
        ...Object.keys(draft.answers),
        ...draft.defaultAnswerQuestionIds,
      ]);
      const refinement = initiative.workflow.refinements[step];
      const questionById = new Map(
        [...(refinement.history ?? []), ...refinement.questions].map((question) => [question.id, question]),
      );

      return [
        step,
        Array.from(submittedQuestionIds)
          .map((questionId) => questionById.get(questionId))
          .filter((question): question is InitiativePlanningQuestion => Boolean(question)),
      ];
    }),
  ) as SubmittedQuestionsByStep;

const filterLoopedQuestions = (
  questions: InitiativePlanningQuestion[],
  submittedQuestions: InitiativePlanningQuestion[],
): InitiativePlanningQuestion[] => {
  if (submittedQuestions.length === 0) {
    return questions;
  }

  return questions.filter((question) => {
    const matchedQuestion = submittedQuestions.find((submittedQuestion) =>
      question.id === submittedQuestion.id ||
      question.reopensQuestionIds?.includes(submittedQuestion.id) ||
      isSemanticallyRepeatedConcern(question, submittedQuestion),
    );

    if (!matchedQuestion) {
      return true;
    }

    return materiallyNarrowsDecisionBoundary(question, matchedQuestion);
  });
};

const buildRetainedHistory = (
  snapshot: InitiativeRefinementState,
  nextQuestions: InitiativePlanningQuestion[],
): InitiativePlanningQuestion[] => {
  const historyById = new Map((snapshot.history ?? []).map((question) => [question.id, question]));
  for (const question of snapshot.questions) {
    historyById.set(question.id, question);
  }
  for (const question of nextQuestions) {
    historyById.set(question.id, question);
  }
  return Array.from(historyById.values());
};

const persistFilteredValidationQuestions = async (input: {
  runtime: SpecFlowRuntime;
  initiativeId: string;
  step: ArtifactStep;
  snapshot: InitiativeRefinementState;
  questions: InitiativePlanningQuestion[];
}): Promise<void> => {
  const initiative = readInitiative(input.runtime, input.initiativeId);
  const currentRefinement = initiative.workflow.refinements[input.step];
  const nowIso = new Date().toISOString();

  await input.runtime.store.upsertInitiative({
    ...initiative,
    workflow: updateRefinementState(initiative.workflow, input.step, {
      questions: input.questions,
      history: buildRetainedHistory(input.snapshot, input.questions),
      preferredSurface: input.questions.length > 0 ? "questions" : "review",
      checkedAt: currentRefinement.checkedAt,
    }),
    updatedAt: nowIso,
  });
};

const buildValidationReviewFeedback = (
  review: PlanningReviewArtifact | undefined
): string | null => {
  if (!review || review.status !== "blocked") {
    return null;
  }

  const lines = [
    review.summary.trim(),
    ...review.findings
      .filter((finding) =>
        finding.type === "blocker" ||
        finding.type === "traceability-gap" ||
        finding.type === "recommended-fix"
      )
      .map((finding) => finding.message.trim())
      .filter(Boolean)
  ];

  return lines.length > 0 ? Array.from(new Set(lines)).join("\n") : null;
};

const buildValidationReviewFeedbackByStep = (
  review: PlanningReviewArtifact | undefined
): ValidationFeedbackByStep => {
  if (!review || review.status !== "blocked") {
    return {};
  }

  const messagesByStep = new Map<ArtifactStep, string[]>();

  for (const finding of review.findings) {
    const directArtifact = finding.relatedArtifacts.find((artifact) =>
      isArtifactStep(artifact)
    );
    const resolvedArtifact = directArtifact ?? getReviewResolutionStep(finding);
    if (!isArtifactStep(resolvedArtifact)) {
      continue;
    }

    const currentMessages = messagesByStep.get(resolvedArtifact) ?? [];
    currentMessages.push(finding.message.trim());
    messagesByStep.set(resolvedArtifact, currentMessages);
  }

  return Object.fromEntries(
    Array.from(messagesByStep.entries())
      .map(([step, messages]) => [step, Array.from(new Set(messages.filter(Boolean))).join("\n")])
      .filter((entry): entry is [ArtifactStep, string] => entry[1].length > 0)
  ) as ValidationFeedbackByStep;
};

const rerunValidationBlockedSteps = async (input: {
  runtime: SpecFlowRuntime;
  initiativeId: string;
  feedbackByStep?: ValidationFeedbackByStep;
  fallbackFeedback?: string | null;
  submittedQuestionsByStep?: SubmittedQuestionsByStep;
  signal?: AbortSignal;
}): Promise<{
  blockedSteps: ArtifactStep[];
  suppressedLoopSteps: ArtifactStep[];
}> => {
  const scopedSteps = getValidationFeedbackSteps(input.feedbackByStep);
  const stepsToCheck = scopedSteps.length > 0 ? scopedSteps : SPEC_STEP_TYPES;
  const blockedSteps: ArtifactStep[] = [];
  const suppressedLoopSteps: ArtifactStep[] = [];

  for (const step of stepsToCheck) {
    const initiativeBeforeCheck = readInitiative(input.runtime, input.initiativeId);
    const refinementSnapshot = initiativeBeforeCheck.workflow.refinements[step];
    const result = await runInitiativePhaseCheck(
      input.runtime,
      input.initiativeId,
      step,
      {
        validationFeedback: getValidationFeedbackForStep(
          step,
          input.feedbackByStep,
          input.fallbackFeedback
        ),
      },
      input.signal
    );

    if (result.decision === "ask") {
      const filteredQuestions = filterLoopedQuestions(
        result.questions,
        input.submittedQuestionsByStep?.[step] ?? [],
      );
      if (filteredQuestions.length !== result.questions.length) {
        await persistFilteredValidationQuestions({
          runtime: input.runtime,
          initiativeId: input.initiativeId,
          step,
          snapshot: refinementSnapshot,
          questions: filteredQuestions,
        });
      }

      if (filteredQuestions.length > 0) {
        blockedSteps.push(step);
      } else {
        suppressedLoopSteps.push(step);
      }
    }
  }

  return {
    blockedSteps,
    suppressedLoopSteps,
  };
};

export const continueInitiativeArtifactStep = async (
  runtime: SpecFlowRuntime,
  initiativeId: string,
  step: string,
  body: InitiativeArtifactStepContinuePayload,
  onToken?: ProgressSink,
  signal?: AbortSignal
): Promise<InitiativeArtifactStepContinueResult> => {
  if (!SPEC_STEP_TYPES.includes(step as ArtifactStep)) {
    throw badRequest("Unsupported refinement step");
  }

  const artifactStep = step as ArtifactStep;
  await saveInitiativeRefinement(runtime, initiativeId, artifactStep, body.draft);

  const result = await runInitiativePhaseCheck(
    runtime,
    initiativeId,
    artifactStep,
    undefined,
    signal
  );
  if (result.decision === "ask") {
    return {
      ...result,
      generated: false,
    };
  }

  const generated = await generateInitiativeArtifact(
    runtime,
    initiativeId,
    artifactStep,
    onToken,
    signal
  );

  return {
    ...result,
    generated: true,
    markdown: generated.markdown,
    reviews: generated.reviews,
  };
};

export const continueInitiativeValidation = async (
  runtime: SpecFlowRuntime,
  initiativeId: string,
  body: InitiativeValidationContinuePayload,
  onToken?: ProgressSink,
  signal?: AbortSignal,
  onStatus?: (message: string) => Promise<void> | void
): Promise<InitiativeValidationContinueResult> => {
  for (const step of SPEC_STEP_TYPES) {
    const draft = body.draftByStep?.[step];
    if (!draft) {
      continue;
    }

    const initiative = readInitiative(runtime, initiativeId);
    await saveInitiativeRefinement(runtime, initiativeId, step, {
      answers: draft.answers,
      defaultAnswerQuestionIds: draft.defaultAnswerQuestionIds,
      preferredSurface:
        draft.preferredSurface ?? initiative.workflow.refinements[step].preferredSurface ?? null,
    });
  }

  const submittedQuestionsByStep = collectSubmittedQuestionsByStep(
    readInitiative(runtime, initiativeId),
    body.draftByStep,
  );
  const feedbackByStep = body.validationFeedbackByStep;
  const phaseCheckResult = await rerunValidationBlockedSteps({
    runtime,
    initiativeId,
    feedbackByStep,
    fallbackFeedback: body.validationFeedback,
    submittedQuestionsByStep,
    signal
  });

  if (phaseCheckResult.blockedSteps.length > 0) {
    return {
      decision: "ask",
      generated: false,
      blockedSteps: phaseCheckResult.blockedSteps,
    };
  }

  const plan = await generateInitiativePlan(
    runtime,
    initiativeId,
    onToken,
    signal,
    onStatus
  );

  const validationReview = runtime.store.planningReviews.get(
    `${initiativeId}:ticket-coverage-review`
  );
  if (validationReview?.status === "blocked") {
    const reviewPhaseCheckResult = await rerunValidationBlockedSteps({
      runtime,
      initiativeId,
      feedbackByStep: buildValidationReviewFeedbackByStep(validationReview),
      fallbackFeedback: buildValidationReviewFeedback(validationReview),
      submittedQuestionsByStep,
      signal
    });

    if (reviewPhaseCheckResult.blockedSteps.length > 0) {
      return {
        decision: "ask",
        generated: false,
        blockedSteps: reviewPhaseCheckResult.blockedSteps,
      };
    }

    return {
      decision: "ask",
      generated: false,
      blockedSteps: [],
    };
  }

  return {
    decision: "proceed",
    generated: true,
    blockedSteps: [],
    phases: plan.phases,
    uncoveredCoverageItemIds: plan.uncoveredCoverageItemIds,
  };
};
