import { describe, expect, it } from "vitest";
import { buildRequiredBriefConsultationResult } from "../src/planner/brief-consultation.js";

describe("required Brief consultation", () => {
  it("keeps problem framing distinct from success framing and covers every option with helper copy", () => {
    const result = buildRequiredBriefConsultationResult();
    const problemQuestion = result.questions.find((question) => question.id === "brief-problem");
    const successQuestion = result.questions.find((question) => question.id === "brief-success");

    expect(problemQuestion?.options).toEqual([
      "Repeated work takes too many steps",
      "Important information is hard to find again",
      "Staying organized takes too much effort",
      "The current tool or workflow no longer fits"
    ]);
    expect(successQuestion?.options).toEqual([
      "Feels fast in daily use",
      "Feels trustworthy for real notes",
      "Feels simple and focused",
      "Is easy to learn on first use",
      "Shows clear value right away"
    ]);

    for (const question of result.questions) {
      const options = question.options ?? [];
      const optionHelpKeys = Object.keys(question.optionHelp ?? {});
      expect(optionHelpKeys).toEqual(options);
      expect(options.every((option) => Boolean(question.optionHelp?.[option]?.trim()))).toBe(true);
    }
  });
});
