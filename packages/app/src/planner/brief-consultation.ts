import type {
  Initiative,
  InitiativeRefinementState
} from "../types/entities.js";
import type { PhaseCheckResult } from "./types.js";

const hasResolvedQuestion = (refinement: InitiativeRefinementState, questionId: string): boolean => {
  const answer = refinement.answers[questionId];
  const hasAnswer =
    typeof answer === "boolean" ||
    (typeof answer === "string" && answer.trim().length > 0) ||
    (Array.isArray(answer) && answer.some((value) => value.trim().length > 0));

  return hasAnswer || refinement.defaultAnswerQuestionIds.includes(questionId);
};

export const REQUIRED_BRIEF_CONSULTATION_RESULT: PhaseCheckResult = {
  decision: "ask",
  questions: [
    {
      id: "brief-problem",
      label: "What problem should the first release solve first?",
      type: "text",
      whyThisBlocks: "The brief cannot define the right scope until the primary problem is explicit.",
      affectedArtifact: "brief",
      decisionType: "scope",
      assumptionIfUnanswered:
        "Assume the first release focuses on the most urgent problem implied by the initiative description."
    },
    {
      id: "brief-primary-user",
      label: "Who is the primary first-release user?",
      type: "text",
      whyThisBlocks: "The brief cannot set goals or scope well without a clear primary user.",
      affectedArtifact: "brief",
      decisionType: "user",
      assumptionIfUnanswered:
        "Assume the first release targets the most obvious primary user implied by the initiative description."
    },
    {
      id: "brief-success",
      label: "What outcomes would make the first release successful?",
      type: "text",
      whyThisBlocks: "The brief needs explicit success criteria before it can define goals and tradeoffs.",
      affectedArtifact: "brief",
      decisionType: "success-metric",
      assumptionIfUnanswered:
        "Assume success means the core workflow works reliably for the primary user without major blockers."
    },
    {
      id: "brief-constraints-platform",
      label: "What hard constraints or platform/package targets must the brief assume?",
      type: "text",
      whyThisBlocks: "The brief needs known constraints and target platforms so it does not lock in the wrong scope.",
      affectedArtifact: "brief",
      decisionType: "platform",
      assumptionIfUnanswered:
        "Assume there are no extra hard constraints beyond the initiative description and prefer a narrow first-release platform scope."
    }
  ],
  assumptions: []
};

export const BRIEF_CONSULTATION_REQUIRED_MESSAGE =
  "Complete the required Brief consultation before creating this artifact";

export const requiresInitialBriefConsultation = (input: {
  initiative: Initiative;
  briefMarkdown?: string;
}): boolean => {
  if (input.briefMarkdown?.trim()) {
    return false;
  }

  const refinement = input.initiative.workflow.refinements.brief;
  if (!refinement.checkedAt) {
    return true;
  }

  return REQUIRED_BRIEF_CONSULTATION_RESULT.questions.some((question) => !hasResolvedQuestion(refinement, question.id));
};

export const buildRequiredBriefConsultationResult = (): PhaseCheckResult => ({
  decision: REQUIRED_BRIEF_CONSULTATION_RESULT.decision,
  questions: REQUIRED_BRIEF_CONSULTATION_RESULT.questions.map((question) => ({
    ...question,
    options: question.options ? [...question.options] : undefined,
    optionHelp: question.optionHelp ? { ...question.optionHelp } : undefined
  })),
  assumptions: [...REQUIRED_BRIEF_CONSULTATION_RESULT.assumptions]
});
