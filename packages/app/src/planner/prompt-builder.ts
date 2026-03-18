import type {
  ClarifyHelpInput,
  PhaseCheckInput,
  PlanInput,
  RefinementStep,
  ReviewRunInput,
  SpecGenInput,
  TriageInput
} from "./types.js";

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
  | "triage";

export interface PromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
}

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
        '    { "id": "string", "label": "string", "whyThisBlocks": "string", "affectedArtifact": "brief|core-flows|prd|tech-spec", "decisionType": "scope|user|workflow|platform|data|security|integration|success-metric", "type": "text|select|multi-select|boolean", "assumptionIfUnanswered": "string", "options": ["string"], "optionHelp": { "option": "one sentence explanation" }, "recommendedOption": "string|null" }',
        "  ],",
        '  "assumptions": ["string"]',
        "}"
      ].join("\n");
    case "clarify-help":
      return ['Respond ONLY as JSON:\n{\n  "guidance": "string"\n}'].join("\n");
    case "brief-gen":
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
  traceOutlines?: Partial<Record<RefinementStep, { sections: Array<{ key: string; label: string; items: string[] }> }>>;
}): string[] =>
  [
    `Initiative description:\n${input.initiativeDescription}`,
    input.savedContext && Object.keys(input.savedContext).length > 0
      ? `Saved refinement context:\n${JSON.stringify(input.savedContext, null, 2)}`
      : null,
    input.briefMarkdown?.trim() ? `Brief:\n${input.briefMarkdown}` : null,
    input.coreFlowsMarkdown?.trim() ? `Core flows:\n${input.coreFlowsMarkdown}` : null,
    input.prdMarkdown?.trim() ? `PRD:\n${input.prdMarkdown}` : null,
    input.techSpecMarkdown?.trim() ? `Tech spec:\n${input.techSpecMarkdown}` : null,
    input.traceOutlines && Object.keys(input.traceOutlines).length > 0
      ? `Trace outlines:\n${JSON.stringify(input.traceOutlines, null, 2)}`
      : null
  ].filter((value): value is string => Boolean(value));

const buildCheckPrompt = (
  systemPrompt: string,
  input: PhaseCheckInput,
  maxQuestions: number,
  artifactDescription: string
): PromptBuildResult => {
  const requiresInitialConsultation = input.phase === "brief" && input.requiresInitialConsultation;
  const requiredStarterQuestionCount =
    input.phase !== "brief" ? (input.requiredStarterQuestionCount ?? 0) : 0;
  const requiresStarterQuestions = requiredStarterQuestionCount > 0;

  return {
    systemPrompt,
    userPrompt: [
      `Decide whether SpecFlow can create the ${artifactDescription} now or must ask targeted blocker questions first.`,
      "Rules:",
      ...(requiresInitialConsultation
        ? [
            '- This is the first required Brief consultation for a fresh initiative. You must return "ask".',
            "- Ask exactly 4 short consultation questions that cover the primary problem, primary first-release user, success criteria, and hard constraints or platform/package targets.",
            "- Do not return proceed or an empty questions array for this first Brief consultation."
          ]
        : requiresStarterQuestions
          ? [
              `- This is the first required ${artifactDescription} consultation before any ${artifactDescription.toLowerCase()} artifact exists. You must return "ask".`,
              `- Ask exactly ${requiredStarterQuestionCount} short blocker questions that will materially shape the first ${artifactDescription.toLowerCase()} draft.`,
              input.phase === "core-flows"
                ? "- Cover three different decision areas: the primary user journey, a meaningful edge or destructive flow, and a product behavior or state rule that changes the flow map."
                : "- Cover distinct decision areas that would materially change the first draft.",
              `- Do not return proceed or an empty questions array for this first ${artifactDescription} consultation.`
            ]
        : [
            '- Default to "proceed". Ask questions only when missing information would materially change the current artifact and would be costly to unwind later.'
          ]),
      `- You may ask at most ${maxQuestions} question${maxQuestions === 1 ? "" : "s"}.`,
      "- Keep the set as short as possible. Ask only the highest-leverage blocker questions.",
      "- If you ask, every question must explain why it blocks this artifact and include an assumptionIfUnanswered.",
      '- Every question must use "select", "multi-select", or "boolean". Never use "text".',
      "- Prefer 2 to 5 options per question. Include a recommendedOption when one choice is clearly best.",
      ...(requiresInitialConsultation || requiresStarterQuestions
        ? []
        : ["- If you can proceed, return an empty questions array and include any explicit assumptions you are making."]),
      "- Do not ask broad discovery questions. Ask only about blockers for this artifact.",
      "- Phrase each question so the user can answer it quickly without reading a long explanation.",
      ...getArtifactSections(input)
    ].join("\n\n")
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
    `Generate the ${artifactDescription} markdown document for this initiative.`,
    "Return both polished markdown and a structured traceOutline with concise fact lists. The traceOutline must only include facts grounded in the markdown you generated.",
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
    `Review this initiative artifact set for ${input.kind}.`,
    "Rules:",
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
    return buildCheckPrompt(systemPrompt, input as PhaseCheckInput, 4, "Brief");
  }

  if (job === "core-flows-check") {
    return buildCheckPrompt(systemPrompt, input as PhaseCheckInput, 2, "Core flows");
  }

  if (job === "prd-check") {
    return buildCheckPrompt(systemPrompt, input as PhaseCheckInput, 3, "PRD");
  }

  if (job === "tech-spec-check") {
    return buildCheckPrompt(systemPrompt, input as PhaseCheckInput, 3, "Tech spec");
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
        "- End with a concrete recommendation only if one option is clearly the best fit from the initiative description and saved context.",
        `Initiative description:\n${clarifyHelpInput.initiativeDescription}`,
        `Saved refinement context:\n${JSON.stringify(clarifyHelpInput.savedContext, null, 2)}`,
        `Question:\n${clarifyHelpInput.question.label}`,
        `Question type: ${clarifyHelpInput.question.type}`,
        optionsSection,
        clarifyHelpInput.note?.trim() ? `User note:\n${clarifyHelpInput.note.trim()}` : "User note:\n(none)"
      ].join("\n\n")
    };
  }

  if (job === "brief-gen") {
    return buildGenerationPrompt(systemPrompt, input as SpecGenInput, "Brief", [
      "Capture the problem, target user, goals, success criteria, scope, constraints, and explicit assumptions.",
      'Use a neutral top-level heading. If the initiative does not explicitly provide a product name, the heading must be exactly "# Brief". Never invent or assign a product, app, or code name.',
      'The traceOutline should include sections for "users", "goals", "constraints", "assumptions", and "success-criteria".'
    ]);
  }

  if (job === "core-flows-gen") {
    return buildGenerationPrompt(systemPrompt, input as SpecGenInput, "Core flows", [
      "Describe the primary user journeys, entry points, end states, branching paths, major screens or states, and important empty/loading/error states.",
      'The traceOutline should include sections for "actors", "flows", "steps", "states", and "edge-cases".'
    ]);
  }

  if (job === "prd-gen") {
    return buildGenerationPrompt(systemPrompt, input as SpecGenInput, "PRD", [
      "Expand the product behavior, requirements, rules, scope boundaries, acceptance framing, and non-goals.",
      'The traceOutline should include sections for "requirements", "rules", "acceptance-criteria", and "non-goals".'
    ]);
  }

  if (job === "tech-spec-gen") {
    return buildGenerationPrompt(systemPrompt, input as SpecGenInput, "Tech spec", [
      "Cover architecture, major components, data flow, constraints, implementation approach, risks, and verification hooks.",
      'The traceOutline should include sections for "components", "data-entities", "decisions", "risks", and "verification-hooks".'
    ]);
  }

  if (job === "trace-outline") {
    return buildTraceOutlinePrompt(systemPrompt, input as SpecGenInput & { artifact: RefinementStep });
  }

  if (job === "review") {
    return buildReviewPrompt(systemPrompt, input as ReviewRunInput);
  }

  if (job === "plan") {
    const planInput = input as PlanInput;
    const repoSection = planInput.repoContext
      ? [
          "Repository context (use this to generate accurate file paths — only reference files that exist):",
          `Total tracked files: ${planInput.repoContext.totalFiles}`,
          `File tree:\n${planInput.repoContext.fileTree}`,
          `Key config files:\n${planInput.repoContext.configSummary}`
        ].join("\n")
      : null;

    const parts = [
      "Generate an ordered phase plan and ticket breakdown. The textual phase/ticket structure is canonical. Use the repository file tree to generate accurate fileTargets — only reference paths that exist in the repo.",
      "Every coverage item must be accounted for. Assign each one to one or more tickets through coverageItemIds, or list it in uncoveredCoverageItemIds when the current plan intentionally leaves it out.",
      "Write acceptance criteria as specific, observable outcomes that can be judged from a code diff. Avoid vague criteria like 'works well' or 'is intuitive'.",
      "Each ticket must have at least one coverageItemId unless the plan is invalid.",
      `Initiative description:\n${planInput.initiativeDescription}`,
      `Brief:\n${planInput.briefMarkdown}`,
      `Core flows:\n${planInput.coreFlowsMarkdown}`,
      `PRD:\n${planInput.prdMarkdown}`,
      `Tech spec:\n${planInput.techSpecMarkdown}`,
      `Coverage items:\n${JSON.stringify(planInput.coverageItems, null, 2)}`
    ];

    if (repoSection) {
      parts.push(repoSection);
    }

    return { systemPrompt, userPrompt: parts.join("\n\n") };
  }

  const triageInput = input as TriageInput;
  return {
    systemPrompt,
    userPrompt: [
      "Assess whether the task is focused enough for Quick Build or should become a larger initiative.",
      `Task description:\n${triageInput.description}`
    ].join("\n\n")
  };
};
