import type { RenderBundleInput, RenderBundleOutput } from "./types.js";
import {
  BUNDLE_ENGINEERING_FOUNDATIONS_SECTION,
  BUNDLE_PRODUCT_DESIGN_SECTION,
} from "../prompt-guidance.js";
import { isEngineeringFoundationCoverageItem } from "../planner/ticket-coverage.js";

const renderContextSection = (contextFiles: RenderBundleInput["contextFiles"]): string => {
  if (contextFiles.length === 0) {
    return "No additional context files included.";
  }

  return contextFiles
    .map(
      (file) =>
        [
          `### ${file.relativePath}`,
          "```",
          file.content.trimEnd(),
          "```"
        ].join("\n")
    )
    .join("\n\n");
};

const renderTicketCore = (input: RenderBundleInput): string => {
  const hasBackground = input.ticket.description.trim() && input.ticket.description.trim() !== input.ticket.title.trim();
  const coveredItems = input.coveredItems.length
    ? input.coveredItems.map((item) => `- [${item.sourceStep} · ${item.sectionLabel}] ${item.text}`).join("\n")
    : "- (none)";
  const engineeringFoundations = input.coveredItems.filter(
    isEngineeringFoundationCoverageItem
  ).length
    ? input.coveredItems
        .filter(isEngineeringFoundationCoverageItem)
        .map(
          (item) => `- [${item.sourceStep} · ${item.sectionLabel}] ${item.text}`
        )
        .join("\n")
    : "- No ticket-specific engineering foundation items were mapped. Follow AGENTS.md and the guardrails below for the whole task.";

  const criteria = input.ticket.acceptanceCriteria.length
    ? input.ticket.acceptanceCriteria.map((criterion) => `- ${criterion.text}`).join("\n")
    : "- (none)";

  const targets = input.ticket.fileTargets.length
    ? input.ticket.fileTargets.map((target) => `- ${target}`).join("\n")
    : "- (none)";

  return [
    `# Ticket ${input.ticket.id}: ${input.ticket.title}`,
    "",
    "## Goal",
    input.ticket.title,
    "",
    "## Done means",
    criteria,
    "",
    hasBackground ? "## Background" : null,
    hasBackground ? input.ticket.description : null,
    hasBackground ? "" : null,
    BUNDLE_PRODUCT_DESIGN_SECTION,
    "",
    BUNDLE_ENGINEERING_FOUNDATIONS_SECTION,
    "",
    "## Main files",
    targets,
    "",
    "## Covered engineering foundations",
    engineeringFoundations,
    "",
    "## Covered spec items",
    coveredItems,
    "",
    "## Implementation notes",
    input.ticket.implementationPlan || "(not provided)",
    "",
    `## Export Mode: ${input.exportMode}`,
    input.sourceRunId ? `- sourceRunId: ${input.sourceRunId}` : "- sourceRunId: null",
    input.sourceFindingId ? `- sourceFindingId: ${input.sourceFindingId}` : "- sourceFindingId: null",
    "",
    "## AGENTS.md",
    "```md",
    input.agentsMd.trimEnd() || "(empty)",
    "```",
    "",
    "## Context files",
    renderContextSection(input.contextFiles)
  ].filter((section): section is string => section !== null).join("\n");
};

const renderClaudeCode = (input: RenderBundleInput): RenderBundleOutput => {
  const core = renderTicketCore(input);
  const prompt = [
    "<specflow_bundle>",
    "  <agent>claude-code</agent>",
    "  <instructions>Follow CLAUDE.md conventions and satisfy all acceptance criteria exactly.</instructions>",
    "  <content>",
    core,
    "  </content>",
    "</specflow_bundle>"
  ].join("\n");

  return {
    prompt,
    flatString: prompt,
    rendererFiles: [
      {
        relativePath: "bundle/CLAUDE.md",
        content: [
          "# CLAUDE.md",
          "",
          "Use the XML prompt payload in PROMPT.md as the authoritative task definition.",
          "Do not deviate from AGENTS.md project conventions."
        ].join("\n")
      }
    ]
  };
};

const renderCodexCli = (input: RenderBundleInput): RenderBundleOutput => {
  const core = renderTicketCore(input);
  const prompt = [
    "# Codex Task Bundle",
    "",
    "You are running in Codex CLI. Execute only the scoped task below.",
    "Follow AGENTS.md conventions strictly.",
    "",
    core
  ].join("\n");

  return {
    prompt,
    flatString: prompt,
    rendererFiles: [
      {
        relativePath: "bundle/CODEX.md",
        content: [
          "# CODEX.md",
          "",
          "PROMPT.md contains the ticket scope, acceptance criteria, and context payload.",
          "Respect AGENTS.md constraints when implementing changes."
        ].join("\n")
      }
    ]
  };
};

const renderOpenCode = (input: RenderBundleInput): RenderBundleOutput => {
  const core = renderTicketCore(input);
  const prompt = [
    "# OpenCode Context Pack",
    "",
    "Load AGENTS.md first, then process PROMPT.md as the run objective.",
    "",
    core
  ].join("\n");

  return {
    prompt,
    flatString: prompt,
    rendererFiles: [
      {
        relativePath: "bundle/OPENCODE.md",
        content: [
          "# OPENCODE.md",
          "",
          "1. Load AGENTS.md.",
          "2. Apply PROMPT.md instructions.",
          "3. Keep output focused to file targets unless required for drift-safe changes."
        ].join("\n")
      }
    ]
  };
};

const renderGeneric = (input: RenderBundleInput): RenderBundleOutput => {
  const prompt = [
    "SpecFlow Task Bundle",
    "",
    renderTicketCore(input)
  ].join("\n");

  return {
    prompt,
    flatString: prompt,
    rendererFiles: []
  };
};

export const renderBundleForAgent = (input: RenderBundleInput): RenderBundleOutput => {
  switch (input.agentTarget) {
    case "claude-code":
      return renderClaudeCode(input);
    case "codex-cli":
      return renderCodexCli(input);
    case "opencode":
      return renderOpenCode(input);
    case "generic":
      return renderGeneric(input);
    default: {
      const exhaustive: never = input.agentTarget;
      throw new Error(`Unsupported agent target: ${String(exhaustive)}`);
    }
  }
};
