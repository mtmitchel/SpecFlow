import type { AgentTarget } from "../../../types.js";
import { CustomSelect } from "../../components/custom-select.js";
import { WorkflowSection } from "../../components/workflow-section.js";
import type { WorkflowPhase } from "./workflow.js";

const AGENT_OPTIONS = [
  { value: "claude-code", label: "Claude Code" },
  { value: "codex-cli", label: "Codex CLI" },
  { value: "opencode", label: "OpenCode" },
  { value: "generic", label: "Generic" },
];

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
  chrome?: "section" | "plain";
  showIntro?: boolean;
  showCreateControls?: boolean;
  collapseUtilities?: boolean;
  utilityMenuLabel?: string;
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
  chrome = "section",
  showIntro = true,
  showCreateControls = true,
  collapseUtilities = false,
  utilityMenuLabel = "Bundle details",
}: ExportSectionProps) => {
  const utilityActions = exportResult ? (
    <>
      <button
        type="button"
        className={copyFeedback ? "btn-copied" : ""}
        onClick={() => void handleCopyBundle()}
      >
        {copyFeedback ? "Copied" : "Copy bundle"}
      </button>
      <button type="button" className="inline-action" onClick={() => void handleSaveZipBundle()}>
        Save ZIP bundle
      </button>
      <button type="button" className="inline-action" onClick={() => void handleToggleBundlePreview()}>
        {bundlePreviewOpen
          ? "Hide bundle"
          : bundleTextLoading
            ? "Loading bundle..."
            : "Show bundle"}
      </button>
      <button type="button" className="inline-action" onClick={() => void handleDownloadBundle()}>
        Download Markdown bundle
      </button>
    </>
  ) : null;

  const content = (
    <>
      {showIntro ? (
        <p className="text-muted-sm" style={{ margin: "0 0 0.5rem" }}>
          Create the handoff bundle, run your coding agent outside SpecFlow, and come back when the work lands.
          <HelpTip text="Creates a bundle with the ticket plan and the codebase context your coding agent needs." />
        </p>
      ) : null}
      <div className="button-row">
        {showCreateControls ? (
          <>
            <CustomSelect
              options={AGENT_OPTIONS}
              value={agentTarget}
              onChange={(val) => setAgentTarget(val as AgentTarget)}
              aria-label="Agent target"
            />
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleExport()}
            >
              Create bundle
            </button>
          </>
        ) : null}
        {exportResult && !collapseUtilities ? utilityActions : null}
      </div>
      {exportResult && collapseUtilities ? (
        <details className="ticket-secondary-disclosure">
          <summary>{utilityMenuLabel}</summary>
          <div className="ticket-secondary-content">
            <div className="button-row">{utilityActions}</div>
            {bundlePreviewOpen && bundlePreview ? <pre>{bundlePreview}</pre> : null}
          </div>
        </details>
      ) : null}
      {exportResult && !collapseUtilities && bundlePreviewOpen && bundlePreview ? <pre>{bundlePreview}</pre> : null}
    </>
  );

  if (chrome === "plain") {
    return content;
  }

  return (
    <WorkflowSection
      title="Handoff"
      badge={exportResult ? "ready" : undefined}
      defaultOpen={workflowPhase === "export"}
    >
      {content}
    </WorkflowSection>
  );
};
