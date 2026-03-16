import type { AgentTarget, Ticket } from "../../../types.js";
import { WorkflowSection } from "../../components/workflow-section.js";
import type { WorkflowPhase } from "../../components/workflow-stepper.js";

const HelpTip = ({ text }: { text: string }) => (
  <span className="help-tip" data-tip={text}>?</span>
);

interface ExportSectionProps {
  ticket: Ticket;
  workflowPhase: WorkflowPhase;
  agentTarget: AgentTarget;
  setAgentTarget: (target: AgentTarget) => void;
  exportResult: { runId: string; attemptId: string; flatString: string } | null;
  downloadUrl: string | null;
  copyFeedback: boolean;
  handleExport: () => Promise<void>;
  handleCopyBundle: () => void;
  chrome?: "section" | "plain";
}

export const ExportSection = ({
  ticket,
  workflowPhase,
  agentTarget,
  setAgentTarget,
  exportResult,
  downloadUrl,
  copyFeedback,
  handleExport,
  handleCopyBundle,
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
            onClick={handleCopyBundle}
          >
            {copyFeedback ? "Copied" : "Copy bundle"}
          </button>
        ) : null}
        {downloadUrl ? (
          <a href={downloadUrl} download={`${ticket.id}-bundle-flat.md`} className="inline-action">
            Download flat bundle
          </a>
        ) : null}
        {exportResult ? (
          <a
            href={`/api/runs/${exportResult.runId}/attempts/${exportResult.attemptId}/bundle.zip`}
            className="inline-action"
          >
            Download ZIP bundle
          </a>
        ) : null}
      </div>
      {exportResult ? <pre>{exportResult.flatString}</pre> : null}
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
