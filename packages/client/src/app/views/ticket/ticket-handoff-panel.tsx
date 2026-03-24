import type { AgentTarget } from "../../../types.js";
import { ExportSection } from "./export-section.js";
import {
  TicketFocusCard,
  type ExecutionStageState,
  type TicketPreflightIssue,
  type TicketStageSummaryItem,
} from "./ticket-detail-sections.js";
import type { WorkflowPhase } from "./workflow.js";

const formatAgentTarget = (value: AgentTarget | string | undefined): string => {
  if (value === "claude-code") {
    return "Claude Code";
  }

  if (value === "codex-cli") {
    return "Codex CLI";
  }

  if (value === "opencode") {
    return "OpenCode";
  }

  return "Generic";
};

interface TicketHandoffPanelProps {
  workflowPhase: WorkflowPhase;
  stageState: ExecutionStageState;
  noticeIssues: TicketPreflightIssue[];
  summaryItems: TicketStageSummaryItem[];
  exportWorkflow: {
    agentTarget?: AgentTarget;
    setAgentTarget?: (target: AgentTarget) => void;
    exportResult?: { runId: string; attemptId: string } | null;
    activeExportResult?: { runId: string; attemptId: string } | null;
    bundlePreview?: string | null;
    bundlePreviewOpen?: boolean;
    bundleTextLoading?: boolean;
    copyFeedback?: boolean;
    handleExport?: () => Promise<void>;
    handleCopyBundle?: () => Promise<void>;
    handleToggleBundlePreview?: () => Promise<void>;
    handleDownloadBundle?: () => Promise<void>;
    handleSaveZipBundle?: () => Promise<void>;
  };
  refreshCapturePreview: () => void;
}

export const TicketHandoffPanel = ({
  workflowPhase,
  stageState,
  noticeIssues,
  summaryItems,
  exportWorkflow,
  refreshCapturePreview,
}: TicketHandoffPanelProps) => {
  const hasActiveExport = Boolean(exportWorkflow.activeExportResult);

  return (
    <TicketFocusCard
      title="Handoff"
      body={
        hasActiveExport
          ? "Bundle ready. Run the agent outside SpecFlow and check back here when the work lands."
          : "Choose an agent, create the bundle, and run the work outside SpecFlow."
      }
      state={stageState}
      variant="handoff"
      issues={noticeIssues}
      summaryItems={[
        {
          label: "Agent",
          value: formatAgentTarget(exportWorkflow.agentTarget),
        },
        ...summaryItems,
      ]}
      actions={
        hasActiveExport ? (
          <button type="button" className="inline-action" onClick={() => void refreshCapturePreview()}>
            Check for return
          </button>
        ) : null
      }
    >
      {hasActiveExport ? (
        <ExportSection
          workflowPhase={workflowPhase}
          agentTarget={exportWorkflow.agentTarget ?? "generic"}
          setAgentTarget={exportWorkflow.setAgentTarget ?? (() => undefined)}
          exportResult={exportWorkflow.activeExportResult ?? null}
          bundlePreview={exportWorkflow.bundlePreview ?? null}
          bundlePreviewOpen={exportWorkflow.bundlePreviewOpen ?? false}
          bundleTextLoading={exportWorkflow.bundleTextLoading ?? false}
          copyFeedback={exportWorkflow.copyFeedback ?? false}
          handleExport={exportWorkflow.handleExport ?? (async () => undefined)}
          handleCopyBundle={exportWorkflow.handleCopyBundle ?? (async () => undefined)}
          handleToggleBundlePreview={exportWorkflow.handleToggleBundlePreview ?? (async () => undefined)}
          handleDownloadBundle={exportWorkflow.handleDownloadBundle ?? (async () => undefined)}
          handleSaveZipBundle={exportWorkflow.handleSaveZipBundle ?? (async () => undefined)}
          chrome="plain"
          showIntro={false}
          showCreateControls={false}
          collapseUtilities
          utilityMenuLabel="Bundle tools"
        />
      ) : (
        <ExportSection
          workflowPhase={workflowPhase}
          agentTarget={exportWorkflow.agentTarget ?? "generic"}
          setAgentTarget={exportWorkflow.setAgentTarget ?? (() => undefined)}
          exportResult={exportWorkflow.exportResult ?? null}
          bundlePreview={exportWorkflow.bundlePreview ?? null}
          bundlePreviewOpen={exportWorkflow.bundlePreviewOpen ?? false}
          bundleTextLoading={exportWorkflow.bundleTextLoading ?? false}
          copyFeedback={exportWorkflow.copyFeedback ?? false}
          handleExport={exportWorkflow.handleExport ?? (async () => undefined)}
          handleCopyBundle={exportWorkflow.handleCopyBundle ?? (async () => undefined)}
          handleToggleBundlePreview={exportWorkflow.handleToggleBundlePreview ?? (async () => undefined)}
          handleDownloadBundle={exportWorkflow.handleDownloadBundle ?? (async () => undefined)}
          handleSaveZipBundle={exportWorkflow.handleSaveZipBundle ?? (async () => undefined)}
          chrome="plain"
          showIntro={false}
        />
      )}
    </TicketFocusCard>
  );
};
