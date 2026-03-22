import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ApiError } from "./http";
import { saveDesktopBundleZip, subscribeArtifactsChanged, transportRequest } from "./transport";

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
    vi.mocked(listen).mockReset();
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

  it("skips snapshot refresh for locally applied mutation notifications", async () => {
    vi.mocked(isTauri).mockReturnValue(true);

    const artifactsChangedListeners: Array<
      (event: { payload?: { requestId?: string; reason?: string } }) => Promise<void>
    > = [];

    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      artifactsChangedListeners.push(handler as (event: { payload?: { requestId?: string; reason?: string } }) => Promise<void>);
      return () => undefined;
    });

    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "sidecar_request") {
        return {
          ticket: {
            id: "ticket-1",
            status: "ready"
          }
        };
      }

      if (command === "sidecar_cancel") {
        return undefined;
      }

      return undefined;
    });

    const onRefresh = vi.fn(async () => undefined);
    const unsubscribe = await subscribeArtifactsChanged(onRefresh);

    await transportRequest(
      "tickets.update",
      { id: "ticket-1", body: { status: "ready" } },
      undefined,
      { localMutationApplied: true }
    );

    const sidecarRequestCall = vi.mocked(invoke).mock.calls.find(([command]) => command === "sidecar_request");
    const requestId = (sidecarRequestCall?.[1] as { request?: { id?: string } } | undefined)?.request?.id;

    expect(requestId).toMatch(/^req-/);
    const notifyArtifactsChanged = artifactsChangedListeners[0];
    expect(notifyArtifactsChanged).toBeDefined();
    if (!notifyArtifactsChanged) {
      throw new Error("Expected artifacts changed listener to be registered");
    }

    await notifyArtifactsChanged({
      payload: {
        requestId,
        reason: "tickets.update"
      }
    });

    expect(onRefresh).not.toHaveBeenCalled();

    await notifyArtifactsChanged({
      payload: {
        requestId: "req-unrelated",
        reason: "tickets.update"
      }
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("returns a success flag for desktop ZIP saves without exposing the saved path", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue({ saved: true });

    await expect(
      saveDesktopBundleZip("run-12345678", "attempt-12345678", "bundle.zip")
    ).resolves.toBe(true);

    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      "desktop_save_bundle_zip",
      expect.objectContaining({
        runId: "run-12345678",
        attemptId: "attempt-12345678",
        defaultFilename: "bundle.zip",
      })
    );
  });
});
