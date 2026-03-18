import { describe, expect, it } from "vitest";
import { buildRequiredBriefConsultationResult } from "../src/planner/brief-consultation.js";

describe("required Brief consultation", () => {
  it("keeps problem framing distinct from success framing and covers every option with helper copy", () => {
    const result = buildRequiredBriefConsultationResult();
    const problemQuestion = result.questions.find((question) => question.id === "brief-problem");
    const successQuestion = result.questions.find((question) => question.id === "brief-success");
    const constraintsQuestion = result.questions.find((question) => question.id === "brief-constraints");

    expect(problemQuestion?.options).toEqual([
      "Automate or speed up a repetitive process",
      "Replace or improve an existing tool or workflow",
      "Build something new that does not exist yet",
      "Fix reliability, correctness, or data quality issues",
      "Meet a new requirement, standard, or constraint"
    ]);
    expect(successQuestion?.options).toEqual([
      "Core workflow is noticeably faster than the current approach",
      "Handles real data reliably without manual intervention",
      "Feels simple and focused",
      "Is easy to learn on first use",
      "Shows clear value right away"
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
