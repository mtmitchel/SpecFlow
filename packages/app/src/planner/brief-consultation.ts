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
      label: "What needs to get better first?",
      type: "select",
      whyThisBlocks: "The brief needs one clear problem before it can set scope.",
      affectedArtifact: "brief",
      decisionType: "problem",
      options: [
        "Speed up repetitive work",
        "Replace or improve an existing workflow",
        "Make a new capability possible",
        "Fix reliability, correctness, or data issues",
        "Meet a required standard or constraint"
      ],
      optionHelp: {
        "Speed up repetitive work":
          "Make speed and reduced manual effort the main outcome.",
        "Replace or improve an existing workflow":
          "Start from the current workflow and define what must improve or stay compatible.",
        "Make a new capability possible":
          "Define the first useful slice, the core promise, and the biggest adoption risk.",
        "Fix reliability, correctness, or data issues":
          "Be explicit about what is failing today and what reliable behavior needs to return.",
        "Meet a required standard or constraint":
          "Make the non-negotiable requirement clear and show how it limits v1."
      },
      recommendedOption: null,
      allowCustomAnswer: true,
      assumptionIfUnanswered:
        "Assume the first release focuses on the most urgent problem in the project description."
    },
    {
      id: "brief-primary-user",
      label: "Who needs this first?",
      type: "select",
      whyThisBlocks: "The brief needs one clear first user before it can set goals or scope.",
      affectedArtifact: "brief",
      decisionType: "user",
      options: ["Just me", "A small team I know", "An internal team or company", "A broad public audience"],
      optionHelp: {
        "Just me": "Optimize for one person's workflow without extra coordination overhead.",
        "A small team I know": "Support a specific group with shared context and light coordination.",
        "An internal team or company": "Reflect organizational constraints, shared processes, and business context.",
        "A broad public audience": "Favor clear onboarding, plain language, and fewer built-in assumptions."
      },
      recommendedOption: null,
      allowCustomAnswer: true,
      assumptionIfUnanswered:
        "Assume the first release serves the most obvious user in the project description."
    },
    {
      id: "brief-success",
      label: "If v1 works, what should feel true?",
      type: "multi-select",
      whyThisBlocks: "The brief needs clear success qualities before it can set goals and tradeoffs.",
      affectedArtifact: "brief",
      decisionType: "success",
      options: [
        "The main job feels faster",
        "Real work runs reliably",
        "The product stays simple",
        "New users can get started quickly",
        "The value is obvious right away"
      ],
      optionHelp: {
        "The main job feels faster":
          "Treat speed or reduced effort as a first-release success measure.",
        "Real work runs reliably":
          "Treat correctness, resilience, and trust in everyday use as core success measures.",
        "The product stays simple":
          "Keep the first release narrow and avoid features that dilute the main job.",
        "New users can get started quickly":
          "Prioritize clear labels, low-friction onboarding, and a short path to first success.",
        "The value is obvious right away":
          "Aim for a short time to value and make the first session prove the benefit."
      },
      recommendedOption: null,
      allowCustomAnswer: true,
      assumptionIfUnanswered:
        "Assume success means the main job works reliably for the first user without major blockers."
    },
    {
      id: "brief-constraints",
      label: "What has to be true from day one?",
      type: "multi-select",
      whyThisBlocks: "The brief needs hard boundaries so it does not set the wrong scope or promise the wrong thing.",
      affectedArtifact: "brief",
      decisionType: "constraint",
      options: [
        "It must support a specific platform or environment",
        "It must work offline or with a weak connection",
        "Data must stay portable or interoperable",
        "Performance or scale limits must hold immediately",
        "It must fit into an existing system",
        "Privacy, security, or compliance rules are non-negotiable"
      ],
      optionHelp: {
        "It must support a specific platform or environment":
          "Make supported environments or operating conditions part of the first-release scope.",
        "It must work offline or with a weak connection":
          "Treat offline and degraded-network behavior as a day-one requirement.",
        "Data must stay portable or interoperable":
          "Preserve portability, import and export expectations, or compatibility with existing data formats.",
        "Performance or scale limits must hold immediately":
          "Carry explicit performance or scale limits into later product and implementation decisions.",
        "It must fit into an existing system":
          "Respect another system's interfaces, workflows, or migration constraints from day one.",
        "Privacy, security, or compliance rules are non-negotiable":
          "Treat data handling, access control, or regulatory obligations as hard boundaries."
      },
      recommendedOption: null,
      allowCustomAnswer: true,
      assumptionIfUnanswered:
        "Assume there are no extra hard boundaries beyond the project description, and keep the first release as small as possible."
    }
  ]),
  assumptions: []
};

export const BRIEF_CONSULTATION_REQUIRED_MESSAGE =
  "Finish brief intake before you create the brief";

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
