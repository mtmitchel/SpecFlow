export type TimeoutResult<T> = { timedOut: false; value: T } | { timedOut: true };

export const withTimeout = async <T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>
): Promise<TimeoutResult<T>> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const value = await run(controller.signal);
    return { timedOut: false, value };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { timedOut: true };
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
};
