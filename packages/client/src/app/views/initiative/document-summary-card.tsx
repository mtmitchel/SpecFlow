import { useState } from "react";
import type { InitiativeArtifactStep } from "../../../types.js";
import { MarkdownView } from "../../components/markdown-view.js";
import { useToast } from "../../context/toast.js";
import { extractDocumentHeading } from "../../utils/document-heading.js";
import { INITIATIVE_WORKFLOW_LABELS } from "../../utils/initiative-workflow.js";

interface DocumentSummaryCardProps {
  step: InitiativeArtifactStep;
  content: string;
  initiativeTitle: string;
  isBusy: boolean;
  onEdit: () => void;
}

export const DocumentSummaryCard = ({
  step,
  content,
  initiativeTitle,
  isBusy,
  onEdit
}: DocumentSummaryCardProps) => {
  const { showError, showSuccess } = useToast();
  const [copying, setCopying] = useState(false);
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return (
      <div className="planning-summary-card">
        <h4>Document</h4>
        <p className="text-muted-sm" style={{ margin: 0 }}>
          The document is empty.
        </p>
      </div>
    );
  }

  const { title, body } = extractDocumentHeading(
    trimmedContent,
    step,
    INITIATIVE_WORKFLOW_LABELS[step],
    initiativeTitle
  );
  const handleCopy = async () => {
    if (!navigator.clipboard?.writeText || copying) {
      if (!navigator.clipboard?.writeText) {
        showError("Clipboard is not available");
      }
      return;
    }

    setCopying(true);
    try {
      await navigator.clipboard.writeText(trimmedContent);
      showSuccess("Brief copied to clipboard");
    } catch (error) {
      showError((error as Error).message || "Failed to copy brief");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="planning-section-card">
      <div className="planning-document-card-header">
        <h3 className="planning-document-card-title">{title}</h3>
        <div className="planning-document-card-actions">
          {step === "brief" ? (
            <button
              type="button"
              className="planning-icon-button"
              aria-label="Copy brief"
              onClick={() => void handleCopy()}
              disabled={isBusy || copying}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <rect x="5" y="3" width="8" height="10" rx="1.2" />
                <path d="M3.6 10.8h-.4A1.2 1.2 0 0 1 2 9.6V3.2A1.2 1.2 0 0 1 3.2 2h6.4a1.2 1.2 0 0 1 1.2 1.2v.4" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            className="planning-icon-button"
            aria-label="Edit text"
            onClick={onEdit}
            disabled={isBusy}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M11.8 2.2a1.2 1.2 0 0 1 1.7 1.7L6 11.4 3 12.1l.7-3 8.1-6.9Z" />
              <path d="M9.8 4.1 11.9 6.2" />
            </svg>
          </button>
        </div>
      </div>
      {body ? <MarkdownView content={body} /> : null}
    </div>
  );
};
