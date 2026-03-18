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
});
