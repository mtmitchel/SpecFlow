import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchOperationStatus } from "../../api.js";
import type {
  Initiative,
  PlanningReviewArtifact,
  Run,
  RunAttempt,
  Ticket,
  TicketCoverageArtifact,
  TicketStatus
} from "../../types.js";
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

const COVERAGE_GATE_MESSAGE = "Resolve the coverage check before starting execution for this ticket.";

interface TicketPreflightIssue {
  tone: "warn";
  title: string;
  body: string;
  action: ReactNode | null;
}

export const TicketView = ({
  tickets,
  runs,
  runAttempts,
  initiatives,
  planningReviews,
  ticketCoverageArtifacts,
  onRefresh,
  onMoveTicket
}: {
  tickets: Ticket[];
  runs: Run[];
  runAttempts: RunAttempt[];
  initiatives: Initiative[];
  planningReviews: PlanningReviewArtifact[];
  ticketCoverageArtifacts: TicketCoverageArtifact[];
  onRefresh: () => Promise<void>;
  onMoveTicket: (ticketId: string, status: TicketStatus) => Promise<void>;
}) => {
  const params = useParams<{ id: string }>();
  const { showError } = useToast();
  const [operationState, setOperationState] = useState<string | null>(null);
  const [showAuditPanel, setShowAuditPanel] = useState(false);
  const [moveToStatus, setMoveToStatus] = useState<TicketStatus | "">("");

  const ticket = tickets.find((item) => item.id === params.id);
  const run = runs.find((item) => item.id === ticket?.runId);
  const attempts = runAttempts.filter((attempt) => run?.attempts.includes(attempt.attemptId));

  const prevTicketId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (params.id !== prevTicketId.current) {
      prevTicketId.current = params.id;
      setMoveToStatus("");
      setShowAuditPanel(false);
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
  const initiative = ticket.initiativeId ? initiatives.find((item) => item.id === ticket.initiativeId) ?? null : null;
  const coverageReview =
    ticket.initiativeId
      ? planningReviews.find((item) => item.id === `${ticket.initiativeId}:ticket-coverage-review`) ?? null
      : null;
  const coverageArtifact =
    ticket.initiativeId
      ? ticketCoverageArtifacts.find((item) => item.initiativeId === ticket.initiativeId) ?? null
      : null;
  const coveredItems = coverageArtifact
    ? coverageArtifact.items.filter((item) => ticket.coverageItemIds.includes(item.id))
    : [];
  const groupedCoveredItems = coveredItems.reduce<Record<string, typeof coveredItems>>((acc, item) => {
    const key = item.sourceStep;
    acc[key] = [...(acc[key] ?? []), item];
    return acc;
  }, {});
  const coverageBlocked = Boolean(
    ticket.initiativeId && (!coverageReview || (coverageReview.status !== "passed" && coverageReview.status !== "overridden"))
  );
  const validTransitions = statusColumns.filter((col) => canTransition(ticket.status, col.key));

  const workflowPhase: "export" | "agent" | "verify" | "done" =
    ticket.status === "done"
      ? "done"
      : verify.verificationResult
        ? "verify"
        : exportWf.exportResult || run
          ? "agent"
          : "export";

  const preflightIssues = [
    coverageBlocked && initiative
      ? {
          tone: "warn" as const,
          title: "Coverage gate",
          body: COVERAGE_GATE_MESSAGE,
          action: <Link to={`/initiative/${initiative.id}?step=tickets`}>Open the initiative tickets step</Link>
        }
      : null,
    hasUnfinishedBlockers
      ? {
          tone: "warn" as const,
          title: "Blocked by other tickets",
          body: blockerTickets.map((blocker) => `${blocker.title} (${blocker.status})`).join(", "),
          action: null
        }
      : null,
    phaseWarning.hasWarning
      ? {
          tone: "warn" as const,
          title: "Phase warning",
          body: phaseWarning.message,
          action: null
        }
      : null,
    operationState === "abandoned" || operationState === "superseded" || operationState === "failed"
      ? {
          tone: "warn" as const,
          title: "Previous run ended early",
          body: `The last execution ended ${operationState}. Export a fresh bundle before you continue.`,
          action: null
        }
      : null,
    verify.verifyState === "reconnecting"
      ? {
          tone: "warn" as const,
          title: "Verification reconnecting",
          body: "The verification stream is reconnecting. Results will refresh automatically.",
          action: null
        }
      : null
  ] as Array<TicketPreflightIssue | null>;
  const visiblePreflightIssues = preflightIssues.filter((issue): issue is TicketPreflightIssue => issue !== null);

  return (
    <section className="ticket-journey">
      <header className="section-header ticket-journey-header">
        <div>
          <div className="planning-shell-kicker">Execution</div>
          <h2>{ticket.title}</h2>
          <p>{ticket.description}</p>
          <div className="ticket-journey-links">
            {initiative ? <Link to={`/initiative/${initiative.id}?step=tickets`}>Back to initiative</Link> : null}
            {run ? <Link to={`/run/${run.id}`}>Open run report</Link> : null}
          </div>
        </div>
        {validTransitions.length > 0 ? (
          <div className="button-row" style={{ marginBottom: 0 }}>
            <select value={moveToStatus} onChange={(e) => setMoveToStatus(e.target.value as TicketStatus)}>
              <option value="" disabled>
                Change status
              </option>
              {validTransitions.map((col) => (
                <option key={col.key} value={col.key}>
                  {col.label}
                </option>
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
              Update status
            </button>
          </div>
        ) : null}
      </header>

      <div className="ticket-preflight-card">
        <div className="ticket-preflight-top">
          <div>
            <div className="planning-stage-chip">Preflight</div>
            <h3>Check blockers before you run</h3>
          </div>
          <div className="ticket-preflight-next">
            {visiblePreflightIssues.length > 0 ? "Next action required" : "Ready to execute"}
          </div>
        </div>

        {visiblePreflightIssues.length > 0 ? (
          <div className="ticket-preflight-list">
            {visiblePreflightIssues.map((issue) => (
              <div key={issue.title} className={`ticket-preflight-item ticket-preflight-item-${issue.tone}`}>
                <strong>{issue.title}</strong>
                <span>{issue.body}</span>
                {issue.action}
              </div>
            ))}
          </div>
        ) : (
          <p className="ticket-preflight-ready">
            This ticket has no execution blockers. Export the bundle, capture the work, then verify the result in the sections below.
          </p>
        )}
      </div>

      <div className="panel">
        <WorkflowStepper currentPhase={workflowPhase} />

        <WorkflowSection title="Context" badge={`${ticket.acceptanceCriteria.length} criteria`} defaultOpen>
          {ticket.initiativeId ? (
            <>
              <h4>Covered spec items</h4>
              {coveredItems.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>
                  No covered spec items are linked to this ticket yet.
                </p>
              ) : (
                Object.entries(groupedCoveredItems).map(([step, items]) => (
                  <div key={step}>
                    <span className="qa-label">{step}</span>
                    <ul>
                      {items.map((item) => (
                        <li key={item.id}>{item.text}</li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </>
          ) : null}

          <h4>Acceptance criteria</h4>
          <ul>
            {ticket.acceptanceCriteria.map((criterion) => (
              <li key={criterion.id}>{criterion.text}</li>
            ))}
          </ul>

          <h4>Implementation plan</h4>
          <pre>{ticket.implementationPlan || "No implementation plan generated yet."}</pre>

          <h4>File targets</h4>
          <ul>
            {ticket.fileTargets.length === 0
              ? <li style={{ color: "var(--muted)" }}>No target files identified yet.</li>
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
          <WorkflowSection title="Verification">
            <p style={{ color: "var(--muted)" }}>
              No verification result yet. Export the bundle, complete the work, and run verification here.
            </p>
          </WorkflowSection>
        )}

        <WorkflowSection title="Run history" badge={run ? "Linked run" : "No run yet"} defaultOpen>
          {run ? (
            <div className="ticket-run-summary">
              <div className="button-row">
                <Link to={`/run/${run.id}`}>Open run report</Link>
                <button type="button" onClick={() => setShowAuditPanel((current) => !current)}>
                  {showAuditPanel ? "Hide drift review" : "Review drift"}
                </button>
              </div>
              {showAuditPanel ? <AuditPanel runId={run.id} defaultScopePaths={ticket.fileTargets} /> : null}
            </div>
          ) : (
            <p style={{ color: "var(--muted)" }}>No run has been linked to this ticket yet.</p>
          )}

          <ul className="planning-ticket-list">
            {attempts.length === 0 ? (
              <li>
                <span>No verification attempts yet.</span>
              </li>
            ) : (
              attempts.map((attempt) => (
                <li key={attempt.id}>
                  <span>
                    {attempt.attemptId} · {attempt.overallPass ? "pass" : "fail"}
                    {attempt.overrideReason ? ` · override: ${attempt.overrideReason}` : ""}
                  </span>
                  <span>{new Date(attempt.createdAt).toLocaleString()}</span>
                </li>
              ))
            )}
          </ul>
        </WorkflowSection>
      </div>
    </section>
  );
};

export { COVERAGE_GATE_MESSAGE };
