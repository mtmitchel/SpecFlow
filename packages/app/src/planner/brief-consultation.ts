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
      whyThisBlocks: "The brief needs one clear problem before it can define the right scope.",
      affectedArtifact: "brief",
      decisionType: "problem",
      options: [
        "Automate or speed up a repetitive process",
        "Replace or improve an existing tool or workflow",
        "Build something new that does not exist yet",
        "Fix reliability, correctness, or data quality issues",
        "Meet a new requirement, standard, or constraint"
      ],
      optionHelp: {
        "Automate or speed up a repetitive process":
          "Treat speed or reduced manual effort as the main outcome.",
        "Replace or improve an existing tool or workflow":
          "Compare against the current workflow and define what has to improve or stay compatible.",
        "Build something new that does not exist yet":
          "Define the first usable slice, the core promise, and the biggest adoption risk.",
        "Fix reliability, correctness, or data quality issues":
          "Name what is failing today and what reliable behavior needs to be restored.",
        "Meet a new requirement, standard, or constraint":
          "Make the non-negotiable requirement clear and define the scope limits it creates."
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
      whyThisBlocks: "The brief needs one clear primary user before it can set goals or scope.",
      affectedArtifact: "brief",
      decisionType: "user",
      options: ["Just me", "A small team I know", "An internal team or company", "A broad public audience"],
      optionHelp: {
        "Just me": "Optimize for one person's workflow without team coordination.",
        "A small team I know": "Support a specific group with shared context and light coordination.",
        "An internal team or company": "Reflect organizational constraints, shared processes, and business context.",
        "A broad public audience": "Favor clear onboarding, plain language, and fewer assumptions about the user."
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
        "Core workflow is noticeably faster than the current approach",
        "Handles real data reliably without manual intervention",
        "Feels simple and focused",
        "Is easy to learn on first use",
        "Shows clear value right away"
      ],
      optionHelp: {
        "Core workflow is noticeably faster than the current approach":
          "Treat speed or reduced effort as a first-release success measure.",
        "Handles real data reliably without manual intervention":
          "Treat correctness, resilience, and trust in everyday use as core success measures.",
        "Feels simple and focused":
          "Keep the first release narrow and avoid features that dilute the main job.",
        "Is easy to learn on first use":
          "Prioritize clear labels, low-friction onboarding, and a short path to first success.",
        "Shows clear value right away":
          "Aim for a short time to value and make the first session prove the benefit."
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
        "Specific platform or operating environment support",
        "Works offline or in unreliable network conditions",
        "Portable or interoperable data handling",
        "Performance or scale limits must hold from day one",
        "Must integrate with or extend an existing system",
        "Specific privacy, security, or compliance requirements"
      ],
      optionHelp: {
        "Specific platform or operating environment support":
          "Make supported environments or operating conditions part of the first-release scope.",
        "Works offline or in unreliable network conditions":
          "Treat offline and degraded-network behavior as a day-one requirement.",
        "Portable or interoperable data handling":
          "Preserve portability, import and export expectations, or compatibility with existing data formats.",
        "Performance or scale limits must hold from day one":
          "Carry explicit performance or scale limits into later product and implementation decisions.",
        "Must integrate with or extend an existing system":
          "Respect another system's interfaces, workflows, or migration constraints from day one.",
        "Specific privacy, security, or compliance requirements":
          "Treat data handling, access control, or regulatory obligations as hard boundaries."
      },
      recommendedOption: null,
      allowCustomAnswer: true,
      assumptionIfUnanswered:
        "Assume there are no extra hard constraints beyond the initiative description and prefer the smallest viable first-release operating surface."
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
