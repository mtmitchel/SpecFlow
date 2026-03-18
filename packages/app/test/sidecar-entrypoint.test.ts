import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpecFlowRuntime } from "../src/runtime/types.js";
import { RequestCancelledError } from "../src/cancellation.js";

const dispatchSidecarRequestMock = vi.fn();
const isMutatingSidecarMethodMock = vi.fn(() => false);

vi.mock("../src/sidecar/dispatcher.js", () => ({
  dispatchSidecarRequest: (...args: unknown[]) => dispatchSidecarRequestMock(...args),
  isMutatingSidecarMethod: (method: string) => isMutatingSidecarMethodMock(method)
}));

const {
  DEFAULT_REQUEST_TTL_MS,
  LONG_REQUEST_TTL_MS,
  createInvalidRequestFailure,
  createSidecarLoopState,
  handleSidecarLine
} = await import("../src/sidecar.ts");

const createRuntimeStub = (): SpecFlowRuntime => ({
  rootDir: "/tmp/specflow-sidecar-test",
  store: {} as SpecFlowRuntime["store"],
  plannerService: {} as SpecFlowRuntime["plannerService"],
  bundleGenerator: {} as SpecFlowRuntime["bundleGenerator"],
  verifierService: {} as SpecFlowRuntime["verifierService"],
  diffEngine: {} as SpecFlowRuntime["diffEngine"],
  fetchImpl: fetch,
  close: async () => undefined
});

describe("sidecar entrypoint", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns a structured bad-request failure for malformed input", () => {
    const runtime = createRuntimeStub();
    const state = createSidecarLoopState();
    const messages: unknown[] = [];

    handleSidecarLine("{\"id\":123}", runtime, state, (message) => {
      messages.push(message);
    });

    expect(messages).toEqual([
      createInvalidRequestFailure("unknown", "Sidecar requests require string id and method")
    ]);
    expect(dispatchSidecarRequestMock).not.toHaveBeenCalled();
  });

  it("aborts an inflight request when runtime.cancel targets it", () => {
    const runtime = createRuntimeStub();
    const state = createSidecarLoopState();
    const controller = new AbortController();
    const messages: unknown[] = [];

    state.inflight.set("req-active", controller);

    handleSidecarLine(
      JSON.stringify({
        id: "cancel-1",
        method: "runtime.cancel",
        params: { requestId: "req-active" }
      }),
      runtime,
      state,
      (message) => {
        messages.push(message);
      }
    );

    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBeInstanceOf(RequestCancelledError);
    expect(messages).toEqual([
      {
        id: "cancel-1",
        ok: true,
        result: { cancelled: true }
      }
    ]);
  });

  it("serializes mutating requests through one queue", async () => {
    const runtime = createRuntimeStub();
    const state = createSidecarLoopState();
    const order: string[] = [];
    let releaseFirstRequest: (() => void) | undefined;

    isMutatingSidecarMethodMock.mockReturnValue(true);
    dispatchSidecarRequestMock.mockImplementation(async (_runtime, request) => {
      order.push(`start:${(request as { id: string }).id}`);
      if ((request as { id: string }).id === "req-1") {
        await new Promise<void>((resolve) => {
          releaseFirstRequest = resolve;
        });
      }
      order.push(`end:${(request as { id: string }).id}`);
    });

    handleSidecarLine(JSON.stringify({ id: "req-1", method: "tickets.update" }), runtime, state, vi.fn());
    handleSidecarLine(JSON.stringify({ id: "req-2", method: "tickets.update" }), runtime, state, vi.fn());

    await Promise.resolve();
    expect(order).toEqual(["start:req-1"]);

    releaseFirstRequest?.();
    await Promise.allSettled(Array.from(state.pending));

    expect(order).toEqual([
      "start:req-1",
      "end:req-1",
      "start:req-2",
      "end:req-2"
    ]);
  });

  it("uses the default timeout window for short requests", async () => {
    vi.useFakeTimers();

    const runtime = createRuntimeStub();
    const state = createSidecarLoopState();
    let capturedSignal: AbortSignal | undefined;

    dispatchSidecarRequestMock.mockImplementation(async (_runtime, _request, _write, signal?: AbortSignal) => {
      capturedSignal = signal;
      await new Promise<void>((resolve) => {
        signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    });

    handleSidecarLine(JSON.stringify({ id: "req-short", method: "runtime.status" }), runtime, state, vi.fn());

    await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TTL_MS - 1);
    expect(capturedSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await Promise.allSettled(Array.from(state.pending));

    expect(capturedSignal?.aborted).toBe(true);
    expect((capturedSignal?.reason as Error).message).toBe("Request timed out");
  });

  it("keeps long-running planner requests alive through the extended timeout window", async () => {
    vi.useFakeTimers();

    const runtime = createRuntimeStub();
    const state = createSidecarLoopState();
    let capturedSignal: AbortSignal | undefined;

    dispatchSidecarRequestMock.mockImplementation(async (_runtime, _request, _write, signal?: AbortSignal) => {
      capturedSignal = signal;
      await new Promise<void>((resolve) => {
        signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    });

    handleSidecarLine(
      JSON.stringify({ id: "req-long", method: "initiatives.generate.prd" }),
      runtime,
      state,
      vi.fn()
    );

    await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TTL_MS);
    expect(capturedSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(LONG_REQUEST_TTL_MS - DEFAULT_REQUEST_TTL_MS);
    await Promise.allSettled(Array.from(state.pending));

    expect(capturedSignal?.aborted).toBe(true);
    expect((capturedSignal?.reason as Error).message).toBe("Request timed out");
  });
});
