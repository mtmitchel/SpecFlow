import type {
  Initiative,
  InitiativePlanningQuestion,
  InitiativeRefinementState,
  PlanningReviewArtifact,
  PlanningReviewFindingType,
} from "../../../types.js";
import type { SpecStep } from "./shared.js";

export const VALIDATION_REFINEMENT_STEPS: SpecStep[] = [
  "brief",
  "core-flows",
  "prd",
  "tech-spec"
];
const VALIDATION_FEEDBACK_FINDING_TYPES: PlanningReviewFindingType[] = [
  "blocker",
  "traceability-gap",
  "recommended-fix",
];
const MAX_VALIDATION_FEEDBACK_FINDINGS = 8;

const dedupeQuestions = (
  questions: InitiativePlanningQuestion[]
): InitiativePlanningQuestion[] => {
  const byId = new Map<string, InitiativePlanningQuestion>();
  for (const question of questions) {
    byId.set(question.id, question);
  }
  return Array.from(byId.values());
};

export const buildValidationRefinement = (
  initiative: Initiative
): InitiativeRefinementState => {
  const questions = VALIDATION_REFINEMENT_STEPS.flatMap(
    (step) => initiative.workflow.refinements[step].questions
  );
  const answers = VALIDATION_REFINEMENT_STEPS.reduce<Record<string, string | string[] | boolean>>(
    (accumulator, step) => ({
      ...accumulator,
      ...initiative.workflow.refinements[step].answers
    }),
    {}
  );
  const defaultAnswerQuestionIds = Array.from(
    new Set(
      VALIDATION_REFINEMENT_STEPS.flatMap(
        (step) => initiative.workflow.refinements[step].defaultAnswerQuestionIds
      )
    )
  );
  const baseAssumptions = Array.from(
    new Set(
      VALIDATION_REFINEMENT_STEPS.flatMap(
        (step) => initiative.workflow.refinements[step].baseAssumptions
      )
    )
  );
  const checkedAt = VALIDATION_REFINEMENT_STEPS.map(
    (step) => initiative.workflow.refinements[step].checkedAt
  ).find(Boolean) ?? null;

  return {
    questions: dedupeQuestions(questions),
    history: dedupeQuestions(questions),
    answers,
    defaultAnswerQuestionIds,
    baseAssumptions,
    preferredSurface: null,
    checkedAt
  };
};

export const buildValidationReviewFeedback = (
  review: PlanningReviewArtifact | undefined
): string | null => {
  if (!review || review.status !== "blocked") {
    return null;
  }

  const lines = [
    review.summary.trim(),
    ...review.findings
      .filter((finding) => VALIDATION_FEEDBACK_FINDING_TYPES.includes(finding.type))
      .slice(0, MAX_VALIDATION_FEEDBACK_FINDINGS)
      .map((finding) => finding.message.trim()),
  ].filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  return lines.join("\n");
};

export const partitionValidationAnswersByStep = (input: {
  initiative: Initiative;
  answers: Record<string, string | string[] | boolean>;
  defaultAnswerQuestionIds: string[];
}): Record<
  SpecStep,
    {
      answers: Record<string, string | string[] | boolean>;
      defaultAnswerQuestionIds: string[];
    }
  > => {
  const grouped: Record<
    SpecStep,
    {
      answers: Record<string, string | string[] | boolean>;
      defaultAnswerQuestionIds: string[];
    }
  > = {
    brief: { answers: {}, defaultAnswerQuestionIds: [] },
    "core-flows": { answers: {}, defaultAnswerQuestionIds: [] },
    prd: { answers: {}, defaultAnswerQuestionIds: [] },
    "tech-spec": { answers: {}, defaultAnswerQuestionIds: [] }
  };

  for (const step of VALIDATION_REFINEMENT_STEPS) {
    const questionIds = new Set(
      [
        ...input.initiative.workflow.refinements[step].questions,
        ...(input.initiative.workflow.refinements[step].history ?? [])
      ].map((question) => question.id)
    );

    for (const [questionId, answer] of Object.entries(input.answers)) {
      if (questionIds.has(questionId)) {
        grouped[step].answers[questionId] = answer;
      }
    }

    grouped[step].defaultAnswerQuestionIds = input.defaultAnswerQuestionIds.filter((questionId) =>
      questionIds.has(questionId)
    );
  }

  return grouped;
};
