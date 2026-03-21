import { describe, expect, it } from "vitest";
import { deriveReadableInitiativeTitle, getInitiativeDisplayTitle } from "./initiative-titles.js";

describe("initiative title helpers", () => {
  it("derives a short sentence-case title from a long project description", () => {
    expect(
      deriveReadableInitiativeTitle(
        "Build a lightweight, fast note-taking app inspired by Simplenote, with offline-first local storage."
      )
    ).toBe("Note-taking app");
  });

  it("prefers a derived short title when the stored title is just the raw description", () => {
    const description =
      "Build a lightweight, fast note-taking app inspired by Simplenote, with offline-first local storage.";

    expect(getInitiativeDisplayTitle(description, description)).toBe("Note-taking app");
  });

  it("preserves a distinct stored title instead of overwriting it with a fallback", () => {
    expect(
      getInitiativeDisplayTitle(
        "Sidecar Notebook",
        "Build a lightweight, fast note-taking app inspired by Simplenote, with offline-first local storage."
      )
    ).toBe("Sidecar Notebook");
  });

  it("replaces legacy description-snippet titles with the compact fallback", () => {
    expect(
      getInitiativeDisplayTitle(
        "Lightweight, Fast Note-taking App Inspired By Simplenote, wit...",
        "Lightweight, fast note-taking app inspired by Simplenote, with offline-first local storage and dual views."
      )
    ).toBe("Note-taking app");
  });
});
