import type {
  InitiativeArtifactStep,
  InitiativePlanningQuestion,
  InitiativePlanningStep,
  PlanningReviewArtifact,
  PlanningReviewFinding,
  PlanningReviewKind
} from "../../../types.js";
import { INITIATIVE_WORKFLOW_LABELS } from "../../utils/initiative-workflow.js";

export type SpecStep = InitiativeArtifactStep;
export type SaveState = "idle" | "saving" | "saved" | "error";
export type RefinementAnswer = string | string[] | boolean | undefined;
export type ReviewFindingGroups = Record<PlanningReviewFinding["type"], PlanningReviewFinding[]>;
export interface ReviewQuestion {
  id: string;
  details: string[];
  prompt: string;
  relatedArtifacts: string[];
  type: PlanningReviewFinding["type"];
}
export type PlanningJourneyStage = "consult" | "draft" | "checkpoint" | "complete";
export type PlanningDrawerState =
  | { type: "refinement"; step: SpecStep }
  | { type: "document"; step: SpecStep }
  | { type: "edit"; step: SpecStep }
  | null;
export const REVIEW_FINDING_SECTION_LABELS: Record<PlanningReviewFinding["type"], string> = {
  blocker: "Must fix",
  warning: "Suggestions",
  "traceability-gap": "Missing links",
  assumption: "Notes",
  "recommended-fix": "Suggested fixes"
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
    body: "The problem, audience, goals, and scope are in place."
  },
  "core-flows": {
    heading: "Core flows ready",
    body: "The main journeys are clear enough to write the PRD."
  },
  prd: {
    heading: "PRD ready",
    body: "The product behavior is clear enough to plan the build."
  },
  "tech-spec": {
    heading: "Tech spec ready",
    body: "The build plan is ready to break into tickets."
  },
  tickets: {
    heading: "Tickets ready",
    body: "Planning is done. Execution can start."
  }
};

export const SAVE_STATE_LABELS: Record<SaveState, string | null> = {
  idle: null,
  saving: "Saving...",
  saved: "Saved",
  error: "We couldn't save. Try again."
};

export const REVIEW_STATUS_LABELS: Record<PlanningReviewArtifact["status"], string> = {
  passed: "Looks good",
  blocked: "Needs review",
  overridden: "Accepted risk",
  stale: "Needs review"
};

export const JOURNEY_STAGE_LABELS: Record<PlanningJourneyStage, string> = {
  consult: "Consult",
  draft: "Draft",
  checkpoint: "Needs review",
  complete: "Complete"
};

export const JOURNEY_STAGE_GUIDANCE: Record<PlanningJourneyStage, string> = {
  consult: "Answer the questions that matter before you generate anything.",
  draft: "Generate or refresh the artifact once the answers look right.",
  checkpoint: "Review the issues before you move on.",
  complete: "This step is in good shape. Move on when you are ready."
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

const getReviewQuestionPrompt = (message: string, type: PlanningReviewFinding["type"]): { key: string; prompt: string } => {
  const normalized = message.toLowerCase();

  if (normalized.includes("scope") || normalized.includes("first release")) {
    return { key: "scope", prompt: "What should this step include in v1?" };
  }

  if (
    normalized.includes("user") ||
    normalized.includes("audience") ||
    normalized.includes("persona") ||
    normalized.includes("job to be done")
  ) {
    return { key: "user", prompt: "Who is this for?" };
  }

  if (
    normalized.includes("success criteria") ||
    normalized.includes("metric") ||
    normalized.includes("latency") ||
    normalized.includes("performance")
  ) {
    return { key: "success", prompt: "How should success be measured?" };
  }

  if (
    normalized.includes("target hardware") ||
    normalized.includes("environment") ||
    normalized.includes("platform") ||
    normalized.includes("flatpak") ||
    normalized.includes("sandbox") ||
    normalized.includes("portal")
  ) {
    return { key: "platform", prompt: "What platform constraints matter here?" };
  }

  if (
    normalized.includes("storage") ||
    normalized.includes("index") ||
    normalized.includes("db") ||
    normalized.includes("fts") ||
    normalized.includes("search")
  ) {
    return { key: "data", prompt: "What data and search approach should this use?" };
  }

  if (normalized.includes("accessibility")) {
    return { key: "accessibility", prompt: "What accessibility bar should this meet?" };
  }

  if (type === "traceability-gap") {
    return { key: "traceability", prompt: "What still needs to be linked?" };
  }

  if (type === "assumption") {
    return { key: "assumption", prompt: "What should be confirmed?" };
  }

  if (type === "recommended-fix") {
    return { key: "fix", prompt: "What change would fix this?" };
  }

  if (type === "blocker") {
    return { key: "blocker", prompt: "What is missing before this can move on?" };
  }

  return { key: "tighten", prompt: "What should be tightened up?" };
};

const getRelatedArtifactLabel = (artifact: string): string =>
  artifact in INITIATIVE_WORKFLOW_LABELS
    ? INITIATIVE_WORKFLOW_LABELS[artifact as InitiativePlanningStep]
    : artifact.replace(/-/g, " ");

export const buildReviewQuestions = (findings: PlanningReviewFinding[]): ReviewQuestion[] =>
  Object.values(
    findings.reduce<Record<string, ReviewQuestion>>((acc, finding) => {
      const topic = getReviewQuestionPrompt(finding.message, finding.type);
      const key = `${finding.type}:${topic.key}`;

      if (!acc[key]) {
        acc[key] = {
          id: key,
          details: [],
          prompt: topic.prompt,
          relatedArtifacts: [],
          type: finding.type
        };
      }

      acc[key].details.push(finding.message);
      acc[key].relatedArtifacts = [...new Set([...acc[key].relatedArtifacts, ...finding.relatedArtifacts.map(getRelatedArtifactLabel)])];

      return acc;
    }, {})
  );

export const getReviewQuestionHeadline = (
  review: PlanningReviewArtifact | undefined,
  questionCount: number
): string => {
  if (!review) {
    return "Not checked yet";
  }

  if (review.status === "overridden") {
    return "Moved on with risk";
  }

  if (questionCount === 0) {
    return "Nothing is blocking this step";
  }

  return `${questionCount} question${questionCount === 1 ? "" : "s"} to answer`;
};

export const getReviewQuestionNote = (
  review: PlanningReviewArtifact | undefined
): string | null => {
  if (!review) {
    return "Run the check to look for gaps.";
  }

  if (review.status === "overridden" && review.overrideReason) {
    return `Reason: ${review.overrideReason}`;
  }

  return null;
};

export const getReviewSwitcherMeta = (review: PlanningReviewArtifact | undefined): string => {
  if (!review) {
    return "Not checked yet";
  }

  if (review.status === "overridden") {
    return "Moved on with risk";
  }

  if (review.findings.length === 0) {
    return "Nothing open";
  }

  return `${review.findings.length} question${review.findings.length === 1 ? "" : "s"}`;
};

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
