import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const accessMock = vi.fn();
const spawnMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  access: (...args: unknown[]) => accessMock(...args)
}));

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args)
}));

const { runUiCommand } = await import("../src/cli/commands/ui-command.js");

describe("runUiCommand", () => {
  beforeEach(() => {
    accessMock.mockReset();
    spawnMock.mockReset();
    spawnMock.mockReturnValue({ unref: vi.fn() });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fails closed when the desktop binary is unavailable", async () => {
    accessMock.mockRejectedValue(new Error("missing"));

    await expect(
      runUiCommand({})
    ).rejects.toThrow(/desktop binary was not found/i);
  });

  it("launches the packaged desktop binary when one is available", async () => {
    accessMock.mockResolvedValue(undefined);

    await runUiCommand({
      desktopBinary: "/tmp/specflow-tauri"
    });

    expect(spawnMock).toHaveBeenCalledWith(
      "/tmp/specflow-tauri",
      expect.objectContaining({
        detached: true,
        stdio: "ignore",
        env: expect.objectContaining({
          SPECFLOW_ROOT_DIR: process.cwd()
        })
      })
    );
  });
});
