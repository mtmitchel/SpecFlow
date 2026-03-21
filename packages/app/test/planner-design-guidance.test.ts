import { describe, expect, it } from "vitest";
import { buildPlannerPrompt } from "../src/planner/prompt-builder.js";

describe("planner design guidance", () => {
  it("includes the design charter in core flows generation prompts", () => {
    const prompt = buildPlannerPrompt(
      "core-flows-gen",
      {
        initiativeDescription: "Build a project management desktop app for solo founders.",
        savedContext: {},
        refinementHistory: [],
        assumptions: [],
        briefMarkdown: "# Brief"
      },
      "Always write tests."
    );

    expect(prompt.userPrompt).toContain("Product design charter:");
    expect(prompt.userPrompt).toContain(
      "Treat information architecture and product design as first-class requirements, not polish or follow-up work."
    );
    expect(prompt.userPrompt).toContain(
      "empty, loading, error, recovery, and destructive states"
    );
  });

  it("includes product-contract design rules in PRD generation prompts", () => {
    const prompt = buildPlannerPrompt(
      "prd-gen",
      {
        initiativeDescription: "Build a project management desktop app for solo founders.",
        savedContext: {},
        refinementHistory: [],
        assumptions: [],
        briefMarkdown: "# Brief",
        coreFlowsMarkdown: "# Core flows"
      },
      "Always write tests."
    );

    expect(prompt.userPrompt).toContain(
      "Treat information architecture and product design as part of the product contract, not polish."
    );
    expect(prompt.userPrompt).toContain(
      "Define the navigation model, information hierarchy, key objects, statuses or feedback, primary versus secondary actions"
    );
  });

  it("requires ticket planning to preserve design-critical work", () => {
    const prompt = buildPlannerPrompt(
      "plan",
      {
        initiativeDescription: "Build a project management desktop app for solo founders.",
        briefMarkdown: "# Brief",
        coreFlowsMarkdown: "# Core flows",
        prdMarkdown: "# PRD",
        techSpecMarkdown: "# Tech spec",
        coverageItems: []
      },
      "Always write tests."
    );

    expect(prompt.userPrompt).toContain("Product design and information architecture rules:");
    expect(prompt.userPrompt).toContain(
      "create tickets that cover the structure, navigation, feedback, and state handling needed to make that experience coherent"
    );
    expect(prompt.userPrompt).toContain(
      "Do not hide information architecture, workflow clarity, system feedback, empty/loading/error states"
    );
  });

  it("uses a design lens in review prompts", () => {
    const prompt = buildPlannerPrompt(
      "review",
      {
        initiativeDescription: "Build a project management desktop app for solo founders.",
        kind: "ticket-coverage-review",
        briefMarkdown: "# Brief",
        coreFlowsMarkdown: "# Core flows",
        prdMarkdown: "# PRD",
        techSpecMarkdown: "# Tech spec",
        coverageItems: [],
        uncoveredCoverageItemIds: [],
        tickets: []
      },
      "Always write tests."
    );

    expect(prompt.userPrompt).toContain("Product design review lens:");
    expect(prompt.userPrompt).toContain(
      "During ticket-coverage review, call out when the plan omits necessary design or information-architecture work implied by the artifact set."
    );
  });

  it("tells quick-task triage to preserve product design requirements", () => {
    const prompt = buildPlannerPrompt(
      "triage",
      {
        description: "Add a first-run setup flow for local project import."
      },
      "Always write tests."
    );

    expect(prompt.userPrompt).toContain(
      "Treat information architecture and product design as first-class requirements"
    );
    expect(prompt.userPrompt).toContain("ticketDraft description and acceptanceCriteria");
  });
});
