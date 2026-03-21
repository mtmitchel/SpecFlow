import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { ApiError } from "./http";
import { transportRequest } from "./transport";

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class MockChannel<T> {
    public onmessage: ((message: T) => void) | null = null;
  },
  invoke: vi.fn(),
  isTauri: vi.fn(() => false)
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn()
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn()
}));

describe("transportRequest", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockReset();
  });

  it("times out desktop requests and cancels the sidecar call", async () => {
    vi.useFakeTimers();
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "sidecar_cancel") {
        return Promise.resolve(undefined);
      }

      return new Promise<never>(() => undefined);
    });

    const request = transportRequest(
      "initiatives.phaseCheck",
      { id: "initiative-1", step: "brief" },
      undefined,
      {
        timeoutMs: 12_000,
        timeoutMessage: "Checking the brief questions took too long. Try again."
      }
    );

    const expectation = expect(request).rejects.toThrow("Checking the brief questions took too long. Try again.");
    await vi.advanceTimersByTimeAsync(12_000);
    await expectation;

    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      "sidecar_cancel",
      expect.objectContaining({
        requestId: expect.stringMatching(/^req-/),
      })
    );
  });

  it("preserves structured sidecar failures as ApiError details", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockRejectedValue({
      code: "planner_validation_error",
      message: "Missing Brief goal: Preserve local note history.",
      statusCode: 500,
      details: {
        issues: [
          {
            kind: "missing-coverage-item",
            coverageItemId: "coverage-brief-goals-1",
          },
        ],
      },
    });

    await expect(
      transportRequest(
        "initiatives.generatePlan",
        { id: "initiative-1" },
      ),
    ).rejects.toEqual(
      expect.objectContaining<ApiError>({
        name: "ApiError",
        statusCode: 500,
        code: "planner_validation_error",
        message: "Missing Brief goal: Preserve local note history.",
        details: expect.objectContaining({
          issues: [
            expect.objectContaining({
              coverageItemId: "coverage-brief-goals-1",
            }),
          ],
        }),
      }),
    );
  });
});
