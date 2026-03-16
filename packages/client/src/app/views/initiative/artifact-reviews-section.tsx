import { useMemo } from "react";
import type { PlanningReviewArtifact, PlanningReviewKind } from "../../../types.js";
import { REVIEW_KIND_LABELS, REVIEWS_BY_STEP } from "../../utils/initiative-workflow.js";
import {
  REVIEW_FINDING_SECTION_LABELS,
  groupReviewFindings,
  getReviewSwitcherMeta,
  type SpecStep
} from "./shared.js";

interface ArtifactReviewsSectionProps {
  activeSpecStep: SpecStep;
  busyAction: string | null;
  reviewOverrideKind: PlanningReviewKind | null;
  reviewOverrideReason: string;
  selectedReviewKind: PlanningReviewKind;
  getReview: (kind: PlanningReviewKind) => PlanningReviewArtifact | undefined;
  onSelectReview: (kind: PlanningReviewKind) => void;
  onRunReview: (kind: PlanningReviewKind) => void | Promise<void>;
  onSetReviewOverride: (kind: PlanningReviewKind, reason: string) => void;
  onClearReviewOverride: () => void;
  onChangeReviewOverrideReason: (reason: string) => void;
  onConfirmOverride: (kind: PlanningReviewKind) => void | Promise<void>;
  onOpenEditor: () => void;
  onOpenRefinement: () => void | Promise<void>;
}

export const ArtifactReviewsSection = ({
  activeSpecStep,
  busyAction,
  reviewOverrideKind,
  reviewOverrideReason,
  selectedReviewKind,
  getReview,
  onSelectReview,
  onRunReview,
  onSetReviewOverride,
  onClearReviewOverride,
  onChangeReviewOverrideReason,
  onConfirmOverride,
  onOpenEditor,
  onOpenRefinement
}: ArtifactReviewsSectionProps) => {
  const reviewKinds = REVIEWS_BY_STEP[activeSpecStep];
  const selectedKind = reviewKinds.includes(selectedReviewKind) ? selectedReviewKind : reviewKinds[0];
  const selectedReview = getReview(selectedKind);
  const groupedFindings = useMemo(() => groupReviewFindings(selectedReview?.findings ?? []), [selectedReview?.findings]);
  const findingsSummary = useMemo(
    () =>
      (Object.entries(groupedFindings) as Array<[keyof typeof groupedFindings, Array<{ id: string }>]>) //
        .filter(([, findings]) => findings.length > 0)
        .map(([type, findings]) => ({
          label: REVIEW_FINDING_SECTION_LABELS[type],
          count: findings.length
        })),
    [groupedFindings]
  );
  const reviewBusy = busyAction === `review-${selectedKind}` || busyAction === `override-${selectedKind}`;
  const showOverrideForm = reviewOverrideKind === selectedKind;
  const canSubmitOverride = reviewOverrideReason.trim().length > 0;
  const reviewHeadline =
    !selectedReview
      ? "Run a check to look for gaps."
      : selectedReview.status === "overridden"
        ? "Moved on with risk"
        : selectedReview.status === "passed"
          ? "Nothing is blocking this step"
          : "Make a few changes before you move on";
  const reviewNote =
    !selectedReview
      ? null
      : selectedReview.status === "overridden"
        ? selectedReview.overrideReason
          ? `Reason: ${selectedReview.overrideReason}`
          : "This step was unblocked with an override."
        : selectedReview.status === "passed"
          ? "You can move on, or check again after more edits."
          : "Change the inputs or edit the text, then check again.";

  return (
    <div className="planning-review-drawer-layout">
      {reviewKinds.length > 1 ? (
        <div className="planning-review-switcher" role="tablist" aria-label="Reviews">
          {reviewKinds.map((kind) => {
            const review = getReview(kind);

            return (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={kind === selectedKind}
                className={`planning-review-switcher-item${kind === selectedKind ? " active" : ""}`}
                onClick={() => onSelectReview(kind)}
              >
                <span className="planning-review-switcher-title">{REVIEW_KIND_LABELS[kind]}</span>
                <span className="planning-review-switcher-meta">{getReviewSwitcherMeta(review)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="planning-review-detail">
        <div className="planning-review-detail-header">
          <div>
            <h3>{reviewHeadline}</h3>
            {reviewNote ? <p>{reviewNote}</p> : null}
          </div>
          <div className="button-row planning-review-detail-actions">
            <button type="button" onClick={() => void onOpenRefinement()} disabled={reviewBusy}>
              Change inputs
            </button>
            <button type="button" onClick={onOpenEditor} disabled={reviewBusy}>
              Edit text
            </button>
            <button type="button" onClick={() => void onRunReview(selectedKind)} disabled={reviewBusy}>
              {busyAction === `review-${selectedKind}` ? "Checking..." : "Check again"}
            </button>
          </div>
        </div>

        {findingsSummary.length > 0 ? (
          <section className="planning-review-question-card">
            <div className="planning-review-question-top">
              {findingsSummary.map((finding) => (
                <span key={finding.label} className="planning-review-question-type">
                  {finding.count} {finding.label.toLowerCase()}
                </span>
              ))}
            </div>
          </section>
        ) : (
          <p className="planning-review-empty">No open issues.</p>
        )}

        {selectedReview?.status === "blocked" || showOverrideForm ? (
          <div className="planning-review-secondary-action">
            {!showOverrideForm ? (
              <button
                type="button"
                onClick={() => onSetReviewOverride(selectedKind, selectedReview?.overrideReason ?? "")}
                disabled={reviewBusy}
              >
                Move on anyway
              </button>
            ) : (
              <button type="button" onClick={onClearReviewOverride} disabled={reviewBusy}>
                Keep blocking
              </button>
            )}
          </div>
        ) : null}

        {showOverrideForm ? (
          <div className="planning-review-override-panel">
            <label className="planning-review-override-label" htmlFor="planning-review-override">
              Why are you moving on anyway?
            </label>
            <textarea
              id="planning-review-override"
              className="multiline"
              value={reviewOverrideReason}
              onChange={(event) => onChangeReviewOverrideReason(event.target.value)}
              placeholder="Add a short reason."
              rows={4}
            />
            <div className="button-row" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void onConfirmOverride(selectedKind)}
                disabled={reviewBusy || !canSubmitOverride}
              >
                {busyAction === `override-${selectedKind}` ? "Saving..." : "Move on anyway"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
