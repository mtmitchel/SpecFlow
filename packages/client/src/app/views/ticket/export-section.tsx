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
  handleCopyBundle
}: ExportSectionProps) => (
  <WorkflowSection
    title="Export Bundle"
    badge={exportResult ? "exported" : undefined}
    defaultOpen={workflowPhase === "export"}
  >
    <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
      Export this as a prompt for your coding agent. Run the agent yourself, then return here to verify.
      <HelpTip text="Generates a prompt file containing your ticket's requirements and codebase context. Hand this to your AI coding agent." />
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
        Export Bundle
      </button>
      {exportResult ? (
        <button
          type="button"
          className={copyFeedback ? "btn-copied" : ""}
          onClick={handleCopyBundle}
        >
          {copyFeedback ? "Copied" : "Copy"}
        </button>
      ) : null}
      {downloadUrl ? (
        <a href={downloadUrl} download={`${ticket.id}-bundle-flat.md`} className="inline-action">
          Download Flat Bundle
        </a>
      ) : null}
      {exportResult ? (
        <a
          href={`/api/runs/${exportResult.runId}/attempts/${exportResult.attemptId}/bundle.zip`}
          className="inline-action"
        >
          Download Bundle Zip
        </a>
      ) : null}
    </div>
    {exportResult ? <pre>{exportResult.flatString}</pre> : null}
  </WorkflowSection>
);
