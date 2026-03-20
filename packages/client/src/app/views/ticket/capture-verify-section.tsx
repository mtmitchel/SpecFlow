import type { VerificationResult } from "../../../types.js";
import { WorkflowSection } from "../../components/workflow-section.js";
import type { WorkflowPhase } from "./workflow.js";
import { parseScopeCsv } from "../../utils/scope-paths.js";
import { captureResults } from "../../../api.js";
import { useToast } from "../../context/toast.js";
import type { TransportEvent } from "../../../api/transport.js";

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
  showIntro?: boolean;
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
  chrome = "section",
  showIntro = true,
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

      const result = await captureResults(
        ticketId,
        captureSummary,
        scopePaths,
        widenedScopePaths,
        (event: TransportEvent) => {
          if (event.event === "verify-token") {
            const chunk = (event.payload as { chunk?: string }).chunk;
            if (chunk) {
              setVerifyStreamEvents((current) => [...current, chunk].slice(-200));
            }
          }
        }
      );
      setVerificationResult(result);
      await onRefresh();
    } catch (err) {
      showError((err as Error).message ?? "We couldn't verify the work.");
    } finally {
      setVerifyState("idle");
    }
  };

  const content = (
    <>
      {showIntro ? (
        <p className="text-muted-sm" style={{ margin: "0 0 0.5rem" }}>
          Refresh the captured changes and verify them against what this ticket needs to deliver.
          <HelpTip text="Compares the captured changes against the acceptance criteria in the ticket plan." />
        </p>
      ) : null}
      <div className="button-row">
        <button type="button" onClick={() => void refreshCapturePreview()}>
          Refresh changes
        </button>
        {capturePreviewData ? <span className="text-muted-sm">Change source: {capturePreviewData.source}</span> : null}
      </div>
      {capturePreviewData ? (
        <>
          <h4>Main files to check</h4>
          <input
            className="phase-name-input"
            value={captureScopeInput}
            onChange={(event) => setCaptureScopeInput(event.target.value)}
            placeholder="src/app/ticket-view.tsx, src/app/utils/ui-language.ts"
          />
          <h4>Captured changes</h4>
          <pre>{capturePreviewData.primaryDiff || "(no changes in selected scope)"}</pre>
        </>
      ) : null}
      {capturePreviewData?.source === "snapshot" ? (
        <div className="panel">
          <h4>Pick files to review</h4>
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
              ? <li>No files selected.</li>
              : selectedNoGitPaths.map((entry) => <li key={entry}>{entry}</li>)}
          </ul>
        </div>
      ) : null}
      <textarea
        className="multiline"
        value={captureSummary}
        onChange={(event) => setCaptureSummary(event.target.value)}
        placeholder="Example: Added the execution gate and updated the related tests."
      />
      <h4>Also check these files</h4>
      <input
        className="phase-name-input"
        value={widenedInput}
        onChange={(event) => setWidenedInput(event.target.value)}
        placeholder="src/app/detail-workspace.tsx, src/app/views/run-view.tsx"
      />
      <div className="status-banner warn" style={{ fontSize: "0.85rem" }}>
        These files are reviewed for extra changes, but they do not count toward the ticket's must-haves.
        Use this when the agent also touched related work.
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
          Checking the work against the plan...
        </div>
      ) : null}

      {verifyStreamEvents.length > 0 ? (
        <details className="verify-stream-toggle">
          <summary>Verification log</summary>
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
      title="Verify work"
      defaultOpen={workflowPhase === "agent" || workflowPhase === "verify"}
    >
      {content}
    </WorkflowSection>
  );
};
