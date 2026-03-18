import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";

export interface TransportEvent {
  event: string;
  payload: unknown;
  requestId?: string;
}

export interface TransportRequestOptions {
  signal?: AbortSignal;
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
    throw new Error("Request cancelled");
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
          reject(new Error("Request cancelled"));
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
    return webFallback(options?.signal);
  }

  return invokeDesktop<T>(method, params, onEvent, options);
};

export const isRequestCancelledError = (error: unknown): boolean => {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  return error instanceof Error && error.message === "Request cancelled";
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
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return new Error(error.message);
  }

  return new Error(String(error));
};
