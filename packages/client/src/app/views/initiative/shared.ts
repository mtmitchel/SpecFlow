import type {
  InitiativeArtifactStep,
  InitiativePlanningQuestion,
  InitiativePlanningStep,
  PlanningReviewArtifact,
  PlanningReviewFinding,
  PlanningReviewKind
} from "../../../types.js";

export type SpecStep = InitiativeArtifactStep;
export type SaveState = "idle" | "saving" | "saved" | "error";
export type RefinementAnswer = string | string[] | boolean | undefined;
export type ReviewFindingGroups = Record<PlanningReviewFinding["type"], PlanningReviewFinding[]>;
export type PlanningJourneyStage = "consult" | "draft" | "checkpoint" | "complete";
export const REVIEW_FINDING_SECTION_LABELS: Record<PlanningReviewFinding["type"], string> = {
  blocker: "Blockers",
  warning: "Warnings",
  "traceability-gap": "Traceability gaps",
  assumption: "Assumptions",
  "recommended-fix": "Recommended fixes"
};

export const PHASE_DESCRIPTIONS: Record<InitiativePlanningStep, string> = {
  brief: "Define the problem, audience, goals, and scope.",
  "core-flows": "Define the primary user journeys and states.",
  prd: "Define how the product should work.",
  "tech-spec": "Define how it should be built.",
  tickets: "Break the work into execution-ready steps."
};

export const PHASE_TRANSITIONS: Record<SpecStep | "tickets", { heading: string; body: string }> = {
  brief: {
    heading: "Brief ready",
    body: "The brief now defines the problem, audience, goals, and scope."
  },
  "core-flows": {
    heading: "Core flows ready",
    body: "The primary user journeys and states are ready for product requirements."
  },
  prd: {
    heading: "PRD ready",
    body: "The product requirements are ready for implementation planning."
  },
  "tech-spec": {
    heading: "Tech spec ready",
    body: "The implementation approach is ready to break into tickets."
  },
  tickets: {
    heading: "Tickets ready",
    body: "This initiative is ready for execution."
  }
};

export const SAVE_STATE_LABELS: Record<SaveState, string | null> = {
  idle: null,
  saving: "Saving...",
  saved: "Saved",
  error: "Saving failed. Try again."
};

export const REVIEW_STATUS_LABELS: Record<PlanningReviewArtifact["status"], string> = {
  passed: "Passed",
  blocked: "Blocked",
  overridden: "Overridden",
  stale: "Needs review"
};

export const JOURNEY_STAGE_LABELS: Record<PlanningJourneyStage, string> = {
  consult: "Consult",
  draft: "Draft",
  checkpoint: "Checkpoint",
  complete: "Complete"
};

export const JOURNEY_STAGE_GUIDANCE: Record<PlanningJourneyStage, string> = {
  consult: "Lock the decisions that shape this step before you generate anything.",
  draft: "Generate or refresh the artifact once the decisions are clear.",
  checkpoint: "Resolve the review blockers before you move to the next step.",
  complete: "This step is in good shape. Move forward when you are ready."
};

export const TICKET_COVERAGE_REVIEW_KIND: PlanningReviewKind = "ticket-coverage-review";

export const isQuestionAnswered = (value: RefinementAnswer): boolean => {
  if (typeof value === "boolean") {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some((item) => item.trim().length > 0);
  }

  return false;
};

export const isQuestionResolved = (
  question: InitiativePlanningQuestion,
  answers: Record<string, string | string[] | boolean>,
  defaultAnswerQuestionIds: string[]
): boolean =>
  isQuestionAnswered(answers[question.id]) || defaultAnswerQuestionIds.includes(question.id);

export const isResolvedReview = (review: PlanningReviewArtifact | undefined): boolean =>
  Boolean(review && (review.status === "passed" || review.status === "overridden"));

export const groupReviewFindings = (findings: PlanningReviewFinding[]): ReviewFindingGroups => ({
  blocker: findings.filter((finding) => finding.type === "blocker"),
  warning: findings.filter((finding) => finding.type === "warning"),
  "traceability-gap": findings.filter((finding) => finding.type === "traceability-gap"),
  assumption: findings.filter((finding) => finding.type === "assumption"),
  "recommended-fix": findings.filter((finding) => finding.type === "recommended-fix")
});

export interface ArtifactPreviewSection {
  heading: string;
  content: string;
}

export const buildArtifactPreview = (
  markdown: string
): { intro: string | null; sections: ArtifactPreviewSection[] } => {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return { intro: null, sections: [] };
  }

  const lines = trimmed.split("\n");
  const sections: ArtifactPreviewSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];
  const introLines: string[] = [];

  const flush = () => {
    if (!currentHeading) {
      return;
    }

    const content = currentLines.join("\n").trim();
    if (content) {
      sections.push({ heading: currentHeading, content });
    }
    currentHeading = null;
    currentLines = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##+\s+(.*)$/);
    const topHeadingMatch = line.match(/^#\s+(.*)$/);

    if (topHeadingMatch) {
      continue;
    }

    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
      continue;
    }

    if (currentHeading) {
      currentLines.push(line);
      continue;
    }

    introLines.push(line);
  }

  flush();

  const intro = introLines.join("\n").trim() || null;
  return {
    intro,
    sections: sections.slice(0, 6)
  };
};
