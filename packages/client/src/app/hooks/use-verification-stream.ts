import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
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
  _onRefresh: () => Promise<void>
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

  return {
    verifyStreamEvents,
    verificationResult,
    verifyState,
    setVerifyStreamEvents,
    setVerificationResult,
    setVerifyState
  };
};
