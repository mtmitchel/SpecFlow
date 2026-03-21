import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { fetchRunState } from "../../api.js";
import type { VerificationResult } from "../../types.js";

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
  const latestRunIdRef = useRef<string | undefined>(runId);
  const onRefreshRef = useRef(onRefresh);
  latestRunIdRef.current = runId;
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    setVerificationResult(null);
    setVerifyStreamEvents([]);
    setVerifyState(runId ? "running" : "idle");

    if (!runId) return;

    let cancelled = false;
    let activeController: AbortController | null = null;
    let timeoutId: number | null = null;

    const poll = async (): Promise<void> => {
      activeController?.abort();
      activeController = new AbortController();

      try {
        const snapshot = await fetchRunState(runId, { signal: activeController.signal });
        if (cancelled) {
          return;
        }

        syncVerificationFromRunState(snapshot.attempts, setVerificationResult);
        setVerifyState(snapshot.run.status === "pending" ? "running" : "idle");

        if (snapshot.run.status === "pending") {
          timeoutId = window.setTimeout(() => {
            void poll();
          }, 2500);
        }
      } catch {
        if (cancelled) {
          return;
        }

        setVerifyState("reconnecting");
        await onRefreshRef.current();

        if (!cancelled && latestRunIdRef.current === runId) {
          timeoutId = window.setTimeout(() => {
            void poll();
          }, 2500);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      activeController?.abort();
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [runId, ticketId]);

  return {
    verifyStreamEvents,
    verificationResult,
    verifyState,
    setVerifyStreamEvents,
    setVerificationResult,
    setVerifyState
  };
};
