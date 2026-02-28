import { useEffect, useRef } from "react";

export const useSseReconnect = (url: string, onReconnect: () => Promise<void> | void): void => {
  const reconnectAttempt = useRef(0);

  useEffect(() => {
    let isMounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let eventSource: EventSource | null = null;

    const connect = (): void => {
      if (!isMounted) {
        return;
      }

      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        reconnectAttempt.current = 0;
      };

      eventSource.onerror = () => {
        eventSource?.close();
        const backoff = Math.min(1000 * 2 ** reconnectAttempt.current, 10_000);
        reconnectAttempt.current += 1;

        timer = setTimeout(() => {
          void Promise.resolve(onReconnect()).finally(() => {
            connect();
          });
        }, backoff);
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (timer) {
        clearTimeout(timer);
      }
      eventSource?.close();
    };
  }, [onReconnect, url]);
};
