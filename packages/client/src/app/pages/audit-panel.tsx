import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createTicketFromAuditFinding,
  dismissAuditFinding,
  exportFixBundle,
  runAudit
} from "../../api";
import type { AuditCategory, AuditReport } from "../../types";
import { useToast } from "../context/toast";
import { DiffViewer, findDiffRowsForFinding } from "../components/diff-viewer";

const CATEGORY_BADGE: Record<AuditCategory, string> = {
  bug: "badge danger",
  security: "badge danger",
  performance: "badge warn",
  acceptance: "badge warn",
  drift: "badge",
  convention: "badge",
  clarity: "badge"
};

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
  const [exportAgent, setExportAgent] = useState<"claude-code" | "codex-cli" | "opencode" | "generic">("codex-cli");
  const [exportFlat, setExportFlat] = useState<string | null>(null);

  useEffect(() => {
    setScopeInput("");
    setScopeTouched(false);
  }, [defaultScopePaths.join(",")]);

  const selectedFinding = report?.findings.find((item) => item.id === selectedFindingId) ?? null;
  const highlightedRows = selectedFinding && report
    ? findDiffRowsForFinding(report.primaryDiff, selectedFinding.file, selectedFinding.line)
    : new Set<number>();

  const executeAudit = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      const diffSource =
        mode === "branch"
          ? { mode: "branch" as const, branch }
          : mode === "commit-range"
            ? { mode: "commit-range" as const, from: fromCommit, to: toCommit }
            : { mode: "snapshot" as const };

      const payload = await runAudit(runId, {
        diffSource,
        scopePaths: scopeInput
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
        widenedScopePaths: widenedInput
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      });

      setReport(payload);
      if (!scopeTouched && payload.defaultScope.length > 0) {
        setScopeInput(payload.defaultScope.join(", "));
      }
      setSelectedFindingId(payload.findings[0]?.id ?? null);
    } catch (err) {
      showError((err as Error).message ?? "Audit failed");
    } finally {
      setBusy(false);
    }
  }, [runId, mode, branch, fromCommit, toCommit, scopeInput, scopeTouched, widenedInput, showError]);

  const executeAuditRef = useRef(executeAudit);
  executeAuditRef.current = executeAudit;

  useEffect(() => {
    void executeAuditRef.current();
  }, [runId]);

  return (
    <div className="panel">
      <h3>Drift Audit</h3>
      <div className="button-row">
        <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
          <option value="branch">Git Branch</option>
          <option value="commit-range">Commit Range</option>
          <option value="snapshot">File Snapshot</option>
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

      <div className="button-row">
        <button type="button" onClick={() => void executeAudit()} disabled={busy}>
          {busy ? "Running..." : "Run Audit"}
        </button>
      </div>

      {!report ? <p>No audit report yet.</p> : null}
      {report ? (
        <div className="audit-layout">
          <div>
            <h4>Findings</h4>
            <ul>
              {report.findings.map((finding) => (
                <li key={finding.id}>
                  <div className="button-row">
                    <span className={finding.severity === "error" ? "badge danger" : finding.severity === "warning" ? "badge warn" : "badge"}>
                      {finding.severity}
                    </span>
                    <span className={CATEGORY_BADGE[finding.category] ?? "badge"}>{finding.category}</span>
                    {finding.confidence !== undefined ? (
                      <span className="badge" title="LLM confidence score">
                        {Math.round(finding.confidence * 100)}%
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={selectedFindingId === finding.id ? "tab active" : "tab"}
                    onClick={() => setSelectedFindingId(finding.id)}
                  >
                    {finding.file}
                    {finding.line ? `:${finding.line}` : ""}
                  </button>
                  <div>{finding.description}</div>
                  {finding.dismissed ? <div className="badge warn">Dismissed: {finding.dismissNote}</div> : null}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Unified Diff</h4>
            <DiffViewer title="Audit Diff" diff={report.primaryDiff || "(empty diff)"} highlightedRows={highlightedRows} />
            {report.driftDiff ? <DiffViewer title="Drift Diff" diff={report.driftDiff} /> : null}

            {selectedFinding ? (
              <div className="panel">
                <h4>Finding Actions</h4>
                <div className="button-row">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const ticket = await createTicketFromAuditFinding(runId, selectedFinding.id);
                        navigate(`/tickets/${ticket.id}`);
                      } catch (err) {
                        showError((err as Error).message ?? "Failed to create ticket");
                      }
                    }}
                  >
                    Create Ticket
                  </button>
                  <select value={exportAgent} onChange={(event) => setExportAgent(event.target.value as typeof exportAgent)}>
                    <option value="claude-code">Claude Code</option>
                    <option value="codex-cli">Codex CLI</option>
                    <option value="opencode">OpenCode</option>
                    <option value="generic">Generic</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const exported = await exportFixBundle(runId, selectedFinding.id, exportAgent);
                        setExportFlat(exported.flatString);
                        void navigator.clipboard.writeText(exported.flatString);
                      } catch (err) {
                        showError((err as Error).message ?? "Export failed");
                      }
                    }}
                  >
                    Export Fix Bundle
                  </button>
                </div>

                <textarea
                  className="multiline"
                  value={dismissNote}
                  onChange={(event) => setDismissNote(event.target.value)}
                  placeholder="Required dismiss note"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!dismissNote.trim()) {
                      return;
                    }
                    try {
                      await dismissAuditFinding(runId, selectedFinding.id, dismissNote);
                      setDismissNote("");
                      await executeAudit();
                    } catch (err) {
                      showError((err as Error).message ?? "Dismiss failed");
                    }
                  }}
                >
                  Dismiss
                </button>

                {exportFlat ? <pre>{exportFlat}</pre> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
