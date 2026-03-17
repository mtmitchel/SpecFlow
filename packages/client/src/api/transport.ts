import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";

export interface TransportEvent {
  event: string;
  payload: unknown;
  requestId?: string;
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
  onEvent?: (event: TransportEvent) => void
): Promise<T> => {
  const request = {
    id: nextRequestId(),
    method,
    params
  };

  const channel = new Channel<TransportEvent>();
  channel.onmessage = (message) => {
    onEvent?.(message);
  };

  try {
    return await invoke<T>("sidecar_request", {
      request,
      onEvent: channel
    });
  } catch (error) {
    throw normalizeDesktopError(error);
  }
};

export const transportRequest = async <T>(
  method: string,
  params: unknown,
  webFallback: () => Promise<T>,
  onEvent?: (event: TransportEvent) => void
): Promise<T> => {
  if (!isDesktopRuntime()) {
    return webFallback();
  }

  return invokeDesktop<T>(method, params, onEvent);
};

export const subscribeArtifactsChanged = async (
  onRefresh: () => Promise<void> | void
): Promise<() => void> => {
  if (!isDesktopRuntime()) {
    return () => {};
  }

  const unlisten = await listen("artifacts-changed", async () => {
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

const normalizeDesktopError = (error: unknown): Error => {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return new Error(error.message);
  }

  return new Error(String(error));
};
