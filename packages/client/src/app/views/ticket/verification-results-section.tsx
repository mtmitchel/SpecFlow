import type { RunAttempt, VerificationResult } from "../../../types.js";
import { captureResults } from "../../../api.js";
import { WorkflowSection } from "../../components/workflow-section.js";
import { parseScopeCsv } from "../../utils/scope-paths.js";
import { useToast } from "../../context/toast.js";
import { OverridePanel } from "./override-panel.js";

const HelpTip = ({ text }: { text: string }) => (
  <span className="help-tip" data-tip={text}>?</span>
);

interface VerificationResultsSectionProps {
  ticketId: string;
  verificationResult: VerificationResult;
  attempts: RunAttempt[];
  fixForwardReady: boolean;
  setFixForwardReady: (ready: boolean) => void;
  handleReExportWithFindings: (criteriaResults: VerificationResult["criteriaResults"]) => Promise<void>;
  captureScopeInput: string;
  widenedInput: string;
  captureSummary: string;
  setVerifyState: (state: "idle" | "running" | "reconnecting") => void;
  setVerifyStreamEvents: (fn: (prev: string[]) => string[]) => void;
  setVerificationResult: (result: VerificationResult | null) => void;
  onRefresh: () => Promise<void>;
  chrome?: "section" | "plain";
}

export const VerificationResultsSection = ({
  ticketId,
  verificationResult,
  attempts,
  fixForwardReady,
  setFixForwardReady,
  handleReExportWithFindings,
  captureScopeInput,
  widenedInput,
  captureSummary,
  setVerifyState,
  setVerifyStreamEvents,
  setVerificationResult,
  onRefresh,
  chrome = "section"
}: VerificationResultsSectionProps) => {
  const { showError } = useToast();

  const primaryDrift = verificationResult.driftFlags.filter((flag) => flag.type !== "widened-scope-drift");
  const widenedDrift = verificationResult.driftFlags.filter((flag) => flag.type === "widened-scope-drift");

  const handleReVerify = async () => {
    setVerifyState("running");
    setVerifyStreamEvents(() => []);
    setFixForwardReady(false);
    try {
      const scopePaths = parseScopeCsv(captureScopeInput);
      const widenedScopePaths = parseScopeCsv(widenedInput);
      const result = await captureResults(ticketId, captureSummary, scopePaths, widenedScopePaths);
      setVerificationResult(result);
      await onRefresh();
    } catch (err) {
      showError((err as Error).message ?? "We couldn't verify the ticket again.");
    } finally {
      setVerifyState("idle");
    }
  };

  const content = (
    <>
      <p>
        Result: {verificationResult.overallPass ? "Passed" : "Needs work"}
        {attempts.length > 0 ? ` · Attempt ${attempts.length}` : ""}
      </p>
      <ul>
        {verificationResult.criteriaResults.map((criterion) => (
          <li key={criterion.criterionId}>
            <span className={`severity-badge severity-${criterion.severity ?? "minor"}`}>
              {criterion.severity ?? ""}
            </span>
            {" "}{criterion.criterionId} · {criterion.pass ? "passed" : "needs work"} · {criterion.evidence}
            {!criterion.pass && criterion.remediationHint ? (
              <div className="remediation-hint">{criterion.remediationHint}</div>
            ) : null}
          </li>
        ))}
      </ul>

      <h4>Unexpected changes in scope</h4>
      <ul>
        {primaryDrift.length === 0
          ? <li style={{ color: "var(--muted)" }}>None</li>
          : primaryDrift.map((flag) => (
            <li key={`${flag.type}-${flag.file}`}>
              {flag.severity ? (
                <span className={`severity-badge severity-${flag.severity}`}>{flag.severity}</span>
              ) : null}
              {" "}{flag.type} · {flag.file} · {flag.description}
            </li>
          ))}
      </ul>

      <h4>
        Unexpected changes outside the main scope
        <HelpTip text="Files outside the main scope are checked for unexpected changes, but they are not scored against the acceptance criteria." />
      </h4>
      <ul>
        {widenedDrift.length === 0
          ? <li style={{ color: "var(--muted)" }}>None</li>
          : widenedDrift.map((flag) => <li key={`${flag.type}-${flag.file}`}>{flag.file} · {flag.description}</li>)}
      </ul>

      {!verificationResult.overallPass ? (
        <div>
          <h4>Fix the issues and verify again</h4>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
            Create a fix bundle with the failed criteria, then verify the ticket again after the fixes land.
          </p>
          <div className="button-row">
            <button
              type="button"
              onClick={() => void handleReExportWithFindings(verificationResult.criteriaResults)}
            >
              Create fix bundle
            </button>
            <button
              type="button"
              className={fixForwardReady ? "btn-primary" : ""}
              disabled={!fixForwardReady}
              onClick={() => void handleReVerify()}
            >
              Verify again
            </button>
          </div>
          {!fixForwardReady && (
            <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginTop: "0.3rem" }}>
              Verify again after the fix bundle is ready.
            </p>
          )}
        </div>
      ) : null}

      <OverridePanel ticketId={ticketId} onRefresh={onRefresh} />
    </>
  );

  if (chrome === "plain") {
    return content;
  }

  return (
    <WorkflowSection
      title="Verification"
      badge={verificationResult.overallPass ? "pass" : "fail"}
      defaultOpen
    >
      {content}
    </WorkflowSection>
  );
};
