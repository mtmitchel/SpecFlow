import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { fetchRunState } from "../../api.js";
import type { VerificationResult } from "../../types.js";
import { isDesktopRuntime } from "../../api/transport.js";
import { subscribeLegacyEventSource } from "../../api/sse.js";

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

    const unsubscribe = subscribeLegacyEventSource({
      url: `/api/tickets/${ticketId}/verify/stream`,
      onEvent: (eventName, event) => {
        try {
          const payload = JSON.parse(event.data) as { chunk?: string };
          const chunk = payload.chunk;
          if (eventName === "verify-token" && chunk) {
            setVerifyStreamEvents((current) => [...current, chunk].slice(-200));
          }
        } catch {
          // ignore invalid event payloads
        }
        if (eventName !== "verify-complete") {
          return;
        }

        if (!runId || !isMounted || verifyStateRef.current === "running") {
          return;
        }

        void fetchRunState(runId).then((snapshot) => {
          if (!isMounted) {
            return;
          }

          syncVerificationFromRunState(snapshot.attempts, setVerificationResult);
        });
      },
      onReconnect: async () => {
        if (runId) {
          await fetchRunState(runId)
            .then((snapshot) => {
              if (!isMounted) {
                return;
              }

              syncVerificationFromRunState(snapshot.attempts, setVerificationResult);
            })
            .catch(() => {});
        }

        await onRefresh();
      },
      onReconnectStateChange: (state) => {
        if (!isMounted || verifyStateRef.current === "running") {
          return;
        }

        setVerifyState(state);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [ticketId, runId, onRefresh]);

  return {
    verifyStreamEvents,
    verificationResult,
    verifyState,
    setVerifyStreamEvents,
    setVerificationResult,
    setVerifyState
  };
};
