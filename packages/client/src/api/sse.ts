import { parseApiErrorText, toApiError } from "./http";

const ERROR_EVENTS = new Set(["planner-error", "verify-error"]);

export const parseSseResult = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const text = await response.text();
    throw parseApiErrorText(response.status, text);
  }

  if (!response.body) {
    throw new Error("Streaming response body missing");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let latestResult: T | null = null;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }

    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.replace("event:", "").trim();
      } else if (line.startsWith("data:")) {
        const payload = JSON.parse(line.replace("data:", "").trim()) as unknown;

        if (ERROR_EVENTS.has(currentEvent)) {
          const statusCode =
            typeof (payload as { statusCode?: unknown })?.statusCode === "number"
              ? ((payload as { statusCode: number }).statusCode)
              : 500;
          throw toApiError(statusCode, payload, `Server error (${currentEvent})`);
        }

        if (currentEvent === "planner-result") {
          latestResult = payload as T;
        }
      }
    }
  }

  if (!latestResult) {
    throw new Error("No planner-result event was emitted");
  }

  return latestResult;
};

export interface LegacyEventSourceSubscriptionOptions {
  url: string;
  onOpen?: () => void;
  onEvent?: (eventName: string, event: MessageEvent<string>) => void;
  onReconnect?: () => Promise<void> | void;
  onReconnectStateChange?: (state: "idle" | "reconnecting") => void;
}

export const subscribeLegacyEventSource = (
  options: LegacyEventSourceSubscriptionOptions
): (() => void) => {
  let isMounted = true;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let source: EventSource | null = null;
  let latestConnectionId = 0;

  const connect = (): void => {
    if (!isMounted) {
      return;
    }

    latestConnectionId += 1;
    const connectionId = latestConnectionId;
    source = new EventSource(options.url);

    source.onopen = () => {
      reconnectAttempt = 0;
      options.onOpen?.();
    };

    source.onmessage = (event) => {
      options.onEvent?.("message", event as MessageEvent<string>);
    };

    source.addEventListener("verify-token", (event) => {
      options.onEvent?.("verify-token", event as MessageEvent<string>);
    });

    source.addEventListener("verify-complete", (event) => {
      options.onEvent?.("verify-complete", event as MessageEvent<string>);
    });

    source.onerror = () => {
      source?.close();
      const backoff = Math.min(1000 * 2 ** reconnectAttempt, 10_000);
      reconnectAttempt += 1;

      reconnectTimer = setTimeout(() => {
        if (!isMounted || connectionId !== latestConnectionId) {
          return;
        }

        options.onReconnectStateChange?.("reconnecting");
        Promise.resolve(options.onReconnect?.())
          .catch(() => undefined)
          .finally(() => {
            if (!isMounted || connectionId !== latestConnectionId) {
              return;
            }

            options.onReconnectStateChange?.("idle");
            connect();
          });
      }, backoff);
    };
  };

  connect();

  return () => {
    isMounted = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    source?.close();
  };
};
