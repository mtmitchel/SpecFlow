import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { getInitiativeProgressModel, type PipelineNodeKey } from "../utils/initiative-progress.js";
import { AuditPanel } from "../components/audit-panel.js";
import { Pipeline } from "../components/pipeline.js";
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

type ExecutionStageState = "active" | "complete" | "future" | "checkpoint";

const ExecutionTimelineStage = ({
  step,
  title,
  body,
  state,
  children,
}: {
  step: string;
  title: string;
  body: string;
  state: ExecutionStageState;
  children: ReactNode;
}) => (
  <section className={`execution-stage execution-stage-${state}`}>
    <div className="execution-stage-rail" aria-hidden="true">
      <span className="execution-stage-dot">{step}</span>
    </div>
    <div className="execution-stage-panel">
      <div className="execution-stage-header">
        <div>
          <h3>{title}</h3>
          <p>{body}</p>
        </div>
        <span className={`execution-stage-state execution-stage-state-${state}`}>
          {state === "complete" ? "Complete" : state === "active" ? "Up next" : state === "checkpoint" ? "Needs work" : "Waiting"}
        </span>
      </div>
      <div className="execution-stage-body">{children}</div>
    </div>
  </section>
);

const getTicketStageBody = (ticket: Ticket): string => {
  if (ticket.status === "verify") {
    return "Execution finished. Review the captured work and confirm it matches the plan.";
  }

  if (ticket.status === "done") {
    return "This ticket is complete. Review the verification result and execution history below.";
  }

  if (ticket.status === "in-progress") {
    return "The bundle is out in the world. Bring the resulting changes back here and verify them against the ticket.";
  }

  if (ticket.status === "ready") {
    return "The ticket is ready to execute once preflight is clear and the bundle is exported.";
  }

  return "Start with the preflight, export the bundle, then bring the work back here for verification.";
};

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
  const navigate = useNavigate();
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
  const progressModel = initiative
    ? getInitiativeProgressModel(
        initiative,
        {
          config: null,
          initiatives,
          tickets,
          runs,
          runAttempts,
          specs: [],
          planningReviews,
          ticketCoverageArtifacts,
        },
      )
    : null;
  const selectedPipelineKey: PipelineNodeKey | null =
    initiative && progressModel
      ? ticket.status === "verify"
        ? "verify"
        : ticket.status === "done" && progressModel.currentKey === "done"
          ? "done"
          : "execute"
      : null;
  const exportStageState: ExecutionStageState = exportWf.exportResult || run ? "complete" : "active";
  const captureStageState: ExecutionStageState = verify.verificationResult
    ? "complete"
    : exportWf.exportResult || run
      ? "active"
      : "future";
  const verdictStageState: ExecutionStageState = verify.verificationResult
    ? verify.verificationResult.overallPass
      ? "complete"
      : "checkpoint"
    : "future";

  return (
    <section className="ticket-journey">
      <header className="section-header ticket-journey-header">
        <div>
          {initiative ? (
            <div className="planning-breadcrumb">
              <Link to="/">Home</Link>
              <span>/</span>
              <Link to={`/initiative/${initiative.id}`}>{initiative.title}</Link>
              <span>/</span>
              <span>{ticket.title}</span>
            </div>
          ) : null}
          <div className="planning-shell-kicker">Execution</div>
          <h2>{ticket.title}</h2>
          <p>{ticket.description}</p>
          <div className="ticket-journey-links">
            {initiative ? <Link to={`/initiative/${initiative.id}?step=tickets`}>Back to initiative</Link> : null}
            {run ? <Link to={`/run/${run.id}`}>Open run report</Link> : null}
          </div>
        </div>
      </header>

      {initiative && progressModel ? (
        <div className="planning-pipeline-card">
          <div className="planning-pipeline-meta">
            <div>
              <span className="planning-stage-chip">Execution</span>
              <strong>{progressModel.statusLabel}</strong>
            </div>
            <span>
              {progressModel.ticketProgress.done}/{progressModel.ticketProgress.total} tickets done
            </span>
          </div>
          <Pipeline
            nodes={progressModel.nodes}
            selectedKey={selectedPipelineKey}
            onNodeClick={(key) => {
              if (key === "execute" || key === "verify") {
                if (progressModel.nextTicket) {
                  navigate(`/ticket/${progressModel.nextTicket.id}`);
                }
                return;
              }

              if (key === "done") {
                navigate(`/initiative/${initiative.id}`);
                return;
              }

              navigate(`/initiative/${initiative.id}?step=${key}`);
            }}
          />
        </div>
      ) : null}

      <div className="ticket-journey-shell">
        <div className="ticket-journey-main">
          <div className="planning-phase-hero ticket-phase-hero">
            <div className="planning-phase-hero-main">
              <div className="planning-stage-chip">Ticket execution</div>
              <h3>Run this ticket through one execution flow</h3>
              <p className="planning-phase-hero-copy">{getTicketStageBody(ticket)}</p>
              <div className="ticket-journey-links">
                {initiative ? <Link to={`/initiative/${initiative.id}?step=tickets`}>Back to initiative</Link> : null}
                {run ? <Link to={`/run/${run.id}`}>Open run report</Link> : null}
              </div>
            </div>
            <div className="planning-phase-hero-side">
              <span className="planning-phase-summary-label">Status</span>
              <p>{ticket.status}</p>
              <span className="planning-phase-summary-label">Verification</span>
              <p>
                {verify.verificationResult
                  ? verify.verificationResult.overallPass
                    ? "Passed"
                    : "Needs work"
                  : "Not run yet"}
              </p>
              {validTransitions.length > 0 ? (
                <div className="ticket-status-form">
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
            </div>
          </div>

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
                This ticket has no execution blockers. Export the bundle, capture the work, then verify the result in the stages below.
              </p>
            )}
          </div>

          <div className="execution-timeline">
            <ExecutionTimelineStage
              step="1"
              title="Export the execution bundle"
              body="Create the agent bundle first. This anchors the work to this ticket and creates the run record."
              state={exportStageState}
            >
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
                chrome="plain"
              />
            </ExecutionTimelineStage>

            <ExecutionTimelineStage
              step="2"
              title="Capture the work and verify it"
              body="Bring the resulting changes back into SpecFlow, review the scoped diff, and run verification against the ticket plan."
              state={captureStageState}
            >
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
                chrome="plain"
              />
            </ExecutionTimelineStage>

            <ExecutionTimelineStage
              step="3"
              title="Review the verdict"
              body="Use the verification result to decide whether the ticket is complete, needs a follow-up bundle, or needs risk acceptance."
              state={verdictStageState}
            >
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
                  chrome="plain"
                />
              ) : (
                <p className="ticket-empty-note">
                  No verification result yet. Export the bundle, complete the work, and run verification here.
                </p>
              )}
            </ExecutionTimelineStage>
          </div>

          <section className="ticket-history-card">
            <div className="ticket-history-header">
              <div>
                <div className="planning-focus-kicker">Run history</div>
                <h3>{run ? "This ticket has execution history" : "No run linked yet"}</h3>
                <p className="planning-focus-copy">
                  Runs stay subordinate to the ticket. Use the report when you need the detailed execution record.
                </p>
              </div>
              {run ? (
                <div className="button-row" style={{ marginBottom: 0 }}>
                  <Link to={`/run/${run.id}`}>Open run report</Link>
                  <button type="button" onClick={() => setShowAuditPanel((current) => !current)}>
                    {showAuditPanel ? "Hide drift review" : "Review drift"}
                  </button>
                </div>
              ) : null}
            </div>

            {showAuditPanel && run ? <AuditPanel runId={run.id} defaultScopePaths={ticket.fileTargets} /> : null}

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
          </section>
        </div>

        <aside className="ticket-journey-side">
          <section className="ticket-context-card">
            <div className="planning-focus-kicker">Context</div>
            <h3>Delivery context</h3>
            <div className="ticket-context-metrics">
              <div>
                <span>Criteria</span>
                <strong>{ticket.acceptanceCriteria.length}</strong>
              </div>
              <div>
                <span>Covered items</span>
                <strong>{coveredItems.length}</strong>
              </div>
              <div>
                <span>Files</span>
                <strong>{ticket.fileTargets.length}</strong>
              </div>
            </div>
          </section>

          <section className="ticket-context-card">
            <h3>Covered spec items</h3>
            {coveredItems.length === 0 ? (
              <p className="ticket-empty-note">No covered spec items are linked to this ticket yet.</p>
            ) : (
              Object.entries(groupedCoveredItems).map(([step, items]) => (
                <div key={step} className="ticket-context-group">
                  <span className="qa-label">{step}</span>
                  <ul>
                    {items.map((item) => (
                      <li key={item.id}>{item.text}</li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>

          <section className="ticket-context-card">
            <h3>Acceptance criteria</h3>
            <ul>
              {ticket.acceptanceCriteria.map((criterion) => (
                <li key={criterion.id}>{criterion.text}</li>
              ))}
            </ul>
          </section>

          <section className="ticket-context-card">
            <h3>Implementation plan</h3>
            <pre>{ticket.implementationPlan || "No implementation plan generated yet."}</pre>
            <h4>File targets</h4>
            <ul>
              {ticket.fileTargets.length === 0
                ? <li style={{ color: "var(--muted)" }}>No target files identified yet.</li>
                : ticket.fileTargets.map((target) => <li key={target}>{target}</li>)}
            </ul>
          </section>
        </aside>
      </div>
    </section>
  );
};

export { COVERAGE_GATE_MESSAGE };
