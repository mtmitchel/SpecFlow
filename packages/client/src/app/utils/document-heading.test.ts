import { describe, expect, it } from "vitest";
import { extractDocumentHeading } from "./document-heading.js";

describe("extractDocumentHeading", () => {
  it('removes invented brief naming like Brief: "Brief" and falls back to the initiative title when needed', () => {
    const result = extractDocumentHeading(
      '# Brief: "Brief" — a lightweight local-first note app\n\n## Summary\n\nBody copy.',
      "brief",
      "Brief",
      "Lightweight offline-first note-taking app"
    );

    expect(result.title).toBe("A lightweight local-first note app");
    expect(result.body).toContain("## Summary");
  });

  it("uses the initiative title when the generated brief heading collapses to the generic artifact label", () => {
    const result = extractDocumentHeading(
      "# Brief\n\nBody copy.",
      "brief",
      "Brief",
      "Lightweight offline-first note-taking app"
    );

    expect(result.title).toBe("Lightweight offline-first note-taking app");
  });

  it("normalizes non-brief document headings to sentence case while preserving acronyms", () => {
    const result = extractDocumentHeading(
      "# IMPORT GITHUB ISSUES\n\nBody copy.",
      "prd",
      "PRD",
      "Local notes"
    );

    expect(result.title).toBe("Import GitHub issues");
  });
});
