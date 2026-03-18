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
        "Automate or speed up a repetitive process",
        "Replace or improve an existing tool or workflow",
        "Build something new that does not exist yet",
        "Fix reliability, correctness, or data quality issues",
        "Meet a new requirement, standard, or constraint"
      ],
      optionHelp: {
        "Automate or speed up a repetitive process":
          "Pushes the Brief to prioritize workflow efficiency and measure success by reduced effort or time.",
        "Replace or improve an existing tool or workflow":
          "Pushes the Brief to compare against today's approach and define what must improve or stay compatible.",
        "Build something new that does not exist yet":
          "Pushes the Brief to define the first usable slice, core promise, and adoption risk of a new offering.",
        "Fix reliability, correctness, or data quality issues":
          "Pushes the Brief to define what is failing today and what reliable behavior must be restored.",
        "Meet a new requirement, standard, or constraint":
          "Pushes the Brief to encode the non-negotiable requirement and the scope limits it creates."
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
        "Just me": "Pushes the Brief to optimize for one user's workflow without team coordination overhead.",
        "A small team I know": "Pushes the Brief to support a specific group with shared context and lightweight coordination needs.",
        "An internal team or company": "Pushes the Brief to reflect organizational constraints, shared processes, and business context.",
        "A broad public audience": "Pushes the Brief to favor general clarity, onboarding, and looser assumptions about user context."
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
          "Pushes the Brief to set speed or effort reduction as a first-release quality bar.",
        "Handles real data reliably without manual intervention":
          "Pushes the Brief to treat correctness, resilience, and trust in everyday use as a core success quality.",
        "Feels simple and focused":
          "Pushes the Brief to keep the first release narrow and avoid features that dilute the main job.",
        "Is easy to learn on first use":
          "Pushes the Brief to value low-friction onboarding, clear labels, and a short path to first success.",
        "Shows clear value right away":
          "Pushes the Brief to define a short time-to-value and make the first session prove the product's benefit."
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
        "Performance limits on typical hardware",
        "Must integrate with or extend an existing system",
        "Specific privacy, security, or compliance requirements"
      ],
      optionHelp: {
        "Specific desktop platform support":
          "Forces the Brief to treat supported environments as a hard launch boundary instead of a later expansion.",
        "Local-first or offline use":
          "Forces the Brief to treat disconnected use and local control as first-release requirements.",
        "Plain files or portable storage":
          "Forces the Brief to preserve portability, inspectability, or local ownership of stored data.",
        "Performance limits on typical hardware":
          "Forces the Brief to carry explicit performance bars into later scope and implementation decisions.",
        "Must integrate with or extend an existing system":
          "Forces the Brief to respect another system's interfaces, workflows, or migration constraints from day one.",
        "Specific privacy, security, or compliance requirements":
          "Forces the Brief to treat data handling, access control, or regulatory obligations as hard boundaries."
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
