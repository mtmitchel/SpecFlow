import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchRunAttemptDetail,
  fetchRunDetail,
  fetchRunDiff,
  fetchRunProgress,
} from "../../../api.js";
import type {
  Initiative,
  RunAttemptDetail,
  RunDetail,
} from "../../../types.js";
import { useToast } from "../../context/toast.js";
import { formatLogTime } from "../../utils/date-format.js";
import { usePersistInitiativeResumeTicket } from "../use-persist-initiative-resume-ticket.js";

const getValidationScoreToneClass = (score: number): string =>
  score >= 80 ? "score-pass-bg" : score >= 50 ? "score-partial-bg" : "score-fail-bg";

const getValidationScoreValueClass = (score: number): string =>
  score >= 80 ? "score-pass" : score >= 50 ? "score-partial" : "score-fail";

export const formatSeverityLabel = (
  pass: boolean,
  severity?: string,
): string => {
  const value = severity ?? (pass ? "pass" : "fail");
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
};

interface RunViewModelLoading {
  status: "loading";
}

interface RunViewModelError {
  status: "error";
  error: string;
}

export interface RunViewModelReady {
  status: "ready";
  detail: RunDetail;
  initiative: Initiative | null;
  committedAttemptDetail: RunAttemptDetail | null;
  attemptLoading: boolean;
  attemptError: string | null;
  primaryDiff: string | null;
  primaryDiffLoading: boolean;
  driftDiff: string | null;
  driftDiffLoading: boolean;
  diffError: string | null;
  showDrift: boolean;
  criteriaResults: RunAttemptDetail["criteriaResults"];
  criteriaPassed: number;
  criteriaTotal: number;
  criteriaLogTimestamp: string;
  validationScore: number;
  validationScoreToneClass: string;
  validationScoreValueClass: string;
  verificationPass: boolean | null;
  bundleFiles: string[];
  runTypeLabel: string;
  reportVerdict: string;
  committedHasPrimaryDiff: boolean;
  committedHasDriftDiff: boolean;
  loadPrimaryDiff: () => Promise<void>;
  toggleDrift: () => void;
}

type RunViewModel = RunViewModelLoading | RunViewModelError | RunViewModelReady;

export const useRunViewModel = ({
  initiatives,
}: {
  initiatives: Initiative[];
}): RunViewModel => {
  const params = useParams<{ id: string }>();
  const { showError } = useToast();
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [committedAttemptDetail, setCommittedAttemptDetail] = useState<RunAttemptDetail | null>(null);
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [primaryDiff, setPrimaryDiff] = useState<string | null>(null);
  const [primaryDiffLoading, setPrimaryDiffLoading] = useState(false);
  const [driftDiff, setDriftDiff] = useState<string | null>(null);
  const [driftDiffLoading, setDriftDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDrift, setShowDrift] = useState(false);
  const committedAttemptIdRef = useRef<string | null>(null);

  const loadCommittedAttempt = useCallback(async (
    runId: string,
    attemptId: string,
    signal?: AbortSignal,
  ): Promise<void> => {
    setAttemptLoading(true);
    setAttemptError(null);
    setPrimaryDiff(null);
    setDriftDiff(null);
    setDiffError(null);
    setShowDrift(false);

    try {
      const attempt = await fetchRunAttemptDetail(runId, attemptId, { signal });
      if (signal?.aborted) {
        return;
      }
      setCommittedAttemptDetail(attempt);
    } catch (loadError) {
      if (signal?.aborted) {
        return;
      }
      setCommittedAttemptDetail(null);
      setAttemptError((loadError as Error).message);
    } finally {
      setAttemptLoading(false);
    }
  }, []);

  const loadDiff = useCallback(async (kind: "primary" | "drift"): Promise<void> => {
    if (!detail?.committed?.attemptId) {
      return;
    }

    if (kind === "primary" ? primaryDiffLoading : driftDiffLoading) {
      return;
    }

    if (kind === "primary") {
      setPrimaryDiffLoading(true);
    } else {
      setDriftDiffLoading(true);
    }
    setDiffError(null);

    try {
      const payload = await fetchRunDiff(detail.run.id, detail.committed.attemptId, kind);
      if (kind === "primary") {
        setPrimaryDiff(payload.diff);
      } else {
        setDriftDiff(payload.diff);
      }
    } catch (loadError) {
      setDiffError((loadError as Error).message);
    } finally {
      if (kind === "primary") {
        setPrimaryDiffLoading(false);
      } else {
        setDriftDiffLoading(false);
      }
    }
  }, [detail?.committed?.attemptId, detail?.run.id, driftDiffLoading, primaryDiffLoading]);

  useEffect(() => {
    let cancelled = false;
    const runId = params.id;
    const loadController = new AbortController();

    if (!runId) {
      setError("Run id is required");
      setLoading(false);
      return;
    }

    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      setDetail(null);
      setCommittedAttemptDetail(null);
      setAttemptError(null);
      setPrimaryDiff(null);
      setDriftDiff(null);
      setDiffError(null);
      setShowDrift(false);
      try {
        const payload = await fetchRunDetail(runId, { signal: loadController.signal });
        if (cancelled) {
          return;
        }

        setDetail(payload);
        setCommittedAttemptDetail(payload.committed?.attemptDetail ?? null);
        if (payload.committed?.attemptId && !payload.committed.attemptDetail) {
          await loadCommittedAttempt(runId, payload.committed.attemptId, loadController.signal);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError((loadError as Error).message);
          setDetail(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      loadController.abort();
    };
  }, [loadCommittedAttempt, params.id]);

  const committedAttemptId = detail?.committed?.attemptId ?? null;

  useEffect(() => {
    committedAttemptIdRef.current = committedAttemptId;
  }, [committedAttemptId]);

  useEffect(() => {
    if (!detail?.run.id || !committedAttemptId) {
      setCommittedAttemptDetail(null);
      setAttemptError(null);
      return;
    }

    if (committedAttemptDetail?.attemptId === committedAttemptId) {
      return;
    }

    const controller = new AbortController();
    void loadCommittedAttempt(detail.run.id, committedAttemptId, controller.signal);
    return () => {
      controller.abort();
    };
  }, [committedAttemptDetail?.attemptId, committedAttemptId, detail?.run.id, loadCommittedAttempt]);

  useEffect(() => {
    if (!detail?.run.id || detail.run.status !== "pending") {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    let activePollController: AbortController | null = null;

    const poll = async (): Promise<void> => {
      activePollController = new AbortController();
      try {
        const progress = await fetchRunProgress(detail.run.id, { signal: activePollController.signal });
        if (cancelled) {
          return;
        }

        const attempts = progress.attempts.map((attempt) => ({
          id: `${progress.run.id}:${attempt.attemptId}`,
          ...attempt,
        }));

        setDetail((previous) => {
          if (!previous || previous.run.id !== progress.run.id) {
            return previous;
          }

          return {
            ...previous,
            run: progress.run,
            operationState: progress.operationState,
            attempts,
            committed: previous.committed && progress.run.committedAttemptId
              ? {
                  ...previous.committed,
                  attemptId: progress.run.committedAttemptId,
                  attempt:
                    attempts.find((attempt) => attempt.attemptId === progress.run.committedAttemptId) ?? previous.committed.attempt,
                }
              : previous.committed,
          };
        });

        if (progress.run.committedAttemptId !== committedAttemptIdRef.current) {
          setCommittedAttemptDetail(null);
          setPrimaryDiff(null);
          setDriftDiff(null);
          setDiffError(null);
          setShowDrift(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError((loadError as Error).message);
        }
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(() => {
            void poll();
          }, 5000);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      activePollController?.abort();
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [detail?.run.id, detail?.run.status]);

  const initiative = detail?.ticket?.initiativeId
    ? initiatives.find((item) => item.id === detail.ticket?.initiativeId) ?? null
    : null;

  usePersistInitiativeResumeTicket({
    initiativeId: initiative?.id ?? null,
    resumeTicketId: detail?.ticket?.initiativeId ? detail.ticket.id : null,
    currentResumeTicketId: initiative?.workflow.resumeTicketId,
    showError,
  });

  if (loading) {
    return { status: "loading" };
  }

  if (error || !detail) {
    return {
      status: "error",
      error: error ?? "Missing run detail payload.",
    };
  }

  const criteriaResults = committedAttemptDetail?.criteriaResults ?? [];
  const criteriaPassed = criteriaResults.filter((criterion) => criterion.pass).length;
  const criteriaTotal = criteriaResults.length;
  const validationScore = criteriaTotal > 0 ? Math.round((criteriaPassed / criteriaTotal) * 100) : 0;
  const criteriaLogTimestamp = formatLogTime(committedAttemptDetail?.createdAt ?? detail.run.createdAt);
  const verificationPass = committedAttemptDetail?.overallPass ?? detail.committed?.attempt?.overallPass ?? null;
  const bundleFiles = [
    ...(detail.committed?.bundleManifest?.requiredFiles ?? []),
    ...(detail.committed?.bundleManifest?.contextFiles ?? []),
  ];
  const runTypeLabel = detail.run.type === "audit" ? "Audit report" : "Run report";
  const reportVerdict = verificationPass === null ? "No verdict yet" : verificationPass ? "Pass" : "Fail";
  const committedHasPrimaryDiff = Boolean(committedAttemptDetail?.primaryDiffPath);
  const committedHasDriftDiff = Boolean(committedAttemptDetail?.driftDiffPath);

  return {
    status: "ready",
    detail,
    initiative,
    committedAttemptDetail,
    attemptLoading,
    attemptError,
    primaryDiff,
    primaryDiffLoading,
    driftDiff,
    driftDiffLoading,
    diffError,
    showDrift,
    criteriaResults,
    criteriaPassed,
    criteriaTotal,
    criteriaLogTimestamp,
    validationScore,
    validationScoreToneClass: getValidationScoreToneClass(validationScore),
    validationScoreValueClass: getValidationScoreValueClass(validationScore),
    verificationPass,
    bundleFiles,
    runTypeLabel,
    reportVerdict,
    committedHasPrimaryDiff,
    committedHasDriftDiff,
    loadPrimaryDiff: async () => loadDiff("primary"),
    toggleDrift: () => {
      if (showDrift) {
        setShowDrift(false);
        return;
      }

      setShowDrift(true);
      if (!driftDiff) {
        void loadDiff("drift");
      }
    },
  };
};
