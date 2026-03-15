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
  refreshCapturePreview: () => Promise<void>;
  verifyStreamEvents: string[];
  verifyState: "idle" | "running" | "reconnecting";
  setVerifyStreamEvents: (fn: (prev: string[]) => string[]) => void;
  setVerifyState: (state: "idle" | "running" | "reconnecting") => void;
  setVerificationResult: (result: VerificationResult | null) => void;
  onRefresh: () => Promise<void>;
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
  onRefresh
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

  return (
    <WorkflowSection
      title="Capture and Verify"
      defaultOpen={workflowPhase === "agent" || workflowPhase === "verify"}
    >
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
        After your agent completes work, capture the changes and run verification against acceptance criteria.
        <HelpTip text="Compares the code changes your agent made against the acceptance criteria defined in the plan." />
      </p>
      <div className="button-row">
        <button type="button" onClick={() => void refreshCapturePreview()}>
          Refresh Diff Preview
        </button>
        {capturePreviewData ? <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Source: {capturePreviewData.source}</span> : null}
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
          Capture and Verify
        </button>
      </div>

      {verifyState === "running" ? (
        <div className="verify-progress">
          <span className="verify-spinner" />
          Evaluating acceptance criteria
        </div>
      ) : null}

      {verifyStreamEvents.length > 0 ? (
        <details className="verify-stream-toggle">
          <summary>Verifier output ({verifyStreamEvents.length} tokens)</summary>
          <pre>{verifyStreamEvents.join("")}</pre>
        </details>
      ) : null}
    </WorkflowSection>
  );
};
