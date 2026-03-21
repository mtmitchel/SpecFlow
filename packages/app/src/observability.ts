import process from "node:process";

type ObservabilityValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | string[]
  | number[]
  | boolean[];

export interface ObservabilityEvent {
  layer: "runtime" | "store" | "sidecar";
  event: string;
  requestId?: string;
  method?: string;
  status?: "start" | "ok" | "error" | "cancelled" | "timeout";
  durationMs?: number;
  details?: Record<string, ObservabilityValue>;
}

const isObservabilityEnabled = (): boolean =>
  process.env.SPECFLOW_DEBUG_OBSERVABILITY === "1";

const nowIso = (): string => new Date().toISOString();

export const describeObservabilityError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

export const logObservabilityEvent = (event: ObservabilityEvent): void => {
  if (!isObservabilityEnabled()) {
    return;
  }

  process.stderr.write(`${JSON.stringify({
    ts: nowIso(),
    ...event
  })}\n`);
};
