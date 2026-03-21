import { describe, expect, it } from "vitest";
import { sanitizeVisibleErrorMessage } from "./safe-error";

describe("sanitizeVisibleErrorMessage", () => {
  it("redacts local filesystem paths from user-visible messages", () => {
    expect(
      sanitizeVisibleErrorMessage("The desktop bridge failed at /home/mason/projects/specflow/file.txt")
    ).toBe("The desktop runtime failed at [redacted path]");
  });

  it("replaces unsupported desktop bridge method leakage with a generic message", () => {
    expect(
      sanitizeVisibleErrorMessage("Desktop bridge method is not allowed: runs.saveBundleZip")
    ).toBe("The desktop runtime rejected an unsupported request.");
  });
});
