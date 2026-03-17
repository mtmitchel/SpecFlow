import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { fetchRunState } from "../../api.js";
import type { VerificationResult } from "../../types.js";
import { isDesktopRuntime } from "../../api/transport.js";

const syncVerificationFromRunState = (
  attemptData: Array<{
    overallPass: boolean;
    attemptId: string;
    criteriaResults: VerificationResult["criteriaResults"];
    driftFlags: VerificationResult["driftFlags"];
  }>,
  setResult: Dispatch<SetStateAction<VerificationResult | null>>
): void => {
  const latest = attemptData
    .slice()
    .sort((left, right) => left.attemptId.localeCompare(right.attemptId))
    .at(-1);

  if (!latest) {
    return;
  }

  setResult({
    overallPass: latest.overallPass,
    criteriaResults: latest.criteriaResults,
    driftFlags: latest.driftFlags
  });
};

export const useVerificationStream = (
  ticketId: string | undefined,
  runId: string | undefined,
  onRefresh: () => Promise<void>
): {
  verifyStreamEvents: string[];
  verificationResult: VerificationResult | null;
  verifyState: "idle" | "running" | "reconnecting";
  setVerifyStreamEvents: Dispatch<SetStateAction<string[]>>;
  setVerificationResult: Dispatch<SetStateAction<VerificationResult | null>>;
  setVerifyState: Dispatch<SetStateAction<"idle" | "running" | "reconnecting">>;
} => {
  const [verifyStreamEvents, setVerifyStreamEvents] = useState<string[]>([]);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verifyState, setVerifyState] = useState<"idle" | "running" | "reconnecting">("idle");

  const verifyStateRef = useRef(verifyState);
  verifyStateRef.current = verifyState;

  useEffect(() => {
    setVerificationResult(null);

    if (!runId) return;

    let cancelled = false;
    void fetchRunState(runId)
      .then((snapshot) => {
        if (!cancelled) {
          syncVerificationFromRunState(snapshot.attempts, setVerificationResult);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [ticketId, runId]);

  useEffect(() => {
    if (isDesktopRuntime()) {
      return;
    }

    if (!ticketId) {
      return;
    }

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
      source = new EventSource(`/api/tickets/${ticketId}/verify/stream`);

      source.onopen = () => {
        reconnectAttempt = 0;
      };

      source.addEventListener("verify-token", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { chunk?: string };
          const chunk = payload.chunk;
          if (chunk) {
            setVerifyStreamEvents((current) => [...current, chunk].slice(-200));
          }
        } catch {
          // ignore invalid event payloads
        }
      });

      source.addEventListener("verify-complete", () => {
        if (!runId || !isMounted || connectionId !== latestConnectionId || verifyStateRef.current === "running") {
          return;
        }

        void fetchRunState(runId).then((snapshot) => {
          if (!isMounted || connectionId !== latestConnectionId) {
            return;
          }

          syncVerificationFromRunState(snapshot.attempts, setVerificationResult);
        });
      });

      source.onerror = () => {
        source?.close();
        const backoff = Math.min(1000 * 2 ** reconnectAttempt, 10_000);
        reconnectAttempt += 1;

        reconnectTimer = setTimeout(() => {
          if (!isMounted || connectionId !== latestConnectionId) {
            return;
          }

          if (verifyStateRef.current !== "running") {
            setVerifyState("reconnecting");
          }
          if (runId) {
            void fetchRunState(runId)
              .then((snapshot) => {
                if (!isMounted || connectionId !== latestConnectionId) {
                  return;
                }

                syncVerificationFromRunState(snapshot.attempts, setVerificationResult);
              })
              .catch(() => {});
          }
          void onRefresh().finally(() => {
            if (!isMounted || connectionId !== latestConnectionId) {
              return;
            }

            if (verifyStateRef.current === "reconnecting") {
              setVerifyState("idle");
            }
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
  }, [ticketId, runId]);

  return {
    verifyStreamEvents,
    verificationResult,
    verifyState,
    setVerifyStreamEvents,
    setVerificationResult,
    setVerifyState
  };
};
