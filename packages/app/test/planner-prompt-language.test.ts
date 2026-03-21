import { describe, expect, it } from "vitest";
import { buildPlannerPrompt } from "../src/planner/prompt-builder.js";

describe("planner prompt language", () => {
  it("requires a compact project title in brief generation prompts", () => {
    const prompt = buildPlannerPrompt(
      "brief-gen",
      {
        initiativeDescription: "Build a lightweight offline-first note-taking app",
        savedContext: {},
        refinementHistory: [],
        assumptions: []
      },
      "team-rules: always include tests"
    );

    expect(prompt.systemPrompt).toContain('"initiativeTitle": "string"');
    expect(prompt.userPrompt).toContain("Return initiativeTitle as a short descriptive project name");
    expect(prompt.userPrompt).toContain("It must be 2 to 3 words, sentence case");
    expect(prompt.userPrompt).toContain('Do not use ampersands anywhere in generated names, headings, or body copy. Write "and" instead.');
    expect(prompt.userPrompt).toContain('The first markdown heading must exactly match initiativeTitle');
    expect(prompt.userPrompt).not.toContain('the heading must be exactly "# Brief"');
  });

  it("keeps the core-flows check aligned to the expanded budget and flow-only framing", () => {
    const prompt = buildPlannerPrompt(
      "core-flows-check",
      {
        initiativeDescription: "Build a lightweight offline-first note-taking app",
        phase: "core-flows",
        briefMarkdown: "# Brief",
        savedContext: {},
        refinementHistory: []
      },
      "team-rules: always include tests"
    );

    expect(prompt.userPrompt).toContain("at most 4 questions");
    expect(prompt.userPrompt).toContain("Ask only about the shape of the primary flow");
    expect(prompt.userPrompt).toContain("Do not assume a screen-based UI");
    expect(prompt.userPrompt).toContain("Platform targets, supported device classes, packaging, and distribution strategy belong to Brief or PRD scope boundaries");
    expect(prompt.userPrompt).toContain("Do not ask about architecture, storage format, libraries");
    expect(prompt.userPrompt).toContain("Allowed decisionType values for this artifact are: journey, branch, state, failure-mode");
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
    expect(prdPrompt.userPrompt).toContain("The first PRD consultation must lock at least one explicit scope boundary");
    expect(prdPrompt.userPrompt).toContain("Do not ask about architecture, data model internals, libraries");
    expect(techSpecPrompt.userPrompt).toContain("Ask only about implementation tradeoffs, architecture, components, data flow");
    expect(techSpecPrompt.userPrompt).toContain("The first Tech spec consultation must lock at least one architecture decision");
    expect(techSpecPrompt.userPrompt).toContain("Do not re-ask primary user journeys");
  });

  it("separates PRD and tech-spec generation prompts", () => {
    const prdPrompt = buildPlannerPrompt(
      "prd-gen",
      {
        initiativeDescription: "Build a lightweight offline-first note-taking app",
        savedContext: {},
        refinementHistory: [],
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
        refinementHistory: [],
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
    expect(techSpecPrompt.userPrompt).toContain("quality strategy");
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
    expect(prompt.userPrompt).toContain(
      'For "boolean" questions, do not include options, optionHelp, or recommendedOption'
    );
  });

  it("feeds validation feedback back into the next phase-check prompt", () => {
    const prompt = buildPlannerPrompt(
      "core-flows-check",
      {
        initiativeDescription: "Build a lightweight offline-first note-taking app",
        phase: "core-flows",
        briefMarkdown: "# Brief",
        coreFlowsMarkdown: "# Core flows",
        savedContext: {},
        validationFeedback:
          "Refinement question attachments-offline-failure must not provide options for boolean questions"
      },
      "team-rules: always include tests"
    );

    expect(prompt.userPrompt).toContain("Additional validation feedback is attached below");
    expect(prompt.userPrompt).toContain("ask the smallest set of targeted follow-up questions needed to resolve it");
    expect(prompt.userPrompt).toContain("Validation feedback:");
    expect(prompt.userPrompt).toContain("attachments-offline-failure");
    expect(prompt.userPrompt).toContain("must not provide options for boolean questions");
  });

  it("feeds validation feedback back into the next ticket-plan prompt", () => {
    const prompt = buildPlannerPrompt(
      "plan",
      {
        initiativeDescription: "Build a lightweight offline-first note-taking app",
        briefMarkdown: "# Brief",
        coreFlowsMarkdown: "# Core flows",
        prdMarkdown: "# PRD",
        techSpecMarkdown: "# Tech spec",
        coverageItems: [],
        validationFeedback: {
          summary: "Missing Brief goal: Preserve local note history.",
          issues: [
            {
              kind: "missing-coverage-item",
              message: "Missing Brief goal: Preserve local note history.",
              coverageItemId: "coverage-brief-goals-1",
              coverageItem: {
                id: "coverage-brief-goals-1",
                sourceStep: "brief",
                sectionKey: "goals",
                sectionLabel: "Goals",
                kind: "goal",
                text: "Preserve local note history.",
              },
            },
          ],
        },
        previousInvalidResult: {
          phases: [],
          uncoveredCoverageItemIds: [],
        },
      },
      "team-rules: always include tests"
    );

    expect(prompt.userPrompt).toContain("Validation summary:");
    expect(prompt.userPrompt).toContain("Missing Brief goal: Preserve local note history.");
    expect(prompt.userPrompt).toContain("Coverage item ID: coverage-brief-goals-1");
    expect(prompt.userPrompt).toContain("Previous invalid ticket plan");
  });

  it("uses a focused repair prompt for coverage-fix retries", () => {
    const prompt = buildPlannerPrompt(
      "plan-repair",
      {
        initiativeDescription: "Build a lightweight offline-first note-taking app",
        briefMarkdown: "# Brief",
        coreFlowsMarkdown: "# Core flows",
        prdMarkdown: "# PRD",
        techSpecMarkdown: "# Tech spec",
        coverageItems: [],
        validationFeedback: {
          summary: "Missing Brief goal: Preserve local note history.",
          issues: [
            {
              kind: "missing-coverage-item",
              message: "Missing Brief goal: Preserve local note history.",
              coverageItemId: "coverage-brief-goals-1",
            },
          ],
        },
        previousInvalidResult: {
          phases: [
            {
              name: "Build",
              order: 1,
              tickets: [
                {
                  title: "Implement notes list",
                  description: "Create the notes list surface.",
                  acceptanceCriteria: ["The list renders saved notes."],
                  fileTargets: ["packages/client/src/app/views/initiative-view.tsx"],
                  coverageItemIds: [],
                },
              ],
            },
          ],
          uncoveredCoverageItemIds: [],
        },
      },
      "team-rules: always include tests"
    );

    expect(prompt.userPrompt).toContain("Repair the existing ordered phase plan and ticket breakdown.");
    expect(prompt.userPrompt).toContain("Keep the existing phase and ticket structure where it already works.");
    expect(prompt.userPrompt).toContain("Resolve every validation issue listed below.");
    expect(prompt.userPrompt).toContain("Previous invalid ticket plan");
    expect(prompt.userPrompt).not.toContain("Repository context (use this to generate accurate file paths");
  });

  it("requires short sentence-case phase and ticket titles in planning prompts", () => {
    const prompt = buildPlannerPrompt(
      "plan",
      {
        initiativeDescription: "Build a lightweight offline-first note-taking app",
        briefMarkdown: "# Local notes",
        coreFlowsMarkdown: "# Core flows",
        prdMarkdown: "# PRD",
        techSpecMarkdown: "# Tech spec",
        coverageItems: [],
      },
      "team-rules: always include tests"
    );

    expect(prompt.userPrompt).toContain("Title and heading style rules:");
    expect(prompt.userPrompt).toContain('"Local notes", "Project setup", "Import GitHub issues"');
    expect(prompt.userPrompt).toContain("Phase names must be 1 to 4 words");
    expect(prompt.userPrompt).toContain("Ticket titles must be 2 to 6 words");
  });

  it("requires short sentence-case titles in triage prompts", () => {
    const prompt = buildPlannerPrompt(
      "triage",
      {
        description: "Add a first-run setup flow for local project import."
      },
      "team-rules: always include tests"
    );

    expect(prompt.userPrompt).toContain("Title and heading style rules:");
    expect(prompt.userPrompt).toContain('If decision is "too-large", initiativeTitle must be a 2 to 3 word project name in sentence case.');
    expect(prompt.userPrompt).toContain('If decision is "ok", ticketDraft.title must be a 2 to 6 word task title in sentence case.');
  });

  it("sanitizes and truncates raw plan-repair payload text before it reaches the provider prompt", () => {
    const prompt = buildPlannerPrompt(
      "plan-repair",
      {
        initiativeDescription: "Build a notes app\u0007 with sync",
        briefMarkdown: "# Brief\u0000",
        coreFlowsMarkdown: "# Core flows",
        prdMarkdown: "# PRD",
        techSpecMarkdown: "# Tech spec",
        coverageItems: [],
        validationFeedback: {
          summary: `Bad feedback ${"x".repeat(5_000)}`,
          issues: [],
        },
        previousInvalidResult: {
          phases: [
            {
              name: "Phase 1",
              order: 1,
              tickets: [
                {
                  title: `Title ${"y".repeat(9_000)}`,
                  description: "Desc\u0085ription",
                  acceptanceCriteria: ["A"],
                  fileTargets: ["src/app.ts"],
                  coverageItemIds: [],
                },
              ],
            },
          ],
          uncoveredCoverageItemIds: [],
        },
      },
      "team-rules: always include tests"
    );

    expect(prompt.userPrompt).not.toContain("\u0007");
    expect(prompt.userPrompt).not.toContain("\u0000");
    expect(prompt.userPrompt).not.toContain("\u0085");
    expect(prompt.userPrompt).toContain("...(truncated)");
  });
});
