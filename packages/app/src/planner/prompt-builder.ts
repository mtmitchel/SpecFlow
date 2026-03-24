import type {
  ClarifyHelpInput,
  PhaseCheckInput,
  PlanInput,
  PlanValidationIssue,
  PlannerRepoContext,
  RefinementHistoryEntry,
  RefinementStep,
  ReviewRunInput,
  SpecGenInput,
  TriageInput
} from "./types.js";
import {
  PLANNER_ENGINEERING_FOUNDATIONS_SECTION,
  PLANNER_PRODUCT_DESIGN_CHARTER_SECTION,
  PLANNER_REVIEW_PRODUCT_DESIGN_SECTION,
  PLANNER_TITLE_STYLE_SECTION,
  TICKET_PLAN_PRODUCT_DESIGN_SECTION
} from "../prompt-guidance.js";
import { getQuestionPolicy, getPromptPolicy } from "./refinement-check-policy.js";
import { normalizeDecisionType, SUPPORTED_DECISION_TYPES } from "./decision-types.js";

export type PlannerJob =
  | "brief-check"
  | "core-flows-check"
  | "prd-check"
  | "tech-spec-check"
  | "clarify-help"
  | "brief-gen"
  | "core-flows-gen"
  | "prd-gen"
  | "tech-spec-gen"
  | "review"
  | "trace-outline"
  | "plan"
  | "plan-repair"
  | "triage";

export interface PromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
}

const QUESTION_TYPES = ["select", "multi-select", "boolean"] as const satisfies readonly string[];
const DECISION_TYPES = SUPPORTED_DECISION_TYPES;
const MAX_PLAN_REPAIR_SECTION_CHARS = 8_000;
const MAX_VALIDATION_FEEDBACK_SECTION_CHARS = 4_000;

const normalizePromptText = (value: string): string =>
  Array.from(value.replace(/\r\n/g, "\n"))
    .map((character) => {
      const codePoint = character.codePointAt(0);
      if (codePoint === undefined) {
        return "";
      }

      if (
        (codePoint < 0x20 && ![0x09, 0x0a, 0x0d].includes(codePoint)) ||
        (codePoint >= 0x7f && codePoint <= 0x9f)
      ) {
        return " ";
      }

      if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
        return "\uFFFD";
      }

      return character;
    })
    .join("");

const truncatePromptSection = (value: string, maxChars: number): string =>
  value.length > maxChars
    ? `${value.slice(0, maxChars).trimEnd()}\n...(truncated)`
    : value;

const sanitizePromptValue = (value: unknown): unknown => {
  if (typeof value === "string") {
    return normalizePromptText(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizePromptValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizePromptValue(entry)])
    );
  }

  return value;
};

const stringifyPromptValue = (value: unknown, maxChars?: number): string => {
  const serialized = JSON.stringify(sanitizePromptValue(value), null, 2) ?? "";
  return typeof maxChars === "number"
    ? truncatePromptSection(serialized, maxChars)
    : serialized;
};

const formatRefinementHistory = (history: RefinementHistoryEntry[]): string =>
  stringifyPromptValue(
    history.map((entry) => ({
      step: entry.step,
      questionId: entry.questionId,
      decisionType: entry.decisionType,
      label: entry.label,
      whyThisBlocks: entry.whyThisBlocks,
      resolution: entry.resolution,
      answer: entry.answer,
      assumption: entry.assumption
    })),
  );

const formatRepoContext = (repoContext: PlannerRepoContext): string =>
  stringifyPromptValue(
    {
      totalFiles: repoContext.totalFiles,
      configSummary: repoContext.configSummary,
      fileTree: repoContext.fileTree
    }
  );

const formatPlanValidationIssue = (issue: PlanValidationIssue): string =>
  [
    `- ${normalizePromptText(issue.message)}`,
    issue.coverageItemId ? `  Coverage item ID: ${normalizePromptText(issue.coverageItemId)}` : null,
    issue.ticketTitle ? `  Ticket: ${normalizePromptText(issue.ticketTitle)}` : null
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");

const buildPlanValidationFeedbackSection = (planInput: PlanInput): string | null =>
  planInput.validationFeedback
    ? [
        "Validation summary:",
        truncatePromptSection(
          normalizePromptText(planInput.validationFeedback.summary),
          MAX_VALIDATION_FEEDBACK_SECTION_CHARS
        ),
        planInput.validationFeedback.issues.length > 0
          ? `Validation issues:\n${planInput.validationFeedback.issues
              .map((issue) => formatPlanValidationIssue(issue))
              .join("\n")}`
          : null,
        planInput.previousInvalidResult
          ? `Previous invalid ticket plan:\n${stringifyPromptValue(
              planInput.previousInvalidResult,
              MAX_PLAN_REPAIR_SECTION_CHARS
            )}`
          : null
      ]
        .filter((value): value is string => Boolean(value))
        .join("\n\n")
    : null;

const outputContract = (job: PlannerJob): string => {
  switch (job) {
    case "brief-check":
    case "core-flows-check":
    case "prd-check":
    case "tech-spec-check":
      return [
        "Respond ONLY as JSON:",
        "{",
        '  "decision": "proceed|ask",',
        '  "questions": [',
        `    { "id": "string", "label": "string", "whyThisBlocks": "string", "affectedArtifact": "brief|core-flows|prd|tech-spec", "decisionType": "${DECISION_TYPES.join("|")}", "type": "${QUESTION_TYPES.join("|")}", "assumptionIfUnanswered": "string", "options": ["string"], "optionHelp": { "option": "one sentence explanation" }, "recommendedOption": "string|null", "allowCustomAnswer": true, "reopensQuestionIds": ["prior-question-id"] }`,
        "  ],",
        '  "assumptions": ["string"]',
        "}"
      ].join("\n");
    case "clarify-help":
      return ['Respond ONLY as JSON:\n{\n  "guidance": "string"\n}'].join("\n");
    case "brief-gen":
      return [
        "Respond ONLY as JSON:",
        "{",
        '  "initiativeTitle": "string",',
        '  "markdown": "string",',
        '  "traceOutline": {',
        '    "sections": [',
        '      { "key": "string", "label": "string", "items": ["string"] }',
        "    ]",
        "  }",
        "}"
      ].join("\n");
    case "core-flows-gen":
    case "prd-gen":
    case "tech-spec-gen":
    case "trace-outline":
      return [
        "Respond ONLY as JSON:",
        "{",
        '  "markdown": "string",',
        '  "traceOutline": {',
        '    "sections": [',
        '      { "key": "string", "label": "string", "items": ["string"] }',
        "    ]",
        "  }",
        "}"
      ].join("\n");
    case "review":
      return [
        "Respond ONLY as JSON:",
        "{",
        '  "summary": "string",',
        '  "blockers": ["string"],',
        '  "warnings": ["string"],',
        '  "traceabilityGaps": ["string"],',
        '  "assumptions": ["string"],',
        '  "recommendedFixes": ["string"]',
        "}"
      ].join("\n");
    case "plan":
    case "plan-repair":
      return [
        "Respond ONLY as JSON:",
        "{",
        '  "phases": [',
        '    { "name": "string", "order": 1, "tickets": [{ "title": "string", "description": "string", "acceptanceCriteria": ["string"], "fileTargets": ["string"], "coverageItemIds": ["string"] }] }',
        "  ],",
        '  "uncoveredCoverageItemIds": ["string"]',
        "}"
      ].join("\n");
    case "triage":
      return [
        "Respond ONLY as JSON:",
        "{",
        '  "decision": "ok|too-large",',
        '  "reason": "string",',
        '  "initiativeTitle": "string (when too-large)",',
        '  "ticketDraft": { "title": "string", "description": "string", "acceptanceCriteria": ["string"], "implementationPlan": "string", "fileTargets": ["string"] }',
        "}"
      ].join("\n");
    default: {
      const exhaustive: never = job;
      return String(exhaustive);
    }
  }
};

const getArtifactSections = (input: {
  initiativeDescription: string;
  briefMarkdown?: string;
  coreFlowsMarkdown?: string;
  prdMarkdown?: string;
  techSpecMarkdown?: string;
  savedContext?: Record<string, string | string[] | boolean>;
  refinementHistory?: RefinementHistoryEntry[];
  repoContext?: PlannerRepoContext;
  traceOutlines?: Partial<Record<RefinementStep, { sections: Array<{ key: string; label: string; items: string[] }> }>>;
}): string[] =>
  [
    `Project description:\n${normalizePromptText(input.initiativeDescription)}`,
    input.savedContext && Object.keys(input.savedContext).length > 0
      ? `Saved refinement context:\n${stringifyPromptValue(input.savedContext)}`
      : null,
    input.refinementHistory && input.refinementHistory.length > 0
      ? `Refinement history:\n${formatRefinementHistory(input.refinementHistory)}`
      : null,
    input.briefMarkdown?.trim() ? `Brief:\n${normalizePromptText(input.briefMarkdown)}` : null,
    input.coreFlowsMarkdown?.trim() ? `Core flows:\n${normalizePromptText(input.coreFlowsMarkdown)}` : null,
    input.prdMarkdown?.trim() ? `PRD:\n${normalizePromptText(input.prdMarkdown)}` : null,
    input.techSpecMarkdown?.trim() ? `Tech spec:\n${normalizePromptText(input.techSpecMarkdown)}` : null,
    input.repoContext ? `Repo context:\n${formatRepoContext(input.repoContext)}` : null,
    input.traceOutlines && Object.keys(input.traceOutlines).length > 0
      ? `Trace outlines:\n${stringifyPromptValue(input.traceOutlines)}`
      : null
  ].filter((value): value is string => Boolean(value));

const buildCheckPrompt = (
  systemPrompt: string,
  input: PhaseCheckInput,
  artifactDescription: string
): PromptBuildResult => {
  const questionPolicy = getQuestionPolicy(input.phase);
  const allowedDecisionTypes = Array.from(
    new Set(questionPolicy.allowedDecisionTypes.map((decisionType) => normalizeDecisionType(decisionType)))
  );
  const maxQuestions = questionPolicy.maxQuestions;
  const promptPolicy = getPromptPolicy(input.phase);
  const requiresInitialConsultation = input.phase === "brief" && input.requiresInitialConsultation;
  const requiredStarterQuestionCount =
    input.phase !== "brief" ? (input.requiredStarterQuestionCount ?? 0) : 0;
  const requiresStarterQuestions = requiredStarterQuestionCount > 0;

  return {
    systemPrompt,
    userPrompt: [
      `Decide whether SpecFlow can create the ${artifactDescription} now or must ask targeted blocker questions first.`,
      input.validationFeedback?.trim()
        ? `Additional validation feedback is attached below. If it exposes a real blocker for this artifact, ask the smallest set of targeted follow-up questions needed to resolve it.\n\nValidation feedback:\n${truncatePromptSection(normalizePromptText(input.validationFeedback).trim(), MAX_VALIDATION_FEEDBACK_SECTION_CHARS)}`
        : null,
      "Rules:",
      ...(requiresInitialConsultation
        ? [
            '- This is the first required Brief consultation for a fresh project. You must return "ask".',
            "- Ask exactly 4 short consultation questions that cover the primary problem, primary first-release user, success outcomes, and hard boundaries.",
            "- Do not return proceed or an empty questions array for this first Brief consultation."
          ]
        : requiresStarterQuestions
          ? [
              `- This is the first required ${artifactDescription} consultation before any ${artifactDescription.toLowerCase()} artifact exists. You must return "ask".`,
              `- Ask exactly ${requiredStarterQuestionCount} short blocker questions that will materially shape the first ${artifactDescription.toLowerCase()} draft.`,
              input.phase === "core-flows"
                ? '- Cover three different decision areas: the primary user journey, one meaningful edge or degraded path using decisionType "branch" or "failure-mode", and one flow condition that changes the map using decisionType "state".'
                : "- Cover distinct decision areas that would materially change the first draft.",
              `- Do not return proceed or an empty questions array for this first ${artifactDescription} consultation.`
            ]
        : [
            '- Default to "proceed". Ask questions only when missing information would materially change the current artifact and would be costly to unwind later.'
          ]),
      `- You may ask at most ${maxQuestions} question${maxQuestions === 1 ? "" : "s"}.`,
      "- Keep the set as short as possible. Ask only the highest-leverage blocker questions.",
      "- If you ask, every question must explain why it blocks this artifact and include an assumptionIfUnanswered.",
      '- Every question must use "select", "multi-select", or "boolean".',
      '- For "select" or "multi-select" questions, prefer 2 to 5 options. Include a recommendedOption when one choice is clearly best.',
      '- For "boolean" questions, do not include options, optionHelp, or recommendedOption. Write the label so yes or no is clear on its own.',
      '- Do not include "Other" in options. Set allowCustomAnswer to true only when the user may reasonably need a custom answer outside the finite options.',
      `- Allowed decisionType values for this artifact are: ${allowedDecisionTypes.join(", ")}.`,
      allowedDecisionTypes.includes("quality-strategy")
        ? '- Use decisionType "quality-strategy" for testing, observability, and quality strategy questions. "verification" is a legacy alias only.'
        : null,
      input.refinementHistory && input.refinementHistory.length > 0
        ? "- Do not repeat a concern already captured in refinement history. Reopen an earlier concern only when a contradiction, missing dependency, or later-stage implementation consequence still blocks this artifact."
        : null,
      input.refinementHistory && input.refinementHistory.length > 0
        ? "- If you intentionally reopen an earlier concern, whether from this step or an earlier step, include reopensQuestionIds with the earlier question ids and make the downstream consequence explicit in whyThisBlocks."
        : null,
      input.refinementHistory && input.refinementHistory.length > 0
        ? "- Never ask the same concern twice in one stage. If a narrower follow-up is unavoidable, change the decision boundary rather than paraphrasing the earlier question."
        : null,
      input.refinementHistory && input.refinementHistory.length > 0
        ? "- If refinement history already contains an answer for the underlying concern, only ask again when you can materially narrow the decision boundary beyond that recorded answer. Do not restate the same concern under a new id."
        : null,
      input.validationFeedback?.trim()
        ? "- Treat validation feedback as evidence that ticket planning could not commit safely from the current artifact set."
        : null,
      input.validationFeedback?.trim()
        ? "- Do not dismiss feedback just because it is phrased as missing tickets, missing coverage, or missing implementation work. Translate it back into the missing artifact-level decision, rule, constraint, or quality bar."
        : null,
      input.validationFeedback?.trim()
        ? '- If that missing detail belongs to this artifact and is not explicit enough to guide ticket planning, return "ask" with the smallest targeted follow-up questions needed to lock it.'
        : null,
      input.validationFeedback?.trim()
        ? '- If this artifact already makes the needed decision explicit and the feedback only reflects a ticket-planning miss, return "proceed" so Validation can repair the plan instead of re-asking the user.'
        : null,
      ...(requiresInitialConsultation || requiresStarterQuestions
        ? []
        : ["- If you can proceed, return an empty questions array and include any explicit assumptions you are making."]),
      "- Do not ask broad discovery questions. Ask only about blockers for this artifact.",
      "- Phrase each question so the user can answer it quickly without reading a long explanation.",
      ...promptPolicy.checkRules,
      ...getArtifactSections(input)
    ].filter((value): value is string => Boolean(value)).join("\n\n")
  };
};

const buildGenerationPrompt = (
  systemPrompt: string,
  input: SpecGenInput,
  artifactDescription: string,
  extraRules: string[]
): PromptBuildResult => ({
  systemPrompt,
  userPrompt: [
    `Generate the ${artifactDescription} markdown document for this project.`,
    "Return both polished markdown and a structured traceOutline with concise fact lists. The traceOutline must only include facts grounded in the markdown you generated.",
    PLANNER_PRODUCT_DESIGN_CHARTER_SECTION,
    PLANNER_TITLE_STYLE_SECTION,
    ...extraRules,
    `Assumptions:\n${JSON.stringify(input.assumptions, null, 2)}`,
    ...getArtifactSections(input)
  ].join("\n\n")
});

const buildTraceOutlinePrompt = (systemPrompt: string, input: SpecGenInput & { artifact: RefinementStep }): PromptBuildResult => ({
  systemPrompt,
  userPrompt: [
    `Generate a structured traceOutline for the ${input.artifact} artifact.`,
    "Return the original markdown unchanged in the markdown field and produce a traceOutline with concise fact lists grouped into meaningful sections.",
    ...getArtifactSections(input)
  ].join("\n\n")
});

const buildReviewPrompt = (systemPrompt: string, input: ReviewRunInput): PromptBuildResult => ({
  systemPrompt,
  userPrompt: [
    `Review this project artifact set for ${input.kind}.`,
    "Rules:",
    PLANNER_REVIEW_PRODUCT_DESIGN_SECTION,
    PLANNER_ENGINEERING_FOUNDATIONS_SECTION,
    "- Identify only material blockers and meaningful warnings.",
    "- Use traceabilityGaps for missing or inconsistent links between artifacts.",
    "- Use assumptions for important implicit decisions the team should make explicit.",
    "- Use recommendedFixes for concrete next actions.",
    "- Do not restate the entire artifact. Be concise and specific.",
    ...getArtifactSections(input),
    input.coverageItems && input.coverageItems.length > 0
      ? `Coverage items:\n${JSON.stringify(input.coverageItems, null, 2)}`
      : null,
    input.uncoveredCoverageItemIds && input.uncoveredCoverageItemIds.length > 0
      ? `Uncovered coverage item IDs:\n${JSON.stringify(input.uncoveredCoverageItemIds, null, 2)}`
      : null,
    input.tickets && input.tickets.length > 0
      ? `Generated tickets:\n${JSON.stringify(input.tickets, null, 2)}`
      : null
  ].filter((value): value is string => Boolean(value)).join("\n\n")
});

export const buildPlannerPrompt = (
  job: PlannerJob,
  input: ClarifyHelpInput | PhaseCheckInput | ReviewRunInput | SpecGenInput | PlanInput | TriageInput,
  agentsMd: string
): PromptBuildResult => {
  const systemPrompt = [
    "You are SpecFlow's planner service.",
    "Use the AGENTS.md policy context below as hard constraints.",
    "Do not include markdown code fences.",
    outputContract(job),
    "AGENTS.md:",
    agentsMd.trim() || "(empty)"
  ].join("\n\n");

  if (job === "brief-check") {
    return buildCheckPrompt(systemPrompt, input as PhaseCheckInput, "Brief");
  }

  if (job === "core-flows-check") {
    return buildCheckPrompt(systemPrompt, input as PhaseCheckInput, "Core flows");
  }

  if (job === "prd-check") {
    return buildCheckPrompt(systemPrompt, input as PhaseCheckInput, "PRD");
  }

  if (job === "tech-spec-check") {
    return buildCheckPrompt(systemPrompt, input as PhaseCheckInput, "Tech spec");
  }

  if (job === "clarify-help") {
    const clarifyHelpInput = input as ClarifyHelpInput;
    const optionsSection =
      clarifyHelpInput.question.options && clarifyHelpInput.question.options.length > 0
        ? `Options:\n${clarifyHelpInput.question.options.map((option) => `- ${option}`).join("\n")}`
        : "Options:\n- No predefined options";

    return {
      systemPrompt,
      userPrompt: [
        "Help the user answer one refinement question for a planning workflow.",
        "Rules:",
        "- Be concise and practical.",
        "- Explain what the question is trying to decide and why it matters for this specific artifact.",
        "- If the user supplied a note, answer it directly before giving decision guidance.",
        "- Compare the relevant options when options are provided.",
        "- End with a concrete recommendation only if one option is clearly the best fit from the project description and saved context.",
        `Project description:\n${normalizePromptText(clarifyHelpInput.initiativeDescription)}`,
        `Saved refinement context:\n${stringifyPromptValue(clarifyHelpInput.savedContext)}`,
        `Question:\n${normalizePromptText(clarifyHelpInput.question.label)}`,
        `Question type: ${clarifyHelpInput.question.type}`,
        optionsSection,
        clarifyHelpInput.note?.trim()
          ? `User note:\n${normalizePromptText(clarifyHelpInput.note).trim()}`
          : "User note:\n(none)"
      ].join("\n\n")
    };
  }

  if (job === "brief-gen") {
    return buildGenerationPrompt(systemPrompt, input as SpecGenInput, "Brief", [
      "Capture the problem, target user, goals, success criteria, scope, constraints, and explicit assumptions.",
      'Return initiativeTitle as a short descriptive project name. It must be 2 to 3 words, sentence case, no trailing punctuation, and clear enough to identify the project without sounding like marketing copy.',
      'The first markdown heading must exactly match initiativeTitle. Do not use "# Brief" as the H1.',
      ...getPromptPolicy("brief").generationRules,
      'The traceOutline should include sections for "users", "goals", "constraints", "assumptions", and "success-criteria".'
    ]);
  }

  if (job === "core-flows-gen") {
    return buildGenerationPrompt(systemPrompt, input as SpecGenInput, "Core flows", [
      "Describe the primary flow, entry points, end states, alternate or destructive paths, flow conditions, and important empty/loading/error or degraded states.",
      "The flow may be user-facing, operator-facing, or system/process-facing; do not assume a screen-based UI.",
      ...getPromptPolicy("core-flows").generationRules,
      'The traceOutline should include sections for "actors", "flows", "steps", "states", and "edge-cases".'
    ]);
  }

  if (job === "prd-gen") {
    return buildGenerationPrompt(systemPrompt, input as SpecGenInput, "PRD", [
      "Expand the product behavior, requirements, rules, failure behavior, scope boundaries, visible performance or compatibility promises, acceptance framing, and non-goals.",
      PLANNER_ENGINEERING_FOUNDATIONS_SECTION,
      "Make user-visible security, privacy, offline, recovery, performance, and support constraints explicit when they shape the shipped product contract.",
      ...getPromptPolicy("prd").generationRules,
      'The traceOutline should include sections for "requirements", "rules", "acceptance-criteria", and "non-goals".'
    ]);
  }

  if (job === "tech-spec-gen") {
    return buildGenerationPrompt(systemPrompt, input as SpecGenInput, "Tech spec", [
      "Cover architecture, major components, data flow, constraints, implementation approach, risks, and quality strategy.",
      PLANNER_ENGINEERING_FOUNDATIONS_SECTION,
      'Include a dedicated "Engineering foundations" section that states the repository-critical constraints the implementation must preserve continuously.',
      ...getPromptPolicy("tech-spec").generationRules,
      'The traceOutline should include sections for "components", "data-entities", "decisions", "risks", "quality-strategy", and "engineering-foundations".'
    ]);
  }

  if (job === "trace-outline") {
    return buildTraceOutlinePrompt(systemPrompt, input as SpecGenInput & { artifact: RefinementStep });
  }

  if (job === "review") {
    return buildReviewPrompt(systemPrompt, input as ReviewRunInput);
  }

  if (job === "plan" || job === "plan-repair") {
    const planInput = input as PlanInput;
    const isRepair = job === "plan-repair";
    const traceOutlineSection =
      Object.keys(planInput.traceOutlines).length > 0
        ? `Trace outlines:\n${stringifyPromptValue(planInput.traceOutlines)}`
        : null;
    const repoSection = planInput.repoContext
      ? [
          "Repository context (use this to generate accurate file paths — only reference files that exist):",
          `Total tracked files: ${planInput.repoContext.totalFiles}`,
          `File tree:\n${planInput.repoContext.fileTree}`,
          `Key config files:\n${planInput.repoContext.configSummary}`
        ].join("\n")
      : null;
    const validationFeedbackSection = buildPlanValidationFeedbackSection(planInput);

    const parts = [
      isRepair
        ? "Repair the existing ordered phase plan and ticket breakdown."
        : "Generate an ordered phase plan and ticket breakdown. The textual phase/ticket structure is canonical. Use the repository file tree to generate accurate fileTargets — only reference paths that exist in the repo.",
      isRepair
        ? "Keep the existing phase and ticket structure where it already works. Make the smallest changes needed to satisfy every validation issue."
        : validationFeedbackSection,
      isRepair
        ? "Do not drop valid coverage assignments or rewrite unaffected tickets just to reshuffle the plan."
        : null,
      "Rules:",
      "- Return a JSON object with both phases and uncoveredCoverageItemIds.",
      "- phases must always be an array, even when the plan only needs one phase.",
      "- Every phase must include name, order, and tickets.",
      isRepair
        ? "- Resolve every validation issue listed below."
        : null,
      isRepair
        ? "- Reuse the existing phases, ticket titles, descriptions, acceptance criteria, and fileTargets unless a specific change is required to fix coverage."
        : null,
      isRepair
        ? "- Every missing coverage item must appear in some ticket.coverageItemIds or in uncoveredCoverageItemIds."
        : null,
      TICKET_PLAN_PRODUCT_DESIGN_SECTION,
      PLANNER_ENGINEERING_FOUNDATIONS_SECTION,
      PLANNER_TITLE_STYLE_SECTION,
      "If validation feedback identifies missing tickets or missing coverage that the existing artifacts already imply, repair the ticket plan directly instead of bouncing the issue back to the user.",
      "Only leave work uncovered when the current artifacts still lack enough explicit direction to plan it safely.",
      "Every coverage item must be accounted for. Assign each one to one or more tickets through coverageItemIds, or list it in uncoveredCoverageItemIds when the current plan intentionally leaves it out.",
      "Keep phase names short and scannable. Use 1 to 4 words in sentence case.",
      "Keep ticket titles short and scannable. Use 2 to 6 words in sentence case.",
      'Write ticket descriptions as one concrete sentence of plain product language. State what the ticket changes or delivers. Do not use filler rationale headings or phrasing such as "Why this matters", "This enables", "used by backend services", or "create or verify presence of".',
      "Write acceptance criteria as specific, observable outcomes that can be judged from a code diff. Avoid vague criteria like 'works well' or 'is intuitive'.",
      "Each ticket must have at least one coverageItemId unless the plan is invalid.",
      `Project description:\n${normalizePromptText(planInput.initiativeDescription)}`,
      traceOutlineSection,
      `Coverage items:\n${stringifyPromptValue(planInput.coverageItems)}`
    ];

    if (!isRepair && repoSection) {
      parts.push(repoSection);
    }

    if (isRepair) {
      parts.push(validationFeedbackSection);
    }

    return {
      systemPrompt,
      userPrompt: parts.filter((value): value is string => Boolean(value)).join("\n\n")
    };
  }

  const triageInput = input as TriageInput;
  return {
    systemPrompt,
    userPrompt: [
      "Assess whether the task is focused enough for Quick Build or should become a larger project.",
      "Treat information architecture and product design as first-class requirements when the task affects a user-facing, operator-facing, or workflow-facing surface. Reflect that in the ticketDraft description and acceptanceCriteria instead of treating it as later polish.",
      PLANNER_TITLE_STYLE_SECTION,
      'If decision is "too-large", initiativeTitle must be a 2 to 3 word project name in sentence case.',
      'If decision is "ok", ticketDraft.title must be a 2 to 6 word task title in sentence case.',
      `Task description:\n${triageInput.description}`
    ].join("\n\n")
  };
};
