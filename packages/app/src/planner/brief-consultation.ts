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
      label: "Which problem matters most in v1?",
      type: "select",
      whyThisBlocks: "The brief cannot define the right scope until the primary problem is explicit.",
      affectedArtifact: "brief",
      decisionType: "scope",
      options: [
        "Capture something quickly",
        "Find or organize things better",
        "Replace an existing tool or workflow",
        "Support a platform-specific need",
        "Other"
      ],
      optionHelp: {
        "Capture something quickly": "Use this when speed of creation is the main job.",
        "Find or organize things better": "Use this when retrieval, structure, or cleanup matters most.",
        "Replace an existing tool or workflow": "Use this when the goal is to cover a current workflow in a better way.",
        "Support a platform-specific need": "Use this when the main value is doing the job well on a specific platform.",
        Other: "Use this when none of the options fit cleanly."
      },
      recommendedOption: null,
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
      options: ["Just me", "A small team I know", "An internal team or company", "A broad public audience", "Other"],
      optionHelp: {
        "Just me": "Use this when the first release is mainly for your own workflow.",
        "A small team I know": "Use this when the users are a specific small group with shared needs.",
        "An internal team or company": "Use this when the users are within one org or business context.",
        "A broad public audience": "Use this when the first release is meant for many unrelated users.",
        Other: "Use this when the primary audience is more specific."
      },
      recommendedOption: null,
      assumptionIfUnanswered:
        "Assume the first release targets the most obvious primary user implied by the initiative description."
    },
    {
      id: "brief-success",
      label: "How should v1 success be judged?",
      type: "multi-select",
      whyThisBlocks: "The brief needs explicit success criteria before it can define goals and tradeoffs.",
      affectedArtifact: "brief",
      decisionType: "success-metric",
      options: [
        "Fast enough for everyday use",
        "Reliable enough for real work",
        "Easy to learn on first use",
        "Works cleanly on the target platform",
        "Matches or improves an existing workflow",
        "Other"
      ],
      optionHelp: {
        "Fast enough for everyday use": "Use this when speed or responsiveness is a key success bar.",
        "Reliable enough for real work": "Use this when trust and consistency matter most.",
        "Easy to learn on first use": "Use this when onboarding and clarity matter most.",
        "Works cleanly on the target platform": "Use this when native fit or packaging matters most.",
        "Matches or improves an existing workflow": "Use this when the goal is to replace a current process without losing capability.",
        Other: "Use this when success depends on something more specific."
      },
      recommendedOption: null,
      assumptionIfUnanswered:
        "Assume success means the core workflow works reliably for the primary user without major blockers."
    },
    {
      id: "brief-constraints-platform",
      label: "Which constraints matter from day one?",
      type: "multi-select",
      whyThisBlocks: "The brief needs known constraints and target platforms so it does not lock in the wrong scope.",
      affectedArtifact: "brief",
      decisionType: "platform",
      options: [
        "Specific platform or package target",
        "Local-first or offline use",
        "Privacy or security requirements",
        "Performance limits",
        "Integration with another tool",
        "No extra constraints",
        "Other"
      ],
      optionHelp: {
        "Specific platform or package target": "Use this when OS, device class, packaging, or runtime matters immediately.",
        "Local-first or offline use": "Use this when the product must work well without a network connection.",
        "Privacy or security requirements": "Use this when data handling or access rules constrain the design.",
        "Performance limits": "Use this when speed, resource use, or latency is a hard bar.",
        "Integration with another tool": "Use this when another system shapes the solution.",
        "No extra constraints": "Use this when the initiative description already covers the important limits.",
        Other: "Use this when a different hard constraint matters."
      },
      recommendedOption: null,
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
