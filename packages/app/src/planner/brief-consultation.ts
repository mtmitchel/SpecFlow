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
      label: "What kind of work is this?",
      type: "select",
      whyThisBlocks: "This shapes the whole brief -- a new build is scoped differently from a fix or an improvement.",
      affectedArtifact: "brief",
      decisionType: "problem",
      options: [
        "Build something new",
        "Improve or replace something that exists",
        "Automate or speed up a manual process",
        "Fix something that's broken or unreliable",
        "Meet a specific requirement or standard"
      ],
      optionHelp: {
        "Build something new":
          "Scope the brief around the first useful version and biggest adoption risk.",
        "Improve or replace something that exists":
          "Start from what's already there and focus on what changes.",
        "Automate or speed up a manual process":
          "Focus the brief on the manual steps to eliminate and how much faster it should be.",
        "Fix something that's broken or unreliable":
          "Focus the brief on what's failing and what working correctly looks like.",
        "Meet a specific requirement or standard":
          "Center the brief on the requirement and how it constrains v1."
      },
      recommendedOption: null,
      allowCustomAnswer: true,
      assumptionIfUnanswered:
        "We'll infer the type of work from your description."
    },
    {
      id: "brief-primary-user",
      label: "Who is this for?",
      type: "select",
      whyThisBlocks: "Who you're building for shapes the goals and scope.",
      affectedArtifact: "brief",
      decisionType: "user",
      options: ["Just me", "A small team I work with", "An internal team or company", "A public audience"],
      optionHelp: {
        "Just me": "Optimize for your own workflow -- skip coordination overhead.",
        "A small team I work with": "Account for a few people with shared context.",
        "An internal team or company": "Reflect organizational constraints and shared processes.",
        "A public audience": "Favor clear onboarding, plain language, and fewer assumptions."
      },
      recommendedOption: null,
      allowCustomAnswer: true,
      assumptionIfUnanswered:
        "We'll infer the audience from your description."
    },
    {
      id: "brief-success",
      label: "How should v1 feel when it works?",
      type: "multi-select",
      whyThisBlocks: "This decides what the brief optimizes for and what gets cut.",
      affectedArtifact: "brief",
      decisionType: "success",
      options: [
        "It's fast or saves time",
        "It works reliably on real tasks",
        "It stays simple -- no feature bloat",
        "New users can figure it out quickly",
        "The value is obvious in the first session"
      ],
      optionHelp: {
        "It's fast or saves time":
          "Speed and reduced effort become the main success measures.",
        "It works reliably on real tasks":
          "Correctness and trust in everyday use come first.",
        "It stays simple -- no feature bloat":
          "Keep the first release narrow; cut anything that dilutes the main job.",
        "New users can figure it out quickly":
          "Prioritize clear labels, low friction, and a short path to first success.",
        "The value is obvious in the first session":
          "The first time someone uses it, the benefit should be clear."
      },
      recommendedOption: null,
      allowCustomAnswer: true,
      assumptionIfUnanswered:
        "We'll aim for it working reliably on real tasks for your first user."
    },
    {
      id: "brief-constraints",
      label: "Any hard requirements from day one?",
      type: "multi-select",
      whyThisBlocks: "Knowing these up front prevents the brief from overpromising.",
      affectedArtifact: "brief",
      decisionType: "constraint",
      options: [
        "Specific platform or environment",
        "Must work offline or on a bad connection",
        "Data has to work with other tools or formats",
        "Specific performance or scale targets",
        "Has to fit into an existing system",
        "Privacy, security, or compliance rules"
      ],
      optionHelp: {
        "Specific platform or environment":
          "Supported environments become part of the first-release scope.",
        "Must work offline or on a bad connection":
          "Offline and degraded-network behavior become day-one requirements.",
        "Data has to work with other tools or formats":
          "Import, export, and format compatibility stay in scope from the start.",
        "Specific performance or scale targets":
          "Performance or scale limits carry into product and implementation decisions.",
        "Has to fit into an existing system":
          "The existing system's interfaces and migration constraints apply from day one.",
        "Privacy, security, or compliance rules":
          "Data handling, access control, or regulatory obligations become hard boundaries."
      },
      recommendedOption: null,
      allowCustomAnswer: true,
      assumptionIfUnanswered:
        "We'll keep v1 as small as possible with no extra constraints beyond your description."
    }
  ]),
  assumptions: []
};

export const BRIEF_CONSULTATION_REQUIRED_MESSAGE =
  "Answer the intake questions before generating the brief";

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

  if (refinement.baseAssumptions.length > 0) {
    return false;
  }

  if (refinement.questions.length === 0 && refinement.defaultAnswerQuestionIds.length === 0 && Object.keys(refinement.answers).length === 0) {
    return true;
  }

  return refinement.questions.some((question) => !hasResolvedQuestion(refinement, question.id));
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
