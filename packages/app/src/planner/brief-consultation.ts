import type {
  Initiative,
  InitiativePlanningQuestion,
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

const assertStaticQuestionDefinition = (question: InitiativePlanningQuestion): InitiativePlanningQuestion => {
  const options = question.options ?? [];
  const optionHelp = question.optionHelp ?? {};

  if ((question.type === "select" || question.type === "multi-select") && options.length === 0) {
    throw new Error(`Required Brief question ${question.id} must define options`);
  }

  const missingOptionHelp = options.filter((option) => !optionHelp[option]?.trim());
  if (missingOptionHelp.length > 0) {
    throw new Error(
      `Required Brief question ${question.id} is missing helper copy for option(s): ${missingOptionHelp.join(", ")}`
    );
  }

  const extraOptionHelp = Object.keys(optionHelp).filter((option) => !options.includes(option));
  if (extraOptionHelp.length > 0) {
    throw new Error(
      `Required Brief question ${question.id} has helper copy for unknown option(s): ${extraOptionHelp.join(", ")}`
    );
  }

  return question;
};

const defineRequiredBriefQuestions = (
  questions: InitiativePlanningQuestion[],
): InitiativePlanningQuestion[] => questions.map(assertStaticQuestionDefinition);

export const REQUIRED_BRIEF_CONSULTATION_RESULT: PhaseCheckResult = {
  decision: "ask",
  questions: defineRequiredBriefQuestions([
    {
      id: "brief-problem",
      label: "What primary problem should v1 solve?",
      type: "select",
      whyThisBlocks: "The brief cannot define the right scope until the primary problem is explicit.",
      affectedArtifact: "brief",
      decisionType: "problem",
      options: [
        "Repeated work takes too many steps",
        "Important information is hard to find again",
        "Staying organized takes too much effort",
        "The current tool or workflow no longer fits",
      ],
      optionHelp: {
        "Repeated work takes too many steps": "Use this when the main pain is friction in something people do often.",
        "Important information is hard to find again": "Use this when retrieval, recall, or rediscovery is the main pain.",
        "Staying organized takes too much effort": "Use this when structure and cleanup feel heavier than they should.",
        "The current tool or workflow no longer fits": "Use this when the main pain is mismatch with an existing process or product."
      },
      recommendedOption: null,
      allowCustomAnswer: true,
      assumptionIfUnanswered:
        "Assume the first release focuses on the most urgent problem implied by the initiative description."
    },
    {
      id: "brief-primary-user",
      label: "Who is this for first?",
      type: "select",
      whyThisBlocks: "The brief cannot set goals or scope well without a clear primary user.",
      affectedArtifact: "brief",
      decisionType: "user",
      options: ["Just me", "A small team I know", "An internal team or company", "A broad public audience"],
      optionHelp: {
        "Just me": "Use this when the first release is mainly for your own workflow.",
        "A small team I know": "Use this when the users are a specific small group with shared needs.",
        "An internal team or company": "Use this when the users are within one org or business context.",
        "A broad public audience": "Use this when the first release is meant for many unrelated users."
      },
      recommendedOption: null,
      allowCustomAnswer: true,
      assumptionIfUnanswered:
        "Assume the first release targets the most obvious primary user implied by the initiative description."
    },
    {
      id: "brief-success",
      label: "What should feel true if v1 succeeds?",
      type: "multi-select",
      whyThisBlocks: "The brief needs explicit success criteria before it can define goals and tradeoffs.",
      affectedArtifact: "brief",
      decisionType: "success",
      options: [
        "Feels fast in daily use",
        "Feels trustworthy for real notes",
        "Feels simple and focused",
        "Is easy to learn on first use",
        "Shows clear value right away"
      ],
      optionHelp: {
        "Feels fast in daily use": "Use this when speed and responsiveness are central to the product promise.",
        "Feels trustworthy for real notes": "Use this when consistency and trust matter most.",
        "Feels simple and focused": "Use this when the product should stay lightweight instead of feeling bloated or noisy.",
        "Is easy to learn on first use": "Use this when onboarding and clarity matter most.",
        "Shows clear value right away": "Use this when the product needs to prove itself quickly in an early session."
      },
      recommendedOption: null,
      allowCustomAnswer: true,
      assumptionIfUnanswered:
        "Assume success means the core workflow works reliably for the primary user without major blockers."
    },
    {
      id: "brief-constraints",
      label: "Which constraints matter from day one?",
      type: "multi-select",
      whyThisBlocks: "The brief needs hard boundaries so it does not lock in the wrong scope or promise the wrong solution.",
      affectedArtifact: "brief",
      decisionType: "constraint",
      options: [
        "Specific desktop platform support",
        "Local-first or offline use",
        "Plain files or portable storage",
        "Privacy or security requirements",
        "Performance limits on typical hardware",
        "Integration with another tool",
        "No extra constraints"
      ],
      optionHelp: {
        "Specific desktop platform support": "Use this when one desktop environment or OS support is non-negotiable in v1.",
        "Local-first or offline use": "Use this when the product must work well without a network connection.",
        "Plain files or portable storage": "Use this when storage format portability or local ownership is a hard boundary.",
        "Privacy or security requirements": "Use this when data handling or access rules constrain the design.",
        "Performance limits on typical hardware": "Use this when memory, CPU, startup, or responsiveness is a hard bar.",
        "Integration with another tool": "Use this when another system shapes the solution.",
        "No extra constraints": "Use this when the initiative description already covers the important limits."
      },
      recommendedOption: null,
      allowCustomAnswer: true,
      assumptionIfUnanswered:
        "Assume there are no extra hard constraints beyond the initiative description and prefer a narrow first-release platform scope."
    }
  ]),
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
