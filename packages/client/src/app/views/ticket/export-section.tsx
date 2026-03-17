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
  chrome = "section"
}: ExportSectionProps) => {
  const content = (
    <>
      <p className="text-muted-sm" style={{ margin: "0 0 0.5rem" }}>
        Create a bundle for your coding agent. Run the agent, then return here to review and verify the work.
        <HelpTip text="Creates a prompt bundle with the ticket plan and codebase context for your coding agent." />
      </p>
      <div className="button-row">
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
            {bundlePreviewOpen ? "Hide bundle" : bundleTextLoading ? "Loading bundle..." : "Preview bundle"}
          </button>
        ) : null}
        {exportResult ? (
          <button type="button" className="inline-action" onClick={() => void handleDownloadBundle()}>
            Download flat bundle
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
      title="Start execution"
      badge={exportResult ? "ready" : undefined}
      defaultOpen={workflowPhase === "export"}
    >
      {content}
    </WorkflowSection>
  );
};
