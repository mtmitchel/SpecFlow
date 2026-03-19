import type { ReactNode } from "react";
import type {
  PlanningReviewArtifact,
  PlanningReviewFinding,
} from "../../../types.js";
import {
  REVIEW_FINDING_SECTION_LABELS,
  REVIEW_STATUS_LABELS,
  type ReviewFindingGroups,
} from "./shared.js";

const FINDING_ORDER: PlanningReviewFinding["type"][] = [
  "blocker",
  "traceability-gap",
  "warning",
  "assumption",
  "recommended-fix",
];

interface PlanningReviewCardProps {
  title: string;
  status: PlanningReviewArtifact["status"] | "stale";
  meta?: ReactNode;
  summary?: string | null;
  findings: ReviewFindingGroups;
  reviewBusy: boolean;
  primaryActionLabel?: string;
  primaryActionBusyLabel?: string;
  onPrimaryAction?: () => void | Promise<void>;
  primaryActionDisabled?: boolean;
  detailsOpen?: boolean;
  showDetailsToggle?: boolean;
  detailsOpenLabel?: string;
  detailsCloseLabel?: string;
  onToggleDetails?: () => void;
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
  detailsOpen = false,
  showDetailsToggle = true,
  detailsOpenLabel = "See issues",
  detailsCloseLabel = "Hide issues",
  onToggleDetails,
  showOverrideAction = false,
  showOverrideForm = false,
  overrideActionLabel = "Accept risk",
  cancelOverrideLabel = "Keep blocking",
  onToggleOverride,
  overrideReason = "",
  overridePlaceholder = "Add a short reason for accepting the remaining risk.",
  onChangeOverrideReason,
  onConfirmOverride,
  overrideConfirmLabel = "Accept risk",
  overrideBusyLabel = "Saving...",
  extraContent,
  footerMessage,
}: PlanningReviewCardProps) => {
  const canSubmitOverride =
    typeof overrideReason === "string" && overrideReason.trim().length > 0;
  const hasFindings = FINDING_ORDER.some((type) => findings[type].length > 0);
  const hasDetails =
    hasFindings ||
    Boolean(extraContent) ||
    Boolean(footerMessage) ||
    Boolean(overrideReason) ||
    showOverrideAction;
  const showDetails = detailsOpen || showOverrideForm;

  return (
    <div className="planning-review-card">
      <div className="planning-review-header">
        <div>
          <div className="planning-review-title-row">
            <h4>{title}</h4>
            <span
              className={`planning-review-status planning-review-status-${status}`}
            >
              {REVIEW_STATUS_LABELS[status]}
            </span>
          </div>
          {meta ? <div className="planning-review-meta">{meta}</div> : null}
        </div>
        <div className="button-row planning-review-actions">
          {primaryActionLabel && onPrimaryAction ? (
            <button
              type="button"
              onClick={() => void onPrimaryAction()}
              disabled={reviewBusy || primaryActionDisabled}
            >
              {reviewBusy ? primaryActionBusyLabel : primaryActionLabel}
            </button>
          ) : null}
          {hasDetails && showDetailsToggle && onToggleDetails ? (
            <button
              type="button"
              onClick={() => {
                if (showOverrideForm && onToggleOverride) {
                  onToggleOverride();
                }
                onToggleDetails();
              }}
            >
              {showDetails ? detailsCloseLabel : detailsOpenLabel}
            </button>
          ) : null}
        </div>
      </div>

      {summary ? <p className="planning-review-summary">{summary}</p> : null}
      {overrideReason && !showOverrideForm ? (
        <p className="planning-review-note">
          Moving ahead with risk: {overrideReason}
        </p>
      ) : null}

      {showDetails ? (
        <div className="planning-review-details">
          {showOverrideAction && onToggleOverride ? (
            <div className="button-row" style={{ marginTop: 0 }}>
              <button
                type="button"
                onClick={onToggleOverride}
                disabled={reviewBusy}
              >
                {showOverrideForm ? cancelOverrideLabel : overrideActionLabel}
              </button>
            </div>
          ) : null}

          {showOverrideForm && onChangeOverrideReason && onConfirmOverride ? (
            <div style={{ display: "grid", gap: "0.55rem" }}>
              <textarea
                className="multiline"
                value={overrideReason ?? ""}
                onChange={(event) => onChangeOverrideReason(event.target.value)}
                placeholder={overridePlaceholder}
                rows={3}
              />
              <div className="button-row" style={{ marginTop: 0 }}>
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

          {extraContent}

          {FINDING_ORDER.map((type) =>
            findings[type].length > 0 ? (
              <div key={type}>
                <span className="qa-label">
                  {REVIEW_FINDING_SECTION_LABELS[type]}
                </span>
                <ul style={{ margin: "0.35rem 0 0" }}>
                  {findings[type].map((finding) => (
                    <li key={finding.id}>{finding.message}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}

          {footerMessage ? (
            <div className="planning-review-note planning-review-note-warn">
              {footerMessage}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
