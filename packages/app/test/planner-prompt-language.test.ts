import { describe, expect, it } from "vitest";
import { buildPlannerPrompt } from "../src/planner/prompt-builder.js";

describe("planner prompt language", () => {
  it("forbids invented product names in brief generation prompts", () => {
    const prompt = buildPlannerPrompt(
      "brief-gen",
      {
        initiativeDescription: "Build a lightweight offline-first note-taking app",
        savedContext: {},
        assumptions: []
      },
      "team-rules: always include tests"
    );

    expect(prompt.userPrompt).toContain('the heading must be exactly "# Brief"');
    expect(prompt.userPrompt).toContain("Never invent or assign a product, app, or code name");
  });

  it("keeps the core-flows check aligned to the three-question budget and flow-only framing", () => {
    const prompt = buildPlannerPrompt(
      "core-flows-check",
      {
        initiativeDescription: "Build a lightweight offline-first note-taking app",
        phase: "core-flows",
        briefMarkdown: "# Brief",
        savedContext: {}
      },
      "team-rules: always include tests"
    );

    expect(prompt.userPrompt).toContain("at most 3 questions");
    expect(prompt.userPrompt).toContain("Ask only about the shape of the user journey");
    expect(prompt.userPrompt).toContain("Do not ask about architecture, storage format, libraries");
    expect(prompt.userPrompt).toContain("Allowed decisionType values for this artifact are: journey, branch, state");
  });

  it("separates PRD and tech-spec refinement questions", () => {
    const prdPrompt = buildPlannerPrompt(
      "prd-check",
      {
        initiativeDescription: "Build a lightweight offline-first note-taking app",
        phase: "prd",
        briefMarkdown: "# Brief",
        coreFlowsMarkdown: "# Core flows",
        savedContext: {}
      },
      "team-rules: always include tests"
    );

    const techSpecPrompt = buildPlannerPrompt(
      "tech-spec-check",
      {
        initiativeDescription: "Build a lightweight offline-first note-taking app",
        phase: "tech-spec",
        briefMarkdown: "# Brief",
        coreFlowsMarkdown: "# Core flows",
        prdMarkdown: "# PRD",
        savedContext: {}
      },
      "team-rules: always include tests"
    );

    expect(prdPrompt.userPrompt).toContain("Ask only about user-visible product behavior");
    expect(prdPrompt.userPrompt).toContain("Do not ask about architecture, data model internals, libraries");
    expect(techSpecPrompt.userPrompt).toContain("Ask only about implementation tradeoffs, architecture, components, data flow");
    expect(techSpecPrompt.userPrompt).toContain("Do not re-ask primary user journeys");
  });

  it("separates PRD and tech-spec generation prompts", () => {
    const prdPrompt = buildPlannerPrompt(
      "prd-gen",
      {
        initiativeDescription: "Build a lightweight offline-first note-taking app",
        savedContext: {},
        assumptions: [],
        briefMarkdown: "# Brief",
        coreFlowsMarkdown: "# Core flows"
      },
      "team-rules: always include tests"
    );

    const techSpecPrompt = buildPlannerPrompt(
      "tech-spec-gen",
      {
        initiativeDescription: "Build a lightweight offline-first note-taking app",
        savedContext: {},
        assumptions: [],
        briefMarkdown: "# Brief",
        coreFlowsMarkdown: "# Core flows",
        prdMarkdown: "# PRD"
      },
      "team-rules: always include tests"
    );

    expect(prdPrompt.userPrompt).toContain("Treat the PRD as the user-visible product contract");
    expect(prdPrompt.userPrompt).toContain("Do not specify architecture, libraries, runtime/package choices");
    expect(techSpecPrompt.userPrompt).toContain("Treat the Tech spec as the implementation contract");
    expect(techSpecPrompt.userPrompt).toContain("Do not restate the full Brief, Core flows, or PRD");
  });

  it("keeps the phase-check output contract aligned to finite option questions", () => {
    const prompt = buildPlannerPrompt(
      "brief-check",
      {
        initiativeDescription: "Build a lightweight offline-first note-taking app",
        phase: "brief",
        savedContext: {},
        requiresInitialConsultation: true
      },
      "team-rules: always include tests"
    );

    expect(prompt.systemPrompt).not.toContain('"type": "text|select|multi-select|boolean"');
    expect(prompt.systemPrompt).toContain('"type": "select|multi-select|boolean"');
    expect(prompt.systemPrompt).toContain('"allowCustomAnswer": true');
    expect(prompt.userPrompt).toContain('Do not include "Other" in options');
  });
});
