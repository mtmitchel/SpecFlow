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
        '    { "name": "string", "order": 1, "tickets": [{ "title": "string", "description": "string", "acceptanceCriteria": ["string"], "fileTargets": ["string"] }] }',
        "  ],",
        '  "mermaidDiagram": "string|null (optional Mermaid graph LR diagram for phase dependencies when it materially clarifies the plan)"',
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
): PromptBuildResult => ({
  systemPrompt,
  userPrompt: [
    `Decide whether SpecFlow can create the ${artifactDescription} now or must ask targeted blocker questions first.`,
    "Rules:",
    '- Default to "proceed". Ask questions only when missing information would materially change the current artifact and would be costly to unwind later.',
    `- You may ask at most ${maxQuestions} question${maxQuestions === 1 ? "" : "s"}.`,
    "- If you ask, every question must explain why it blocks this artifact, include an assumptionIfUnanswered, and use finite options whenever reasonable.",
    "- If you can proceed, return an empty questions array and include any explicit assumptions you are making.",
    "- Do not ask broad discovery questions. Ask only about blockers for this artifact.",
    "- Use text questions only when the answer cannot be represented as a finite set of meaningful options.",
    ...getArtifactSections(input)
  ].join("\n\n")
});

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
    ...getArtifactSections(input)
  ].join("\n\n")
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
    return buildCheckPrompt(systemPrompt, input as PhaseCheckInput, 2, "Brief");
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
      "Only include mermaidDiagram when a compact dependency diagram materially clarifies the plan. If the phase order is already obvious from the text, return null for mermaidDiagram.",
      `Initiative description:\n${planInput.initiativeDescription}`,
      `Brief:\n${planInput.briefMarkdown}`,
      `Core flows:\n${planInput.coreFlowsMarkdown}`,
      `PRD:\n${planInput.prdMarkdown}`,
      `Tech spec:\n${planInput.techSpecMarkdown}`
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
