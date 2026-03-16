import type { VerificationResult } from "../../../types.js";
import { WorkflowSection } from "../../components/workflow-section.js";
import type { WorkflowPhase } from "../../components/workflow-stepper.js";
import { parseScopeCsv } from "../../utils/scope-paths.js";
import { captureResults } from "../../../api.js";
import { useToast } from "../../context/toast.js";

const HelpTip = ({ text }: { text: string }) => (
  <span className="help-tip" data-tip={text}>?</span>
);

interface CaptureVerifySectionProps {
  ticketId: string;
  workflowPhase: WorkflowPhase;
  captureScopeInput: string;
  setCaptureScopeInput: (value: string) => void;
  widenedInput: string;
  setWidenedInput: (value: string) => void;
  capturePreviewData: {
    source: "git" | "snapshot";
    defaultScope: string[];
    changedPaths: string[];
    primaryDiff: string;
    driftDiff: string | null;
  } | null;
  selectedNoGitPaths: string[];
  setSelectedNoGitPaths: (paths: string[]) => void;
  captureSummary: string;
  setCaptureSummary: (value: string) => void;
  refreshCapturePreview: () => void;
  verifyStreamEvents: string[];
  verifyState: "idle" | "running" | "reconnecting";
  setVerifyStreamEvents: (fn: (prev: string[]) => string[]) => void;
  setVerifyState: (state: "idle" | "running" | "reconnecting") => void;
  setVerificationResult: (result: VerificationResult | null) => void;
  onRefresh: () => Promise<void>;
  chrome?: "section" | "plain";
}

export const CaptureVerifySection = ({
  ticketId,
  workflowPhase,
  captureScopeInput,
  setCaptureScopeInput,
  widenedInput,
  setWidenedInput,
  capturePreviewData,
  selectedNoGitPaths,
  setSelectedNoGitPaths,
  captureSummary,
  setCaptureSummary,
  refreshCapturePreview,
  verifyStreamEvents,
  verifyState,
  setVerifyStreamEvents,
  setVerifyState,
  setVerificationResult,
  onRefresh,
  chrome = "section"
}: CaptureVerifySectionProps) => {
  const { showError } = useToast();

  const handleCaptureAndVerify = async () => {
    setVerifyState("running");
    setVerifyStreamEvents(() => []);
    try {
      const widenedScopePaths = parseScopeCsv(widenedInput);
      const scopePaths =
        capturePreviewData?.source === "snapshot" && selectedNoGitPaths.length > 0
          ? selectedNoGitPaths
          : parseScopeCsv(captureScopeInput);

      const result = await captureResults(ticketId, captureSummary, scopePaths, widenedScopePaths);
      setVerificationResult(result);
      await onRefresh();
    } catch (err) {
      showError((err as Error).message ?? "Verification failed");
    } finally {
      setVerifyState("idle");
    }
  };

  const content = (
    <>
      <p className="text-muted-sm" style={{ margin: "0 0 0.5rem" }}>
        After execution finishes, review the captured changes and check them against the plan.
        <HelpTip text="Compares the captured changes against the acceptance criteria defined in the ticket plan." />
      </p>
      <div className="button-row">
        <button type="button" onClick={() => void refreshCapturePreview()}>
          Refresh change preview
        </button>
        {capturePreviewData ? <span className="text-muted-sm">Source: {capturePreviewData.source}</span> : null}
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
          <h4>Change preview</h4>
          <pre>{capturePreviewData.primaryDiff || "(no changes in selected scope)"}</pre>
        </>
      ) : null}
      {capturePreviewData?.source === "snapshot" ? (
        <div className="panel">
          <h4>Scope picker</h4>
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
        placeholder="Optional notes about what changed"
      />
      <input
        className="phase-name-input"
        value={widenedInput}
        onChange={(event) => setWidenedInput(event.target.value)}
        placeholder="widened/scope/path.ts, another/path.ts"
      />
      <div className="status-banner warn" style={{ fontSize: "0.85rem" }}>
        Files in widened scope are checked for unintended changes but are not evaluated against acceptance criteria.
        Use this for files your agent may have touched outside the primary scope.
      </div>
      <div className="button-row">
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleCaptureAndVerify()}
        >
          Verify work
        </button>
      </div>

      {verifyState === "running" ? (
        <div className="verify-progress">
          <span className="verify-spinner" />
          Checking acceptance criteria
        </div>
      ) : null}

      {verifyStreamEvents.length > 0 ? (
        <details className="verify-stream-toggle">
          <summary>Verification log ({verifyStreamEvents.length} tokens)</summary>
          <pre>{verifyStreamEvents.join("")}</pre>
        </details>
      ) : null}
    </>
  );

  if (chrome === "plain") {
    return content;
  }

  return (
    <WorkflowSection
      title="Review changes and verify"
      defaultOpen={workflowPhase === "agent" || workflowPhase === "verify"}
    >
      {content}
    </WorkflowSection>
  );
};
