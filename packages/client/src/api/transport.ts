import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ApiError } from "./http";
import { sanitizeVisibleErrorMessage } from "../app/utils/safe-error";

export interface TransportEvent {
  event: string;
  payload: unknown;
  requestId?: string;
}

export interface TransportRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  timeoutMessage?: string;
  localMutationApplied?: boolean;
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
  restartCount: number;
  restartPending: boolean;
}

export interface ApprovedPathSelection {
  token: string;
  displayPath: string;
}

export interface ArtifactsChangedPayload {
  reason?: string;
  requestId?: string;
  correlationId?: string;
  [key: string]: unknown;
}

let requestCounter = 0;
const LOCALLY_APPLIED_REQUEST_TTL_MS = 30_000;
const locallyAppliedMutationRequestIds = new Map<string, number>();

const logTransportEvent = (
  event: string,
  details: Record<string, unknown>
): void => {
  if (!import.meta.env.DEV) {
    return;
  }

  console.debug("[desktop-transport]", event, details);
};

const pruneLocallyAppliedMutationRequestIds = (): void => {
  const now = Date.now();
  for (const [requestId, expiresAt] of locallyAppliedMutationRequestIds) {
    if (expiresAt <= now) {
      locallyAppliedMutationRequestIds.delete(requestId);
    }
  }
};

const markLocallyAppliedMutationRequest = (requestId: string): void => {
  pruneLocallyAppliedMutationRequestIds();
  locallyAppliedMutationRequestIds.set(requestId, Date.now() + LOCALLY_APPLIED_REQUEST_TTL_MS);
};

const consumeLocallyAppliedMutationRequest = (requestId: string): boolean => {
  pruneLocallyAppliedMutationRequestIds();
  if (!locallyAppliedMutationRequestIds.has(requestId)) {
    return false;
  }

  locallyAppliedMutationRequestIds.delete(requestId);
  return true;
};

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

  const requestId = nextRequestId();
  const startedAt = Date.now();
  const request = {
    id: requestId,
    method,
    params
  };
  logTransportEvent("request:start", {
    requestId,
    method
  });

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
    const result = await (abortPromise ? Promise.race([invokePromise, abortPromise]) : invokePromise);
    if (options?.localMutationApplied) {
      markLocallyAppliedMutationRequest(requestId);
    }
    logTransportEvent("request:ok", {
      requestId,
      method,
      durationMs: Date.now() - startedAt,
      localMutationApplied: Boolean(options?.localMutationApplied)
    });
    return result;
  } catch (error) {
    const normalizedError = normalizeDesktopError(error);
    logTransportEvent("request:error", {
      requestId,
      method,
      durationMs: Date.now() - startedAt,
      message: normalizedError.message
    });
    throw normalizedError;
  } finally {
    removeAbortListener();
  }
};

export const transportRequest = async <T>(
  method: string,
  params: unknown,
  onEvent?: (event: TransportEvent) => void,
  options?: TransportRequestOptions
): Promise<T> => {
  return runWithTransportSignal(
    (signal) => invokeDesktop<T>(method, params, onEvent, { ...options, signal }),
    options
  );
};

export const transportJsonRequest = async <T>(
  method: string,
  params: unknown,
  onEvent?: (event: TransportEvent) => void,
  options?: TransportRequestOptions
): Promise<T> =>
  transportRequest(method, params, onEvent, options);

export const transportSseRequest = async <T>(
  method: string,
  params: unknown,
  onEvent?: (event: TransportEvent) => void,
  options?: TransportRequestOptions
): Promise<T> =>
  transportRequest(method, params, onEvent, options);

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
    const payload = event.payload ?? {};
    onEvent?.(payload);
    if (payload.requestId && consumeLocallyAppliedMutationRequest(payload.requestId)) {
      logTransportEvent("artifacts:skip-refresh", {
        reason: payload.reason ?? "unknown",
        requestId: payload.requestId
      });
      return;
    }

    await onRefresh();
  });

  return () => {
    void unlisten();
  };
};

export const pickProjectRoot = async (
  defaultPath?: string
): Promise<ApprovedPathSelection | null> => {
  if (!isDesktopRuntime()) {
    return null;
  }

  try {
    return await invoke<ApprovedPathSelection | null>("desktop_pick_project_root", { defaultPath });
  } catch (error) {
    throw normalizeDesktopError(error);
  }
};

export const saveDesktopBundleZip = async (
  runId: string,
  attemptId: string,
  defaultFilename: string
): Promise<string | null> => {
  if (!isDesktopRuntime()) {
    return null;
  }

  try {
    const result = await invoke<{ path: string } | null>("desktop_save_bundle_zip", {
      runId,
      attemptId,
      defaultFilename
    });
    return result?.path ?? null;
  } catch (error) {
    throw normalizeDesktopError(error);
  }
};

export const openExternalUrl = async (url: string): Promise<void> => {
  if (!isDesktopRuntime()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  try {
    await invoke("open_external_url", { url });
  } catch (error) {
    throw normalizeDesktopError(error);
  }
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
      sanitizeVisibleErrorMessage(desktopError.message, "The desktop runtime reported an error."),
      typeof desktopError.code === "string"
        ? desktopError.code
        : undefined,
      desktopError.details,
    );
  }

  return new Error(String(error));
};
