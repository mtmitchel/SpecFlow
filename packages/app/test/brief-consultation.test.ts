import { describe, expect, it } from "vitest";
import { buildRequiredBriefConsultationResult } from "../src/planner/brief-consultation.js";

describe("required Brief consultation", () => {
  it("keeps problem framing distinct from success framing and covers every option with helper copy", () => {
    const result = buildRequiredBriefConsultationResult();
    const problemQuestion = result.questions.find((question) => question.id === "brief-problem");
    const successQuestion = result.questions.find((question) => question.id === "brief-success");
    const constraintsQuestion = result.questions.find((question) => question.id === "brief-constraints");

    expect(problemQuestion?.options).toEqual([
      "Build something new",
      "Improve or replace something that exists",
      "Automate or speed up a manual process",
      "Fix something that's broken or unreliable",
      "Meet a specific requirement or standard"
    ]);
    expect(successQuestion?.options).toEqual([
      "It's fast or saves time",
      "It works reliably on real tasks",
      "It stays simple -- no feature bloat",
      "New users can figure it out quickly",
      "The value is obvious in the first session"
    ]);
    expect(constraintsQuestion?.options).not.toContain("No extra constraints");

    for (const question of result.questions) {
      const options = question.options ?? [];
      const optionHelpKeys = Object.keys(question.optionHelp ?? {});
      expect(optionHelpKeys).toEqual(options);
      expect(options.every((option) => Boolean(question.optionHelp?.[option]?.trim()))).toBe(true);
      expect(options.every((option) => !question.optionHelp?.[option]?.startsWith("Use this"))).toBe(true);
    }
  });
});
