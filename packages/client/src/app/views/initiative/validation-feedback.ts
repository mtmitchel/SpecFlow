import { getReviewResolutionStep } from "@specflow/shared-contracts";
import type {
  InitiativeArtifactStep,
  PlanningReviewArtifact,
  PlanningReviewFinding,
} from "../../../types.js";
import type { SpecStep } from "./shared.js";

export type ValidationFeedbackByStep = Partial<Record<SpecStep, string>>;

interface PlanValidationIssueDetail {
  message?: unknown;
  coverageItem?: {
    sourceStep?: unknown;
  };
}

const VALIDATION_FEEDBACK_STEPS: SpecStep[] = [
  "brief",
  "core-flows",
  "prd",
  "tech-spec",
];

const STEP_MESSAGE_PATTERNS: Record<SpecStep, RegExp[]> = {
  brief: [/^\s*Missing Brief\b/i, /\bBrief\b/i],
  "core-flows": [/^\s*Missing Core flows\b/i, /\bCore flows\b/i],
  prd: [/^\s*Missing PRD\b/i, /\bPRD\b/i],
  "tech-spec": [/^\s*Missing Tech spec\b/i, /\bTech spec\b/i],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isSpecStep = (value: unknown): value is SpecStep =>
  typeof value === "string" &&
  VALIDATION_FEEDBACK_STEPS.includes(value as SpecStep);

const isArtifactStep = (value: unknown): value is InitiativeArtifactStep =>
  isSpecStep(value);

const uniqueMessages = (messages: string[]): string[] =>
  Array.from(new Set(messages.map((message) => message.trim()).filter((message) => message.length > 0)));

const buildFeedbackText = (messages: string[]): string | null => {
  const unique = uniqueMessages(messages);
  return unique.length > 0 ? unique.join("\n") : null;
};

const inferStepsFromMessage = (message: string): SpecStep[] =>
  VALIDATION_FEEDBACK_STEPS.filter((step) =>
    STEP_MESSAGE_PATTERNS[step].some((pattern) => pattern.test(message))
  );

const inferStepsFromFinding = (finding: PlanningReviewFinding): SpecStep[] => {
  const relatedArtifactSteps = Array.from(
    new Set(finding.relatedArtifacts.filter((artifact): artifact is InitiativeArtifactStep => isArtifactStep(artifact)))
  );

  if (relatedArtifactSteps.length === 1) {
    return relatedArtifactSteps;
  }

  const inferredFromMessage = inferStepsFromMessage(finding.message);
  if (inferredFromMessage.length > 0) {
    return inferredFromMessage;
  }

  const fallbackStep = getReviewResolutionStep(finding);
  if (isSpecStep(fallbackStep)) {
    return [fallbackStep];
  }

  return relatedArtifactSteps.length > 0 && relatedArtifactSteps.length < VALIDATION_FEEDBACK_STEPS.length
    ? relatedArtifactSteps
    : [];
};

const buildFeedbackByStep = (
  messagesByStep: Map<SpecStep, string[]>
): ValidationFeedbackByStep =>
  Object.fromEntries(
    Array.from(messagesByStep.entries())
      .map(([step, messages]) => [step, buildFeedbackText(messages)])
      .filter((entry): entry is [SpecStep, string] => Boolean(entry[1]))
  );

export const buildValidationReviewFeedbackByStep = (
  review: PlanningReviewArtifact | undefined
): ValidationFeedbackByStep => {
  if (!review || review.status !== "blocked") {
    return {};
  }

  const messagesByStep = new Map<SpecStep, string[]>();
  for (const finding of review.findings) {
    const steps = inferStepsFromFinding(finding);
    for (const step of steps) {
      const current = messagesByStep.get(step) ?? [];
      current.push(finding.message);
      messagesByStep.set(step, current);
    }
  }

  return buildFeedbackByStep(messagesByStep);
};

const getPlanValidationIssues = (details: unknown): PlanValidationIssueDetail[] => {
  if (!isRecord(details) || !Array.isArray(details.issues)) {
    return [];
  }

  return details.issues.filter(isRecord);
};

export const buildPlanValidationFeedbackByStep = (
  details: unknown
): ValidationFeedbackByStep => {
  const messagesByStep = new Map<SpecStep, string[]>();

  for (const issue of getPlanValidationIssues(details)) {
    const message = typeof issue.message === "string" ? issue.message.trim() : "";
    if (!message) {
      continue;
    }

    const sourceStep = isRecord(issue.coverageItem) && isSpecStep(issue.coverageItem.sourceStep)
      ? issue.coverageItem.sourceStep
      : null;
    const steps = sourceStep ? [sourceStep] : inferStepsFromMessage(message);

    for (const step of steps) {
      const current = messagesByStep.get(step) ?? [];
      current.push(message);
      messagesByStep.set(step, current);
    }
  }

  return buildFeedbackByStep(messagesByStep);
};

export const getValidationFeedbackForStep = (
  step: SpecStep,
  feedbackByStep: ValidationFeedbackByStep,
  fallbackFeedback?: string | null
): string | undefined => {
  const scopedSteps = Object.keys(feedbackByStep);
  if (scopedSteps.length > 0) {
    return feedbackByStep[step];
  }

  return fallbackFeedback?.trim() ? fallbackFeedback.trim() : undefined;
};

export const getValidationFeedbackSteps = (
  feedbackByStep: ValidationFeedbackByStep
): SpecStep[] => VALIDATION_FEEDBACK_STEPS.filter((step) => Boolean(feedbackByStep[step]));
