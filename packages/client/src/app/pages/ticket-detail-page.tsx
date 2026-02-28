import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  capturePreview,
  captureResults,
  exportBundle,
  fetchOperationStatus,
  fetchRunState,
  overrideDone
} from "../../api";
import type { Initiative, Run, RunAttempt, Ticket } from "../../types";
import { useToast } from "../context/toast";
import { findPhaseWarning } from "../utils/phase-warning";
import { AuditPanel } from "./audit-panel";

export const TicketDetailPage = ({
  tickets,
  runs,
  runAttempts,
  initiatives,
  onRefresh
}: {
  tickets: Ticket[];
  runs: Run[];
  runAttempts: RunAttempt[];
  initiatives: Initiative[];
  onRefresh: () => Promise<void>;
}) => {
  const params = useParams<{ id: string }>();
  const { showError } = useToast();
  const [activeTab, setActiveTab] = useState<"plan" | "runs">("plan");
  const [operationState, setOperationState] = useState<string | null>(null);
  const [agentTarget, setAgentTarget] = useState<"claude-code" | "codex-cli" | "opencode" | "generic">("codex-cli");
  const [exportResult, setExportResult] = useState<{
    runId: string;
    attemptId: string;
    flatString: string;
    bundlePath: string;
  } | null>(null);
  const [captureSummary, setCaptureSummary] = useState("");
  const [captureScopeInput, setCaptureScopeInput] = useState("");
  const [widenedInput, setWidenedInput] = useState("");
  const [capturePreviewData, setCapturePreviewData] = useState<{
    source: "git" | "snapshot";
    defaultScope: string[];
    changedPaths: string[];
    primaryDiff: string;
    driftDiff: string | null;
  } | null>(null);
  const [selectedNoGitPaths, setSelectedNoGitPaths] = useState<string[]>([]);
  const [verifyStreamEvents, setVerifyStreamEvents] = useState<string[]>([]);
  const [verificationResult, setVerificationResult] = useState<{
    overallPass: boolean;
    criteriaResults: Array<{
      criterionId: string;
      pass: boolean;
      evidence: string;
      severity?: "critical" | "major" | "minor" | "outdated";
      remediationHint?: string;
    }>;
    driftFlags: Array<{
      type: string;
      file: string;
      description: string;
      severity?: "critical" | "major" | "minor" | "outdated";
    }>;
  } | null>(null);
  const [verifyState, setVerifyState] = useState<"idle" | "running" | "reconnecting">("idle");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideStepTwo, setOverrideStepTwo] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [showAuditPanel, setShowAuditPanel] = useState(false);
  const [fixForwardReady, setFixForwardReady] = useState(false);

  const ticket = tickets.find((item) => item.id === params.id);
  const run = runs.find((item) => item.id === ticket?.runId);
  const attempts = runAttempts.filter((attempt) => run?.attempts.includes(attempt.attemptId));
  const parseScopeCsv = (value: string): string[] =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const syncVerificationFromRunState = (attemptData: Array<{
    attemptId: string;
    overallPass: boolean;
    criteriaResults: Array<{
      criterionId: string;
      pass: boolean;
      evidence: string;
      severity?: "critical" | "major" | "minor" | "outdated";
      remediationHint?: string;
    }>;
    driftFlags: Array<{
      type: string;
      file: string;
      description: string;
      severity?: "critical" | "major" | "minor" | "outdated";
    }>;
  }>): void => {
    const latest = attemptData
      .slice()
      .sort((left, right) => left.attemptId.localeCompare(right.attemptId))
      .at(-1);

    if (!latest) {
      return;
    }

    setVerificationResult({
      overallPass: latest.overallPass,
      criteriaResults: latest.criteriaResults,
      driftFlags: latest.driftFlags
    });
  };

  useEffect(() => {
    const ticketId = params.id;
    if (!ticketId) {
      return;
    }

    let isMounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let source: EventSource | null = null;

    const connect = (): void => {
      if (!isMounted) {
        return;
      }

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
        if (!run?.id) {
          return;
        }

        void fetchRunState(run.id).then((snapshot) => {
          syncVerificationFromRunState(snapshot.attempts);
        });
      });

      source.onerror = () => {
        source?.close();
        const backoff = Math.min(1000 * 2 ** reconnectAttempt, 10_000);
        reconnectAttempt += 1;

        reconnectTimer = setTimeout(() => {
          setVerifyState("reconnecting");
          if (run?.id) {
            void fetchRunState(run.id)
              .then((snapshot) => syncVerificationFromRunState(snapshot.attempts))
              .catch(() => {});
          }
          void onRefresh().finally(() => {
            setVerifyState("idle");
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
  }, [params.id, run?.id]);

  useEffect(() => {
    if (!ticket) {
      return;
    }

    setCaptureScopeInput(ticket.fileTargets.join(", "));
  }, [ticket?.id]);

  const refreshCapturePreview = useCallback(async (): Promise<void> => {
    if (!ticket) {
      return;
    }

    try {
      const preview = await capturePreview(ticket.id, {
        scopePaths: parseScopeCsv(captureScopeInput),
        widenedScopePaths: parseScopeCsv(widenedInput),
        diffSource: { mode: "auto" }
      });

      setCapturePreviewData(preview);

      if (!captureScopeInput.trim() && preview.defaultScope.length > 0) {
        setCaptureScopeInput(preview.defaultScope.join(", "));
      }
    } catch (err) {
      showError((err as Error).message ?? "Failed to load diff preview");
    }
  }, [ticket?.id, captureScopeInput, widenedInput, showError]);

  useEffect(() => {
    if (!run?.activeOperationId) {
      setOperationState(null);
      return;
    }

    void fetchOperationStatus(run.activeOperationId).then((status) => {
      setOperationState(status?.state ?? null);
    });
  }, [run?.activeOperationId]);

  useEffect(() => {
    if (!ticket?.id || !run?.id) {
      return;
    }

    void refreshCapturePreview();
  }, [ticket?.id, run?.id, refreshCapturePreview]);

  useEffect(() => {
    if (!ticket?.id || !run?.id) {
      return;
    }

    const timer = setTimeout(() => {
      void refreshCapturePreview();
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [captureScopeInput, widenedInput, ticket?.id, run?.id, refreshCapturePreview]);

  if (!ticket) {
    return (
      <section>
        <h2>Ticket not found</h2>
      </section>
    );
  }

  const phaseWarning = findPhaseWarning(ticket, initiatives, tickets);
  const primaryDrift = verificationResult?.driftFlags.filter((flag) => flag.type !== "widened-scope-drift") ?? [];
  const widenedDrift = verificationResult?.driftFlags.filter((flag) => flag.type === "widened-scope-drift") ?? [];
  const blockerTickets = (ticket.blockedBy ?? []).map((id) => tickets.find((t) => t.id === id)).filter(Boolean) as typeof tickets;
  const hasUnfinishedBlockers = blockerTickets.some((t) => t.status !== "done");

  return (
    <section>
      <header className="section-header">
        <h2>{ticket.title}</h2>
        <p>{ticket.description}</p>
        {run ? (
          <div className="button-row">
            <Link to={`/runs/${run.id}`}>Open Run</Link>
            <button type="button" onClick={() => setShowAuditPanel((current) => !current)}>
              {showAuditPanel ? "Hide Audit" : "Run Audit"}
            </button>
          </div>
        ) : null}
      </header>

      {operationState === "abandoned" || operationState === "superseded" || operationState === "failed" ? (
        <div className="status-banner">
          Operation {operationState}. Retry from ticket actions.
          <span>
            {" "}
            <button type="button" onClick={() => setActiveTab("plan")}>
              Go to Retry Controls
            </button>
          </span>
        </div>
      ) : null}

      {phaseWarning.hasWarning ? <div className="status-banner warn">{phaseWarning.message}</div> : null}
      {blockerTickets.length > 0 ? (
        <div className={hasUnfinishedBlockers ? "status-banner warn" : "status-banner"}>
          {hasUnfinishedBlockers ? "Blocked by: " : "Dependencies (all done): "}
          {blockerTickets.map((blocker, index) => (
            <span key={blocker.id}>
              {index > 0 ? ", " : ""}
              <Link to={`/tickets/${blocker.id}`}>{blocker.title}</Link>
              {" "}({blocker.status})
            </span>
          ))}
        </div>
      ) : null}
      {verifyState === "reconnecting" ? (
        <div className="status-banner warn">Reconnecting to verification stream and refreshing run snapshot...</div>
      ) : null}

      {showAuditPanel && run ? <AuditPanel runId={run.id} defaultScopePaths={ticket.fileTargets} /> : null}

      <div className="tab-row">
        <button type="button" className={activeTab === "plan" ? "tab active" : "tab"} onClick={() => setActiveTab("plan")}>
          Plan
        </button>
        <button type="button" className={activeTab === "runs" ? "tab active" : "tab"} onClick={() => setActiveTab("runs")}>
          Runs
        </button>
      </div>

      {activeTab === "plan" ? (
        <div className="panel">
          <h3>Acceptance Criteria</h3>
          <ul>
            {ticket.acceptanceCriteria.map((criterion) => (
              <li key={criterion.id}>{criterion.text}</li>
            ))}
          </ul>
          <h3>Implementation Plan</h3>
          <pre>{ticket.implementationPlan || "(not provided)"}</pre>
          <h3>File Targets</h3>
          <ul>
            {ticket.fileTargets.length === 0 ? <li>(none)</li> : ticket.fileTargets.map((target) => <li key={target}>{target}</li>)}
          </ul>

          <h3>Export Bundle</h3>
          <div className="button-row">
            <select value={agentTarget} onChange={(event) => setAgentTarget(event.target.value as typeof agentTarget)}>
              <option value="claude-code">Claude Code</option>
              <option value="codex-cli">Codex CLI</option>
              <option value="opencode">OpenCode</option>
              <option value="generic">Generic</option>
            </select>
            <button
              type="button"
              onClick={async () => {
                try {
                  const exported = await exportBundle(ticket.id, agentTarget);
                  if (downloadUrl) {
                    URL.revokeObjectURL(downloadUrl);
                  }

                  const blob = new Blob([exported.flatString], { type: "text/plain" });
                  const nextUrl = URL.createObjectURL(blob);
                  setDownloadUrl(nextUrl);
                  setExportResult({
                    runId: exported.runId,
                    attemptId: exported.attemptId,
                    flatString: exported.flatString,
                    bundlePath: exported.bundlePath
                  });
                  await onRefresh();
                } catch (err) {
                  showError((err as Error).message ?? "Export failed");
                }
              }}
            >
              Export
            </button>
            {exportResult ? (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(exportResult.flatString);
                }}
              >
                Copy
              </button>
            ) : null}
            {downloadUrl ? (
              <a href={downloadUrl} download={`${ticket.id}-bundle-flat.md`} className="inline-action">
                Download flat bundle
              </a>
            ) : null}
            {exportResult ? (
              <a
                href={`/api/runs/${exportResult.runId}/attempts/${exportResult.attemptId}/bundle.zip`}
                className="inline-action"
              >
                Download bundle zip
              </a>
            ) : null}
          </div>
          {exportResult ? <pre>{exportResult.flatString}</pre> : null}

          <h3>Capture Results</h3>
          <p>Preview current changes, then submit capture scope and widened (drift-only) scope.</p>
          <div className="button-row">
            <button type="button" onClick={() => void refreshCapturePreview()}>
              Refresh diff preview
            </button>
            {capturePreviewData ? <span>Source: {capturePreviewData.source}</span> : null}
          </div>
          {capturePreviewData ? (
            <>
              <h4>Primary scope</h4>
              <input
                className="phase-name-input"
                value={captureScopeInput}
                onChange={(event) => setCaptureScopeInput(event.target.value)}
                placeholder="src/a.ts, src/b.ts"
              />
              <h4>Git diff preview</h4>
              <pre>{capturePreviewData.primaryDiff || "(no changes in selected scope)"}</pre>
            </>
          ) : null}
          {capturePreviewData?.source === "snapshot" ? (
            <div className="panel">
              <h4>No-git scope picker</h4>
              <input
                type="file"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  const paths = files.map((file) => file.webkitRelativePath || file.name);
                  setSelectedNoGitPaths(Array.from(new Set(paths)));
                }}
              />
              <input
                type="file"
                multiple
                {...({ webkitdirectory: "true", directory: "true" } as Record<string, string>)}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  const paths = files.map((file) => file.webkitRelativePath || file.name);
                  setSelectedNoGitPaths(Array.from(new Set(paths)));
                }}
              />
              <ul>
                {selectedNoGitPaths.length === 0
                  ? <li>No paths selected.</li>
                  : selectedNoGitPaths.map((entry) => <li key={entry}>{entry}</li>)}
              </ul>
            </div>
          ) : null}
          <textarea
            className="multiline"
            value={captureSummary}
            onChange={(event) => setCaptureSummary(event.target.value)}
            placeholder="Optional agent summary"
          />
          <input
            className="phase-name-input"
            value={widenedInput}
            onChange={(event) => setWidenedInput(event.target.value)}
            placeholder="widened/scope/path.ts, another/path.ts"
          />
          <div className="status-banner warn">Widened scope is treated as drift-only context.</div>
          <div className="button-row">
            <button
              type="button"
              onClick={async () => {
                setVerifyState("running");
                setVerifyStreamEvents([]);
                try {
                  const widenedScopePaths = parseScopeCsv(widenedInput);
                  const scopePaths =
                    capturePreviewData?.source === "snapshot" && selectedNoGitPaths.length > 0
                      ? selectedNoGitPaths
                      : parseScopeCsv(captureScopeInput);

                  const result = await captureResults(ticket.id, captureSummary, scopePaths, widenedScopePaths);
                  setVerificationResult(result);
                  await onRefresh();
                } catch (err) {
                  showError((err as Error).message ?? "Verification failed");
                } finally {
                  setVerifyState("idle");
                }
              }}
            >
              Submit Results
            </button>
            {verifyState === "running" ? <span>Verification running...</span> : null}
          </div>
          {verifyStreamEvents.length > 0 ? <pre>{verifyStreamEvents.join("")}</pre> : null}

          <h3>Verification</h3>
          {verificationResult ? (
            <>
              <p>
                Overall: {verificationResult.overallPass ? "pass" : "fail"}
                {attempts.length > 0 ? ` · Attempt ${attempts.length}` : ""}
              </p>
              <ul>
                {verificationResult.criteriaResults.map((criterion) => (
                  <li key={criterion.criterionId}>
                    <span className={`severity-badge severity-${criterion.severity ?? "minor"}`}>
                      {criterion.severity ?? ""}
                    </span>
                    {" "}{criterion.criterionId} · {criterion.pass ? "pass" : "fail"} · {criterion.evidence}
                    {!criterion.pass && criterion.remediationHint ? (
                      <div className="remediation-hint">{criterion.remediationHint}</div>
                    ) : null}
                  </li>
                ))}
              </ul>

              <h4>Primary drift flags</h4>
              <ul>
                {primaryDrift.length === 0
                  ? <li>None</li>
                  : primaryDrift.map((flag) => (
                    <li key={`${flag.type}-${flag.file}`}>
                      {flag.severity ? (
                        <span className={`severity-badge severity-${flag.severity}`}>{flag.severity}</span>
                      ) : null}
                      {" "}{flag.type} · {flag.file} · {flag.description}
                    </li>
                  ))}
              </ul>

              <h4>Widened-scope drift warnings</h4>
              <ul>
                {widenedDrift.length === 0 ? <li>None</li> : widenedDrift.map((flag) => <li key={`${flag.type}-${flag.file}`}>{flag.file} · {flag.description}</li>)}
              </ul>

              {!verificationResult.overallPass ? (
                <div>
                  <div className="button-row">
                    <button
                      type="button"
                      onClick={async () => {
                        setFixForwardReady(false);
                        try {
                          const exported = await exportBundle(ticket.id, agentTarget, "quick-fix");
                          const failureLines = verificationResult.criteriaResults
                            .filter((criterion) => !criterion.pass)
                            .map((criterion) => {
                              const hint = criterion.remediationHint ? ` Fix: ${criterion.remediationHint}` : "";
                              return `- [${criterion.severity ?? ""}] ${criterion.criterionId}: ${criterion.evidence}${hint}`;
                            });

                          const enrichedFlat =
                            failureLines.length > 0
                              ? `# Verification Failure Context\n${failureLines.join("\n")}\n\n${exported.flatString}`
                              : exported.flatString;
                          if (downloadUrl) {
                            URL.revokeObjectURL(downloadUrl);
                          }
                          const nextUrl = URL.createObjectURL(new Blob([enrichedFlat], { type: "text/plain" }));
                          setDownloadUrl(nextUrl);
                          setExportResult({
                            runId: exported.runId,
                            attemptId: exported.attemptId,
                            flatString: enrichedFlat,
                            bundlePath: exported.bundlePath
                          });
                          setFixForwardReady(true);
                          await onRefresh();
                        } catch (err) {
                          showError((err as Error).message ?? "Re-export failed");
                        }
                      }}
                    >
                      Re-export with findings
                    </button>
                    {fixForwardReady ? (
                      <button
                        type="button"
                        onClick={async () => {
                          setVerifyState("running");
                          setVerifyStreamEvents([]);
                          setFixForwardReady(false);
                          try {
                            const scopePaths = parseScopeCsv(captureScopeInput);
                            const widenedScopePaths = parseScopeCsv(widenedInput);
                            const result = await captureResults(ticket.id, captureSummary, scopePaths, widenedScopePaths);
                            setVerificationResult(result);
                            await onRefresh();
                          } catch (err) {
                            showError((err as Error).message ?? "Re-verification failed");
                          } finally {
                            setVerifyState("idle");
                          }
                        }}
                      >
                        Re-verify Now
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <h4>Override to Done</h4>
              <textarea
                className="multiline"
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                placeholder="Required reason for override"
              />
              {!overrideStepTwo ? (
                <button
                  type="button"
                  onClick={() => {
                    if (overrideReason.trim().length === 0) {
                      return;
                    }
                    setOverrideStepTwo(true);
                  }}
                >
                  Override
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await overrideDone(ticket.id, overrideReason, true);
                      setOverrideStepTwo(false);
                      setOverrideReason("");
                      await onRefresh();
                    } catch (err) {
                      showError((err as Error).message ?? "Override failed");
                    }
                  }}
                >
                  I accept risk
                </button>
              )}
            </>
          ) : (
            <p>No verification run captured yet.</p>
          )}
        </div>
      ) : (
        <div className="panel">
          <h3>Run Attempts</h3>
          {attempts.length === 0 ? (
            <p>No attempts yet.</p>
          ) : (
            <ul>
              {attempts.map((attempt) => (
                <li key={attempt.id}>
                  {attempt.attemptId} · {attempt.overallPass ? "pass" : "fail"} · {new Date(attempt.createdAt).toLocaleString()}
                  {attempt.overrideReason ? ` · override: ${attempt.overrideReason}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
