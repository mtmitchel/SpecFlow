import type { ClarifyInput, PlanInput, SpecGenInput, TriageInput } from "./types.js";

export type PlannerJob = "clarify" | "spec-gen" | "plan" | "triage";

export interface PromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
}

const outputContract = (job: PlannerJob): string => {
  switch (job) {
    case "clarify":
      return [
        "Respond ONLY as JSON:",
        "{",
        '  "questions": [',
        '    { "id": "string", "label": "string", "type": "text|select|multi-select|boolean", "options": ["string"] }',
        "  ]",
        "}"
      ].join("\n");
    case "spec-gen":
      return [
        "Respond ONLY as JSON:",
        "{",
        '  "briefMarkdown": "string",',
        '  "prdMarkdown": "string",',
        '  "techSpecMarkdown": "string"',
        "}"
      ].join("\n");
    case "plan":
      return [
        "Respond ONLY as JSON:",
        "{",
        '  "phases": [',
        '    { "name": "string", "order": 1, "tickets": [{ "title": "string", "description": "string", "acceptanceCriteria": ["string"], "fileTargets": ["string"] }] }',
        "  ]",
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

export const buildPlannerPrompt = (
  job: PlannerJob,
  input: ClarifyInput | SpecGenInput | PlanInput | TriageInput,
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

  if (job === "clarify") {
    const clarifyInput = input as ClarifyInput;
    return {
      systemPrompt,
      userPrompt: [
        "Generate targeted follow-up clarification questions for this initiative idea.",
        `Description:\n${clarifyInput.description}`
      ].join("\n\n")
    };
  }

  if (job === "spec-gen") {
    const specInput = input as SpecGenInput;
    return {
      systemPrompt,
      userPrompt: [
        "Generate the Brief, PRD, and Tech Spec markdown documents.",
        `Initiative description:\n${specInput.initiativeDescription}`,
        `Clarification answers:\n${JSON.stringify(specInput.answers, null, 2)}`
      ].join("\n\n")
    };
  }

  if (job === "plan") {
    const planInput = input as PlanInput;
    return {
      systemPrompt,
      userPrompt: [
        "Generate an ordered phase plan and ticket breakdown.",
        `Initiative description:\n${planInput.initiativeDescription}`,
        `Brief:\n${planInput.briefMarkdown}`,
        `PRD:\n${planInput.prdMarkdown}`,
        `Tech Spec:\n${planInput.techSpecMarkdown}`
      ].join("\n\n")
    };
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
