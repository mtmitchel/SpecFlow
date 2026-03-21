import { describe, expect, it } from "vitest";
import {
  isValidFindingId,
  isValidGitHubOwner,
  isValidGitHubRepo,
} from "../src/validation.js";
import { operationDir } from "../src/io/paths.js";

describe("validation helpers", () => {
  it("isValidFindingId accepts valid and rejects invalid IDs", () => {
    expect(isValidFindingId("finding-0")).toBe(true);
    expect(isValidFindingId("finding-42")).toBe(true);
    expect(isValidFindingId("finding-")).toBe(false);
    expect(isValidFindingId("finding-abc")).toBe(false);
    expect(isValidFindingId("bad-123")).toBe(false);
  });

  it("isValidGitHubOwner accepts valid and rejects invalid owners", () => {
    expect(isValidGitHubOwner("octocat")).toBe(true);
    expect(isValidGitHubOwner("my-org")).toBe(true);
    expect(isValidGitHubOwner("a")).toBe(true);
    expect(isValidGitHubOwner("-leading")).toBe(false);
    expect(isValidGitHubOwner("trailing-")).toBe(false);
    expect(isValidGitHubOwner("")).toBe(false);
    expect(isValidGitHubOwner("a".repeat(40))).toBe(false);
  });

  it("isValidGitHubRepo accepts valid and rejects invalid repos", () => {
    expect(isValidGitHubRepo("my-repo")).toBe(true);
    expect(isValidGitHubRepo("repo.js")).toBe(true);
    expect(isValidGitHubRepo("under_score")).toBe(true);
    expect(isValidGitHubRepo(".")).toBe(false);
    expect(isValidGitHubRepo("..")).toBe(false);
    expect(isValidGitHubRepo("")).toBe(false);
  });

  it("operationDir throws on path traversal", () => {
    expect(() => operationDir("/root", "run-1", "../../etc/passwd")).toThrow("Path traversal");
    expect(() => operationDir("/root", "run-1", "../other")).toThrow("Path traversal");
    expect(() => operationDir("/root", "run-1", "op-deadbeef")).not.toThrow();
  });
});
