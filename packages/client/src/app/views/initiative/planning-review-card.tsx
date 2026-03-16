import type { ReactNode } from "react";
import type { PlanningReviewArtifact, PlanningReviewFinding } from "../../../types.js";
import {
  REVIEW_FINDING_SECTION_LABELS,
  REVIEW_STATUS_LABELS,
  type ReviewFindingGroups
} from "./shared.js";

const FINDING_ORDER: PlanningReviewFinding["type"][] = [
  "blocker",
  "traceability-gap",
  "warning",
  "assumption",
  "recommended-fix"
];

interface PlanningReviewCardProps {
  title: string;
  status: PlanningReviewArtifact["status"] | "stale";
  meta?: ReactNode;
  summary?: string | null;
  findings: ReviewFindingGroups;
  reviewBusy: boolean;
  primaryActionLabel: string;
  primaryActionBusyLabel: string;
  onPrimaryAction: () => void | Promise<void>;
  primaryActionDisabled?: boolean;
  showOverrideAction?: boolean;
  showOverrideForm?: boolean;
  overrideActionLabel?: string;
  cancelOverrideLabel?: string;
  onToggleOverride?: () => void;
  overrideReason?: string | null;
  overridePlaceholder?: string;
  onChangeOverrideReason?: (reason: string) => void;
  onConfirmOverride?: () => void | Promise<void>;
  overrideConfirmLabel?: string;
  overrideBusyLabel?: string;
  extraContent?: ReactNode;
  footerMessage?: string | null;
}

export const PlanningReviewCard = ({
  title,
  status,
  meta,
  summary,
  findings,
  reviewBusy,
  primaryActionLabel,
  primaryActionBusyLabel,
  onPrimaryAction,
  primaryActionDisabled = false,
  showOverrideAction = false,
  showOverrideForm = false,
  overrideActionLabel = "Override blockers",
  cancelOverrideLabel = "Cancel override",
  onToggleOverride,
  overrideReason = "",
  overridePlaceholder = "Document why you are accepting this risk.",
  onChangeOverrideReason,
  onConfirmOverride,
  overrideConfirmLabel = "Confirm override",
  overrideBusyLabel = "Overriding...",
  extraContent,
  footerMessage
}: PlanningReviewCardProps) => {
  const canSubmitOverride = typeof overrideReason === "string" && overrideReason.trim().length > 0;

  return (
    <div className="clarification-help-panel" style={{ gap: "0.8rem" }}>
      <div className="clarification-option-header">
        <span>{title}</span>
        <span className="clarification-option-badge">{REVIEW_STATUS_LABELS[status]}</span>
      </div>

      {meta ? <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{meta}</div> : null}
      {summary ? <p style={{ margin: 0 }}>{summary}</p> : null}

      <div className="button-row">
        <button type="button" onClick={() => void onPrimaryAction()} disabled={reviewBusy || primaryActionDisabled}>
          {reviewBusy ? primaryActionBusyLabel : primaryActionLabel}
        </button>
        {showOverrideAction ? (
          <button type="button" onClick={onToggleOverride} disabled={reviewBusy}>
            {showOverrideForm ? cancelOverrideLabel : overrideActionLabel}
          </button>
        ) : null}
      </div>

      {showOverrideForm && onChangeOverrideReason && onConfirmOverride ? (
        <div style={{ display: "grid", gap: "0.55rem" }}>
          <textarea
            className="multiline"
            value={overrideReason ?? ""}
            onChange={(event) => onChangeOverrideReason(event.target.value)}
            placeholder={overridePlaceholder}
            rows={3}
          />
          <div className="button-row">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void onConfirmOverride()}
              disabled={reviewBusy || !canSubmitOverride}
            >
              {reviewBusy ? overrideBusyLabel : overrideConfirmLabel}
            </button>
          </div>
        </div>
      ) : null}

      {overrideReason && !showOverrideForm ? (
        <div className="status-banner warn" style={{ marginBottom: 0 }}>
          Override reason: {overrideReason}
        </div>
      ) : null}

      {extraContent}

      {FINDING_ORDER.map((type) =>
        findings[type].length > 0 ? (
          <div key={type}>
            <span className="qa-label">{REVIEW_FINDING_SECTION_LABELS[type]}</span>
            <ul style={{ margin: "0.35rem 0 0" }}>
              {findings[type].map((finding) => (
                <li key={finding.id}>{finding.message}</li>
              ))}
            </ul>
          </div>
        ) : null
      )}

      {footerMessage ? (
        <div className="status-banner warn" style={{ marginBottom: 0 }}>
          {footerMessage}
        </div>
      ) : null}
    </div>
  );
};
