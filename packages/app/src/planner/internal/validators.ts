import type {
  ClarifyHelpResult,
  PhaseCheckInput,
  PhaseCheckResult,
  PhaseMarkdownResult,
  PlanResult,
  ReviewRunResult,
  TriageResult,
} from "../types.js";
import type { InitiativePlanningQuestion } from "../../types/entities.js";
import { normalizeDecisionType } from "../decision-types.js";
import { getQuestionPolicy } from "../refinement-check-policy.js";
import {
  validateInitiativeTitle,
  validateMarkdownNoAmpersands,
  normalizeMarkdownHeadingsSentenceCase,
  validateNoAmpersands,
  validatePhaseName,
  validateTicketTitle,
} from "./title-style.js";
import { validateQuestions } from "./phase-check-question-validator.js";

export const validatePhaseCheckResult = (
  result: PhaseCheckResult,
  input: PhaseCheckInput,
  priorQuestions: InitiativePlanningQuestion[] = []
): void => {
  const questionPolicy = getQuestionPolicy(input.phase);
  const requiredQuestionCount = input.requiredStarterQuestionCount ?? 0;

  if (result.decision !== "proceed" && result.decision !== "ask") {
    throw new Error(`Phase-check decision must be "proceed" or "ask", received "${String(result.decision)}"`);
  }

  validateQuestions(result.questions, input, priorQuestions);

  if (requiredQuestionCount > 0) {
    if (result.decision !== "ask") {
      throw new Error('Phase-check decision must be "ask" when starter questions are required');
    }

    if (result.questions.length < requiredQuestionCount) {
      throw new Error(
        `Phase-check result must include at least ${requiredQuestionCount} starter question${requiredQuestionCount === 1 ? "" : "s"} when starter questions are required`
      );
    }

    for (const decisionGroup of questionPolicy.requiredStarterDecisionGroups) {
      const normalizedDecisionGroup = decisionGroup.map((decisionType) => normalizeDecisionType(decisionType));
      const groupSatisfied = result.questions.some((question) =>
        normalizedDecisionGroup.includes(normalizeDecisionType(question.decisionType))
      );
      if (!groupSatisfied) {
        const groupLabel =
          normalizedDecisionGroup.length === 1
            ? normalizedDecisionGroup[0]
            : normalizedDecisionGroup.join(" or ");
        throw new Error(
          `Phase-check result for ${input.phase} must include a ${groupLabel} question in the first starter set`
        );
      }
    }
  }

  if (!Array.isArray(result.assumptions)) {
    throw new Error("Phase-check result missing assumptions array");
  }
};

export const validateClarifyHelpResult = (result: ClarifyHelpResult): void => {
  if (!result.guidance?.trim()) {
    throw new Error("Clarify-help result must include guidance");
  }

  validateNoAmpersands(result.guidance, "Clarify-help guidance");
};

export const validatePhaseMarkdownResult = (
  result: PhaseMarkdownResult,
  options: { requireInitiativeTitle?: boolean } = {}
): void => {
  if (!result.markdown?.trim()) {
    throw new Error("Phase generation result must include markdown");
  }

  if (!result.traceOutline || !Array.isArray(result.traceOutline.sections)) {
    throw new Error("Phase generation result must include traceOutline.sections");
  }

  validateMarkdownNoAmpersands(result.markdown);
  result.markdown = normalizeMarkdownHeadingsSentenceCase(result.markdown);

  if (options.requireInitiativeTitle) {
    if (!result.initiativeTitle?.trim()) {
      throw new Error("Phase generation result must include initiativeTitle");
    }

    validateInitiativeTitle(result.initiativeTitle);
    const headingMatch = result.markdown.trim().match(/^#\s+(.+?)\s*(?:\r?\n|$)/);
    const heading = headingMatch?.[1]?.trim() ?? "";
    if (heading !== result.initiativeTitle.trim()) {
      const title = result.initiativeTitle.trim();
      if (headingMatch) {
        result.markdown = result.markdown.replace(
          /^(\s*)#\s+.+?(\s*(?:\r?\n|$))/,
          `$1# ${title}$2`
        );
      } else {
        result.markdown = `# ${title}\n\n${result.markdown.trimStart()}`;
      }
    }
  }
};

const validateStringArray = (value: unknown, fieldName: string): void => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${fieldName} must be an array of strings`);
  }
};

export const validateReviewRunResult = (result: ReviewRunResult): void => {
  if (!result.summary?.trim()) {
    throw new Error("Review result must include summary");
  }

  validateStringArray(result.blockers, "Review blockers");
  validateStringArray(result.warnings, "Review warnings");
  validateStringArray(result.traceabilityGaps, "Review traceabilityGaps");
  validateStringArray(result.assumptions, "Review assumptions");
  validateStringArray(result.recommendedFixes, "Review recommendedFixes");
};

export const validatePlanResult = (result: PlanResult): void => {
  if (!Array.isArray(result.phases)) {
    throw new Error("Plan result missing phases array");
  }

  validateStringArray(result.uncoveredCoverageItemIds, "Plan uncoveredCoverageItemIds");

  for (const phase of result.phases) {
    validatePhaseName(phase.name);

    if (!Array.isArray(phase.tickets)) {
      throw new Error(`Plan phase "${phase.name}" is missing tickets array`);
    }

    for (const ticket of phase.tickets) {
      validateTicketTitle(ticket.title);
      validateNoAmpersands(ticket.description, `Plan ticket "${ticket.title}" description`);
      validateStringArray(ticket.acceptanceCriteria, `Plan ticket "${ticket.title}" acceptanceCriteria`);
      validateStringArray(ticket.fileTargets, `Plan ticket "${ticket.title}" fileTargets`);
      validateStringArray(ticket.coverageItemIds, `Plan ticket "${ticket.title}" coverageItemIds`);
      for (const criterion of ticket.acceptanceCriteria) {
        validateNoAmpersands(criterion, `Plan ticket "${ticket.title}" acceptance criterion`);
      }
    }
  }
};

export const validateTriageResult = (result: TriageResult): void => {
  const decision = result.decision?.toLowerCase();
  if (decision !== "ok" && decision !== "too-large") {
    throw new Error(`Triage result decision must be 'ok' or 'too-large', received '${result.decision}'`);
  }

  if (decision === "ok") {
    if (!result.ticketDraft) {
      throw new Error("Triage result for decision 'ok' must include ticketDraft");
    }

    validateTicketTitle(result.ticketDraft.title);
    validateNoAmpersands(result.ticketDraft.description, `Quick task "${result.ticketDraft.title}" description`);
    for (const criterion of result.ticketDraft.acceptanceCriteria) {
      validateNoAmpersands(criterion, `Quick task "${result.ticketDraft.title}" acceptance criterion`);
    }
  }

  if (decision === "too-large") {
    if (!result.initiativeTitle?.trim()) {
      throw new Error("Triage result for decision 'too-large' must include initiativeTitle");
    }

    validateInitiativeTitle(result.initiativeTitle);
  }
};
