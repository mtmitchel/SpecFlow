import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchOperationStatus } from "../../api.js";
import type { Initiative, Run, RunAttempt, Ticket, TicketStatus } from "../../types.js";
import { useToast } from "../context/toast.js";
import { canTransition, statusColumns } from "../constants/status-columns.js";
import { findPhaseWarning } from "../utils/phase-warning.js";
import { AuditPanel } from "../components/audit-panel.js";
import { WorkflowSection } from "../components/workflow-section.js";
import { WorkflowStepper } from "../components/workflow-stepper.js";
import { useVerificationStream } from "../hooks/use-verification-stream.js";
import { useCapturePreview } from "../hooks/use-capture-preview.js";
import { useExportWorkflow } from "../hooks/use-export-workflow.js";
import { ExportSection } from "./ticket/export-section.js";
import { CaptureVerifySection } from "./ticket/capture-verify-section.js";
import { VerificationResultsSection } from "./ticket/verification-results-section.js";

export const TicketView = ({
  tickets,
  runs,
  runAttempts,
  initiatives,
  onRefresh,
  onMoveTicket
}: {
  tickets: Ticket[];
  runs: Run[];
  runAttempts: RunAttempt[];
  initiatives: Initiative[];
  onRefresh: () => Promise<void>;
  onMoveTicket: (ticketId: string, status: TicketStatus) => Promise<void>;
}) => {
  const params = useParams<{ id: string }>();
  const { showError } = useToast();
  const [activeTab, setActiveTab] = useState<"plan" | "runs">("plan");
  const [operationState, setOperationState] = useState<string | null>(null);
  const [showAuditPanel, setShowAuditPanel] = useState(false);
  const [moveToStatus, setMoveToStatus] = useState<TicketStatus | "">("");

  const ticket = tickets.find((item) => item.id === params.id);
  const run = runs.find((item) => item.id === ticket?.runId);
  const attempts = runAttempts.filter((attempt) => run?.attempts.includes(attempt.attemptId));

  // Reset per-ticket state when navigating to a different ticket
  const prevTicketId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (params.id !== prevTicketId.current) {
      prevTicketId.current = params.id;
      setMoveToStatus("");
    }
  }, [params.id]);

  const verify = useVerificationStream(params.id, run?.id, onRefresh);
  const capture = useCapturePreview(params.id, run?.id, ticket?.fileTargets ?? []);
  const exportWf = useExportWorkflow(params.id, onRefresh);

  useEffect(() => {
    if (!run?.activeOperationId) {
      setOperationState(null);
      return;
    }

    void fetchOperationStatus(run.activeOperationId).then((status) => {
      setOperationState(status?.state ?? null);
    });
  }, [run?.activeOperationId]);

  if (!ticket) {
    return (
      <section>
        <h2>Ticket not found</h2>
      </section>
    );
  }

  const phaseWarning = findPhaseWarning(ticket, initiatives, tickets);
  const blockerTickets = (ticket.blockedBy ?? []).map((id) => tickets.find((t) => t.id === id)).filter(Boolean) as typeof tickets;
  const hasUnfinishedBlockers = blockerTickets.some((t) => t.status !== "done");
  const validTransitions = statusColumns.filter((col) => canTransition(ticket.status, col.key));

  const workflowPhase: "export" | "agent" | "verify" | "done" =
    ticket.status === "done"
      ? "done"
      : verify.verificationResult
      ? "verify"
      : exportWf.exportResult || run
      ? "agent"
      : "export";

  return (
    <section>
      <header className="section-header">
        <h2>{ticket.title}</h2>
        <p>{ticket.description}</p>
        {run ? (
          <div className="button-row">
            <Link to={`/run/${run.id}`}>Open Run</Link>
            <button type="button" onClick={() => setShowAuditPanel((current) => !current)}>
              {showAuditPanel ? "Hide Audit" : "Run Audit"}
            </button>
          </div>
        ) : null}
        {validTransitions.length > 0 ? (
          <div className="button-row">
            <select
              value={moveToStatus}
              onChange={(e) => setMoveToStatus(e.target.value as TicketStatus)}
            >
              <option value="" disabled>Move to</option>
              {validTransitions.map((col) => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!moveToStatus}
              onClick={async () => {
                if (!moveToStatus) return;
                try {
                  await onMoveTicket(ticket.id, moveToStatus);
                  setMoveToStatus("");
                } catch (err) {
                  showError((err as Error).message ?? "Failed to move ticket");
                }
              }}
            >
              Move
            </button>
          </div>
        ) : null}
      </header>

      {operationState === "abandoned" || operationState === "superseded" || operationState === "failed" ? (
        <div className="status-banner">
          The previous export or verification did not complete. You can start a new one below.
          <span>
            {" "}
            <button type="button" onClick={() => setActiveTab("plan")}>
              Go to Plan
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
              <Link to={`/ticket/${blocker.id}`}>{blocker.title}</Link>
              {" "}({blocker.status})
            </span>
          ))}
        </div>
      ) : null}
      {verify.verifyState === "reconnecting" ? (
        <div className="status-banner warn">Reconnecting -- results will refresh automatically</div>
      ) : null}

      {showAuditPanel && run ? <AuditPanel runId={run.id} defaultScopePaths={ticket.fileTargets} /> : null}

      <div className="tab-row" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "plan"}
          className={activeTab === "plan" ? "tab active" : "tab"}
          onClick={() => setActiveTab("plan")}
        >
          Plan
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "runs"}
          className={activeTab === "runs" ? "tab active" : "tab"}
          onClick={() => setActiveTab("runs")}
        >
          Runs
        </button>
      </div>

      {activeTab === "plan" ? (
        <div className="panel">
          <WorkflowStepper currentPhase={workflowPhase} />

          <WorkflowSection title="Plan" badge={`${ticket.acceptanceCriteria.length} criteria`} defaultOpen>
            <h4>Acceptance Criteria</h4>
            <ul>
              {ticket.acceptanceCriteria.map((criterion) => (
                <li key={criterion.id}>{criterion.text}</li>
              ))}
            </ul>
            <h4>Implementation Plan</h4>
            <pre>{ticket.implementationPlan || "No implementation plan generated yet"}</pre>
            <h4>File Targets</h4>
            <ul>
              {ticket.fileTargets.length === 0
                ? <li style={{ color: "var(--muted)" }}>No target files identified yet</li>
                : ticket.fileTargets.map((target) => <li key={target}>{target}</li>)}
            </ul>
          </WorkflowSection>

          <ExportSection
            ticket={ticket}
            workflowPhase={workflowPhase}
            agentTarget={exportWf.agentTarget}
            setAgentTarget={exportWf.setAgentTarget}
            exportResult={exportWf.exportResult}
            downloadUrl={exportWf.downloadUrl}
            copyFeedback={exportWf.copyFeedback}
            handleExport={exportWf.handleExport}
            handleCopyBundle={exportWf.handleCopyBundle}
          />

          <CaptureVerifySection
            ticketId={ticket.id}
            workflowPhase={workflowPhase}
            captureScopeInput={capture.captureScopeInput}
            setCaptureScopeInput={capture.setCaptureScopeInput}
            widenedInput={capture.widenedInput}
            setWidenedInput={capture.setWidenedInput}
            capturePreviewData={capture.capturePreviewData}
            selectedNoGitPaths={capture.selectedNoGitPaths}
            setSelectedNoGitPaths={capture.setSelectedNoGitPaths}
            captureSummary={capture.captureSummary}
            setCaptureSummary={capture.setCaptureSummary}
            refreshCapturePreview={capture.refreshCapturePreview}
            verifyStreamEvents={verify.verifyStreamEvents}
            verifyState={verify.verifyState}
            setVerifyStreamEvents={verify.setVerifyStreamEvents}
            setVerifyState={verify.setVerifyState}
            setVerificationResult={verify.setVerificationResult}
            onRefresh={onRefresh}
          />

          {verify.verificationResult ? (
            <VerificationResultsSection
              ticketId={ticket.id}
              verificationResult={verify.verificationResult}
              attempts={attempts}
              fixForwardReady={exportWf.fixForwardReady}
              setFixForwardReady={exportWf.setFixForwardReady}
              handleReExportWithFindings={exportWf.handleReExportWithFindings}
              captureScopeInput={capture.captureScopeInput}
              widenedInput={capture.widenedInput}
              captureSummary={capture.captureSummary}
              setVerifyState={verify.setVerifyState}
              setVerifyStreamEvents={verify.setVerifyStreamEvents}
              setVerificationResult={verify.setVerificationResult}
              onRefresh={onRefresh}
            />
          ) : (
            <WorkflowSection title="Verification Results">
              <p style={{ color: "var(--muted)" }}>
                No results submitted yet. Export a bundle, run your agent, then capture results above.
              </p>
            </WorkflowSection>
          )}
        </div>
      ) : (
        <div className="panel">
          <h3>Run Attempts</h3>
          {attempts.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No verification attempts yet</p>
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
