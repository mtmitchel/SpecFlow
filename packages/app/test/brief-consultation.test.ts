import { describe, expect, it } from "vitest";
import { buildRequiredBriefConsultationResult } from "../src/planner/brief-consultation.js";

describe("required Brief consultation", () => {
  it("keeps problem framing distinct from success framing and covers every option with helper copy", () => {
    const result = buildRequiredBriefConsultationResult();
    const problemQuestion = result.questions.find((question) => question.id === "brief-problem");
    const successQuestion = result.questions.find((question) => question.id === "brief-success");
    const constraintsQuestion = result.questions.find((question) => question.id === "brief-constraints");

    expect(problemQuestion?.options).toEqual([
      "Speed up repetitive work",
      "Replace or improve an existing workflow",
      "Make a new capability possible",
      "Fix reliability, correctness, or data issues",
      "Meet a required standard or constraint"
    ]);
    expect(successQuestion?.options).toEqual([
      "The main job feels faster",
      "Real work runs reliably",
      "The product stays simple",
      "New users can get started quickly",
      "The value is obvious right away"
    ]);
    expect(constraintsQuestion?.options).not.toContain("No extra constraints");

    for (const question of result.questions) {
      const options = question.options ?? [];
      const optionHelpKeys = Object.keys(question.optionHelp ?? {});
      expect(optionHelpKeys).toEqual(options);
      expect(options.every((option) => Boolean(question.optionHelp?.[option]?.trim()))).toBe(true);
      expect(options.every((option) => !question.optionHelp?.[option]?.startsWith("Use this when"))).toBe(true);
    }
  });
});
