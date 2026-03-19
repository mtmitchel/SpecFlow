import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { ApiError } from "./http";

export interface TransportEvent {
  event: string;
  payload: unknown;
  requestId?: string;
}

export interface TransportRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  timeoutMessage?: string;
}

export class RequestTimeoutError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RequestTimeoutError";
  }
}

export interface DesktopRuntimeStatus {
  transport: "desktop";
  sidecarPid: number | null;
  runtimeGeneration: number;
  buildFingerprint: string | null;
  latestBuildPath: string | null;
  restartCount: number;
  restartPending: boolean;
}

export interface ArtifactsChangedPayload {
  reason?: string;
  [key: string]: unknown;
}

let requestCounter = 0;

const resolveAbortError = (signal: AbortSignal | undefined, fallbackMessage: string): Error => {
  const reason = signal?.reason;
  return reason instanceof Error ? reason : new Error(fallbackMessage);
};

const runWithTransportSignal = async <T>(
  run: (signal?: AbortSignal) => Promise<T>,
  options?: TransportRequestOptions
): Promise<T> => {
  if (!options?.signal && options?.timeoutMs === undefined) {
    return run(undefined);
  }

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let removeAbortListener = (): void => {};

  const abortWithError = (error: Error) => {
    if (!controller.signal.aborted) {
      controller.abort(error);
    }
  };

  if (options?.signal) {
    if (options.signal.aborted) {
      abortWithError(resolveAbortError(options.signal, "Request cancelled"));
    } else {
      const onAbort = () => {
        abortWithError(resolveAbortError(options.signal, "Request cancelled"));
      };

      options.signal.addEventListener("abort", onAbort, { once: true });
      removeAbortListener = () => {
        options.signal?.removeEventListener("abort", onAbort);
      };
    }
  }

  if (typeof options?.timeoutMs === "number" && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      abortWithError(new RequestTimeoutError(options.timeoutMessage ?? "Request timed out"));
    }, options.timeoutMs);
  }

  try {
    return await run(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw resolveAbortError(controller.signal, "Request cancelled");
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    removeAbortListener();
  }
};

const nextRequestId = (): string => {
  requestCounter += 1;
  return `req-${Date.now()}-${requestCounter}`;
};

export const isDesktopRuntime = (): boolean => isTauri();

export const invokeDesktop = async <T>(
  method: string,
  params?: unknown,
  onEvent?: (event: TransportEvent) => void,
  options?: TransportRequestOptions
): Promise<T> => {
  if (options?.signal?.aborted) {
    throw resolveAbortError(options.signal, "Request cancelled");
  }

  const request = {
    id: nextRequestId(),
    method,
    params
  };

  const channel = new Channel<TransportEvent>();
  channel.onmessage = (message) => {
    onEvent?.(message);
  };

  let removeAbortListener = (): void => {};
  const invokePromise = invoke<T>("sidecar_request", {
    request,
    onEvent: channel
  });
  const abortPromise = options?.signal
    ? new Promise<never>((_, reject) => {
        const onAbort = () => {
          void invoke("sidecar_cancel", { requestId: request.id }).catch(() => undefined);
          reject(resolveAbortError(options.signal, "Request cancelled"));
        };

        options.signal?.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => {
          options.signal?.removeEventListener("abort", onAbort);
        };
      })
    : null;

  try {
    return await (abortPromise ? Promise.race([invokePromise, abortPromise]) : invokePromise);
  } catch (error) {
    throw normalizeDesktopError(error);
  } finally {
    removeAbortListener();
  }
};

export const transportRequest = async <T>(
  method: string,
  params: unknown,
  webFallback: (signal?: AbortSignal) => Promise<T>,
  onEvent?: (event: TransportEvent) => void,
  options?: TransportRequestOptions
): Promise<T> => {
  if (!isDesktopRuntime()) {
    return runWithTransportSignal(webFallback, options);
  }

  return runWithTransportSignal(
    (signal) => invokeDesktop<T>(method, params, onEvent, { signal }),
    options
  );
};

export const isRequestCancelledError = (error: unknown): boolean => {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  return error instanceof Error && error.message === "Request cancelled";
};

export const isRequestTimeoutError = (error: unknown): boolean => {
  if (error instanceof RequestTimeoutError) {
    return true;
  }

  return error instanceof Error && (
    error.name === "RequestTimeoutError" ||
    /took too long/i.test(error.message)
  );
};

export const subscribeArtifactsChanged = async (
  onRefresh: () => Promise<void> | void,
  onEvent?: (payload: ArtifactsChangedPayload) => void
): Promise<() => void> => {
  if (!isDesktopRuntime()) {
    return () => {};
  }

  const unlisten = await listen<ArtifactsChangedPayload>("artifacts-changed", async (event) => {
    onEvent?.(event.payload ?? {});
    await onRefresh();
  });

  return () => {
    void unlisten();
  };
};

export const chooseSavePath = async (defaultPath: string): Promise<string | null> => {
  if (!isDesktopRuntime()) {
    return null;
  }

  const selection = await save({ defaultPath });
  return typeof selection === "string" ? selection : null;
};

export const getDesktopRuntimeStatus = async (): Promise<DesktopRuntimeStatus | null> => {
  if (!isDesktopRuntime()) {
    return null;
  }

  return invoke<DesktopRuntimeStatus>("desktop_runtime_status");
};

const normalizeDesktopError = (error: unknown): Error => {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    const desktopError = error as {
      message: string;
      statusCode?: unknown;
      code?: unknown;
      details?: unknown;
    };

    return new ApiError(
      typeof desktopError.statusCode === "number"
        ? desktopError.statusCode
        : 500,
      desktopError.message,
      typeof desktopError.code === "string"
        ? desktopError.code
        : undefined,
      desktopError.details,
    );
  }

  return new Error(String(error));
};
