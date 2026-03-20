import type { AgentTarget } from "../../../types.js";
import { WorkflowSection } from "../../components/workflow-section.js";
import type { WorkflowPhase } from "./workflow.js";

const HelpTip = ({ text }: { text: string }) => (
  <span className="help-tip" data-tip={text}>?</span>
);

interface ExportSectionProps {
  workflowPhase: WorkflowPhase;
  agentTarget: AgentTarget;
  setAgentTarget: (target: AgentTarget) => void;
  exportResult: { runId: string; attemptId: string } | null;
  bundlePreview: string | null;
  bundlePreviewOpen: boolean;
  bundleTextLoading: boolean;
  copyFeedback: boolean;
  handleExport: () => Promise<void>;
  handleCopyBundle: () => Promise<void>;
  handleToggleBundlePreview: () => Promise<void>;
  handleDownloadBundle: () => Promise<void>;
  handleSaveZipBundle: () => Promise<void>;
  desktopRuntime: boolean;
  chrome?: "section" | "plain";
  showIntro?: boolean;
  showCreateControls?: boolean;
}

export const ExportSection = ({
  workflowPhase,
  agentTarget,
  setAgentTarget,
  exportResult,
  bundlePreview,
  bundlePreviewOpen,
  bundleTextLoading,
  copyFeedback,
  handleExport,
  handleCopyBundle,
  handleToggleBundlePreview,
  handleDownloadBundle,
  handleSaveZipBundle,
  desktopRuntime,
  chrome = "section",
  showIntro = true,
  showCreateControls = true,
}: ExportSectionProps) => {
  const content = (
    <>
      {showIntro ? (
        <p className="text-muted-sm" style={{ margin: "0 0 0.5rem" }}>
          Create the handoff bundle, run your coding agent, then come back here to verify the result.
          <HelpTip text="Creates a bundle with the ticket plan and the codebase context your coding agent needs." />
        </p>
      ) : null}
      <div className="button-row">
        {showCreateControls ? (
          <>
            <select value={agentTarget} onChange={(event) => setAgentTarget(event.target.value as AgentTarget)}>
              <option value="claude-code">Claude Code</option>
              <option value="codex-cli">Codex CLI</option>
              <option value="opencode">OpenCode</option>
              <option value="generic">Generic</option>
            </select>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleExport()}
            >
              Create bundle
            </button>
          </>
        ) : null}
        {exportResult ? (
          <button
            type="button"
            className={copyFeedback ? "btn-copied" : ""}
            onClick={() => void handleCopyBundle()}
          >
            {copyFeedback ? "Copied" : "Copy bundle"}
          </button>
        ) : null}
        {exportResult ? (
          <button type="button" className="inline-action" onClick={() => void handleToggleBundlePreview()}>
            {bundlePreviewOpen ? "Hide bundle" : bundleTextLoading ? "Loading bundle..." : "Show bundle"}
          </button>
        ) : null}
        {exportResult ? (
          <button type="button" className="inline-action" onClick={() => void handleDownloadBundle()}>
            Download Markdown bundle
          </button>
        ) : null}
        {exportResult ? (
          desktopRuntime ? (
            <button type="button" className="inline-action" onClick={() => void handleSaveZipBundle()}>
              Save ZIP bundle
            </button>
          ) : (
            <a
              href={`/api/runs/${exportResult.runId}/attempts/${exportResult.attemptId}/bundle.zip`}
              className="inline-action"
            >
              Download ZIP bundle
            </a>
          )
        ) : null}
      </div>
      {bundlePreviewOpen && bundlePreview ? <pre>{bundlePreview}</pre> : null}
    </>
  );

  if (chrome === "plain") {
    return content;
  }

  return (
    <WorkflowSection
      title="Start work"
      badge={exportResult ? "ready" : undefined}
      defaultOpen={workflowPhase === "export"}
    >
      {content}
    </WorkflowSection>
  );
};
