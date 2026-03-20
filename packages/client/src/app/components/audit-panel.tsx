import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createTicketFromAuditFinding,
  dismissAuditFinding,
  fetchBundleText,
  exportFixBundle,
  runAudit
} from "../../api.js";
import type { AuditCategory, AuditReport } from "../../types.js";
import { useToast } from "../context/toast.js";
import { parseScopeCsv } from "../utils/scope-paths.js";
import { DiffViewer, findDiffRowsForFinding } from "./diff-viewer.js";

const CLEAR_AUDIT_DESCRIPTION = "No audit findings were detected for the selected scope.";

const CATEGORY_BADGE: Record<AuditCategory, string> = {
  bug: "badge danger",
  security: "badge danger",
  performance: "badge warn",
  acceptance: "badge warn",
  drift: "badge",
  convention: "badge",
  clarity: "badge"
};

const DIFF_SOURCE_LABEL: Record<AuditReport["diffSourceMode"], string> = {
  branch: "Git branch",
  "commit-range": "Commit range",
  snapshot: "File snapshot"
};

const formatFindingLocation = (file: string, line: number | null): string =>
  `${file}${line ? `:${line}` : ""}`;

const isClearAuditFinding = (description: string): boolean => description === CLEAR_AUDIT_DESCRIPTION;

export const AuditPanel = ({
  runId,
  defaultScopePaths
}: {
  runId: string;
  defaultScopePaths: string[];
}) => {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [mode, setMode] = useState<"branch" | "commit-range" | "snapshot">("branch");
  const [branch, setBranch] = useState("main");
  const [fromCommit, setFromCommit] = useState("");
  const [toCommit, setToCommit] = useState("");
  const [scopeInput, setScopeInput] = useState("");
  const [scopeTouched, setScopeTouched] = useState(false);
  const [widenedInput, setWidenedInput] = useState("");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [dismissNote, setDismissNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<"ticket" | "bundle" | "dismiss" | null>(null);
  const [exportAgent, setExportAgent] = useState<"claude-code" | "codex-cli" | "opencode" | "generic">("codex-cli");
  const [exportFlat, setExportFlat] = useState<string | null>(null);
  const defaultScopeKey = defaultScopePaths.join(",");

  useEffect(() => {
    setScopeInput("");
    setScopeTouched(false);
  }, [defaultScopeKey]);

  useEffect(() => {
    setDismissNote("");
    setExportFlat(null);
  }, [selectedFindingId]);

  const visibleFindings = report?.findings.filter((item) => !isClearAuditFinding(item.description)) ?? [];
  const selectedFinding = visibleFindings.find((item) => item.id === selectedFindingId) ?? null;
  const highlightedRows = selectedFinding && report
    ? findDiffRowsForFinding(report.primaryDiff, selectedFinding.file, selectedFinding.line)
    : new Set<number>();
  const dismissedFindings = visibleFindings.filter((item) => item.dismissed);
  const severitySummary = {
    error: visibleFindings.filter((item) => item.severity === "error" && !item.dismissed).length,
    warning: visibleFindings.filter((item) => item.severity === "warning" && !item.dismissed).length,
    info: visibleFindings.filter((item) => item.severity === "info" && !item.dismissed).length
  };
  const scopePreview = (report?.defaultScope.length ? report.defaultScope : defaultScopePaths).slice(0, 3);

  const executeAudit = useCallback(async (): Promise<void> => {
    setBusy(true);
    setExportFlat(null);
    try {
      const diffSource =
        mode === "branch"
          ? { mode: "branch" as const, branch }
          : mode === "commit-range"
            ? { mode: "commit-range" as const, from: fromCommit, to: toCommit }
            : { mode: "snapshot" as const };

      const payload = await runAudit(runId, {
        diffSource,
        scopePaths: parseScopeCsv(scopeInput),
        widenedScopePaths: parseScopeCsv(widenedInput)
      });

      setReport(payload);
      if (!scopeTouched && payload.defaultScope.length > 0) {
        setScopeInput(payload.defaultScope.join(", "));
      }
      const nextVisibleFindings = payload.findings.filter((item) => !isClearAuditFinding(item.description));
      setSelectedFindingId(nextVisibleFindings[0]?.id ?? null);
    } catch (err) {
      showError((err as Error).message ?? "We couldn't review the changes.");
    } finally {
      setBusy(false);
    }
  }, [runId, mode, branch, fromCommit, toCommit, scopeInput, scopeTouched, widenedInput, showError]);

  return (
    <div className="panel audit-review">
      <div className="audit-review-header">
        <div className="audit-review-intro">
          <h3>Review changes</h3>
          <p className="text-muted-sm">
            Start with the default review for this run. Open review options only when the default comparison or scope is wrong.
          </p>
        </div>
        <div className="button-row">
          <button type="button" onClick={() => void executeAudit()} disabled={busy}>
            {busy ? (
              <span className="btn-loading">
                <span className="status-loading-spinner" aria-hidden="true" />
                <span className="loading-label-pulse">Reviewing changes...</span>
              </span>
            ) : report ? "Refresh review" : "Review changes"}
          </button>
        </div>
      </div>

      <div className="audit-review-meta">
        <span className="badge">
          {report ? DIFF_SOURCE_LABEL[report.diffSourceMode] : mode === "branch" ? "Git branch" : mode === "commit-range" ? "Commit range" : "File snapshot"}
        </span>
        <span className="badge">
          {scopePreview.length > 0
            ? `Main files: ${scopePreview.join(", ")}${(report?.defaultScope.length ?? defaultScopePaths.length) > scopePreview.length ? "..." : ""}`
            : "Main files: not recorded"}
        </span>
        {report ? (
          <span className="badge">
            Updated {new Date(report.generatedAt).toLocaleString()}
          </span>
        ) : null}
      </div>

      <details className="audit-review-disclosure">
        <summary>Review options</summary>
        <div className="audit-review-disclosure-body">
          <p className="text-muted-sm">
            Use these only when you need a different baseline or a narrower review scope than the default run context.
          </p>
          <div className="button-row">
            <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="branch">Git branch</option>
              <option value="commit-range">Commit range</option>
              <option value="snapshot">File snapshot</option>
            </select>
            {mode === "branch" ? (
              <input value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="branch name" />
            ) : null}
            {mode === "commit-range" ? (
              <>
                <input value={fromCommit} onChange={(event) => setFromCommit(event.target.value)} placeholder="from commit" />
                <input value={toCommit} onChange={(event) => setToCommit(event.target.value)} placeholder="to commit" />
              </>
            ) : null}
          </div>

          <input
            className="phase-name-input"
            value={scopeInput}
            onChange={(event) => {
              setScopeInput(event.target.value);
              setScopeTouched(true);
            }}
            placeholder={
              defaultScopePaths.length > 0
                ? `Primary scope (default: ${defaultScopePaths.join(", ")})`
                : "Primary scope paths (comma separated)"
            }
          />
          <input
            className="phase-name-input"
            value={widenedInput}
            onChange={(event) => setWidenedInput(event.target.value)}
            placeholder="Widened scope paths (comma separated)"
          />
        </div>
      </details>

      {!report ? (
        <p className="audit-review-helper">
          Review the run when you want a guided pass over the changed files, acceptance criteria, and unexpected scope drift.
        </p>
      ) : null}

      {report ? (
        <div className="audit-layout">
          <div className="audit-review-findings">
            <div className="audit-review-section-header">
              <div>
                <h4>Findings</h4>
                <p className="text-muted-sm">
                  {visibleFindings.length === 0
                    ? "No follow-up work is flagged for this review."
                    : "Focus on one finding at a time. Create follow-up work only when the review shows a concrete gap."}
                </p>
              </div>
              {visibleFindings.length > 0 ? (
                <div className="audit-review-counts">
                  {severitySummary.error > 0 ? <span className="badge danger">{severitySummary.error} error</span> : null}
                  {severitySummary.warning > 0 ? <span className="badge warn">{severitySummary.warning} warning</span> : null}
                  {severitySummary.info > 0 ? <span className="badge">{severitySummary.info} info</span> : null}
                  {dismissedFindings.length > 0 ? <span className="badge">{dismissedFindings.length} dismissed</span> : null}
                </div>
              ) : null}
            </div>

            {visibleFindings.length === 0 ? (
              <div className="audit-review-empty">
                <strong>No findings</strong>
                <p className="text-muted-sm">The selected comparison did not produce any follow-up issues.</p>
              </div>
            ) : (
              <ul className="audit-finding-list">
                {visibleFindings.map((finding) => (
                  <li key={finding.id} className="audit-finding-item">
                    <button
                      type="button"
                      className={selectedFindingId === finding.id ? "audit-finding-button active" : "audit-finding-button"}
                      onClick={() => setSelectedFindingId(finding.id)}
                    >
                      <div className="audit-finding-meta">
                        <span className={finding.severity === "error" ? "badge danger" : finding.severity === "warning" ? "badge warn" : "badge"}>
                          {finding.severity}
                        </span>
                        <span className={CATEGORY_BADGE[finding.category] ?? "badge"}>{finding.category}</span>
                        {finding.confidence !== undefined ? (
                          <span className="badge" title="LLM confidence score">
                            {Math.round(finding.confidence * 100)}%
                          </span>
                        ) : null}
                        {finding.dismissed ? <span className="badge">Dismissed</span> : null}
                      </div>
                      <strong className="audit-finding-description">{finding.description}</strong>
                      <span className="audit-finding-path">{formatFindingLocation(finding.file, finding.line)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="audit-review-details">
            <div className="audit-review-section-header">
              <div>
                <h4>{selectedFinding ? "Selected finding" : "Review details"}</h4>
                <p className="text-muted-sm">
                  {selectedFinding
                    ? "Check the suggested issue, confirm it in the diff, then decide whether it needs follow-up work."
                    : "Open the diff context if you want to inspect the review output in detail."}
                </p>
              </div>
            </div>

            {selectedFinding ? (
              <div className="audit-finding-detail">
                <div className="audit-finding-meta">
                  <span className={selectedFinding.severity === "error" ? "badge danger" : selectedFinding.severity === "warning" ? "badge warn" : "badge"}>
                    {selectedFinding.severity}
                  </span>
                  <span className={CATEGORY_BADGE[selectedFinding.category] ?? "badge"}>{selectedFinding.category}</span>
                  {selectedFinding.confidence !== undefined ? (
                    <span className="badge" title="LLM confidence score">
                      {Math.round(selectedFinding.confidence * 100)}%
                    </span>
                  ) : null}
                </div>
                <p className="audit-finding-location">{formatFindingLocation(selectedFinding.file, selectedFinding.line)}</p>
                <p>{selectedFinding.description}</p>
                {selectedFinding.dismissed && selectedFinding.dismissNote ? (
                  <p className="audit-finding-dismissed">Dismissed: {selectedFinding.dismissNote}</p>
                ) : null}

                <div className="button-row">
                  <button
                    type="button"
                    disabled={pendingAction !== null}
                    onClick={async () => {
                      setPendingAction("ticket");
                      try {
                        const ticket = await createTicketFromAuditFinding(runId, selectedFinding.id);
                        navigate(`/ticket/${ticket.id}`);
                      } catch (err) {
                        showError((err as Error).message ?? "We couldn't create the follow-up ticket.");
                      } finally {
                        setPendingAction(null);
                      }
                    }}
                  >
                    Create follow-up ticket
                  </button>
                  <select
                    value={exportAgent}
                    disabled={pendingAction !== null}
                    onChange={(event) => setExportAgent(event.target.value as typeof exportAgent)}
                  >
                    <option value="claude-code">Claude Code</option>
                    <option value="codex-cli">Codex CLI</option>
                    <option value="opencode">OpenCode</option>
                    <option value="generic">Generic</option>
                  </select>
                  <button
                    type="button"
                    disabled={pendingAction !== null}
                    onClick={async () => {
                      setPendingAction("bundle");
                      try {
                        const exported = await exportFixBundle(runId, selectedFinding.id, exportAgent);
                        const bundleText = await fetchBundleText(exported.runId, exported.attemptId);
                        setExportFlat(bundleText);
                        if (navigator.clipboard?.writeText) {
                          await navigator.clipboard.writeText(bundleText);
                        }
                      } catch (err) {
                        showError((err as Error).message ?? "We couldn't create the fix bundle.");
                      } finally {
                        setPendingAction(null);
                      }
                    }}
                  >
                    Export fix bundle
                  </button>
                </div>

                {!selectedFinding.dismissed ? (
                  <details className="audit-review-disclosure">
                    <summary>Dismiss</summary>
                    <div className="audit-review-disclosure-body">
                      <p className="text-muted-sm">
                        Dismiss only when this change is intentional and does not need follow-up work.
                      </p>
                      <textarea
                        className="multiline textarea-sm"
                        value={dismissNote}
                        onChange={(event) => setDismissNote(event.target.value)}
                        placeholder="Explain why this finding does not need follow-up."
                      />
                      <div className="button-row">
                        <button
                          type="button"
                          disabled={pendingAction !== null || dismissNote.trim().length === 0}
                          onClick={async () => {
                            const note = dismissNote.trim();
                            if (!note) {
                              return;
                            }

                            setPendingAction("dismiss");
                            try {
                              await dismissAuditFinding(runId, selectedFinding.id, note);
                              setReport((previous) => previous ? {
                                ...previous,
                                findings: previous.findings.map((finding) => finding.id === selectedFinding.id
                                  ? { ...finding, dismissed: true, dismissNote: note }
                                  : finding)
                              } : previous);
                              setDismissNote("");
                            } catch (err) {
                              showError((err as Error).message ?? "We couldn't dismiss the finding.");
                            } finally {
                              setPendingAction(null);
                            }
                          }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </details>
                ) : null}
              </div>
            ) : (
              <div className="audit-review-empty">
                <strong>Review looks clear</strong>
                <p className="text-muted-sm">No follow-up finding is selected for this run.</p>
              </div>
            )}

            <details className="audit-review-disclosure">
              <summary>Diff context</summary>
              <div className="audit-review-disclosure-body">
                <p className="text-muted-sm">
                  Inspect the recorded diff when you want to confirm the review outcome before taking action.
                </p>
                <DiffViewer title="Diff context" diff={report.primaryDiff || "(empty diff)"} highlightedRows={highlightedRows} />
                {report.driftDiff ? <DiffViewer title="Out-of-scope diff" diff={report.driftDiff} /> : null}
              </div>
            </details>

            {exportFlat ? (
              <details className="audit-review-disclosure" open>
                <summary>Fix bundle contents</summary>
                <div className="audit-review-disclosure-body">
                  <p className="text-muted-sm">The latest fix bundle was copied to the clipboard when available.</p>
                  <pre className="audit-export-preview">{exportFlat}</pre>
                </div>
              </details>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
