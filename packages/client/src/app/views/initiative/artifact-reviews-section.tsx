import type { PlanningReviewArtifact, PlanningReviewKind } from "../../../types.js";
import { REVIEW_KIND_LABELS, REVIEWS_BY_STEP } from "../../utils/initiative-workflow.js";
import {
  REVIEW_FINDING_SECTION_LABELS,
  groupReviewFindings,
  type SpecStep
} from "./shared.js";

const DETAIL_ORDER = [
  "blocker",
  "traceability-gap",
  "warning",
  "assumption",
  "recommended-fix"
] as const;

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
  onConfirmOverride
}: ArtifactReviewsSectionProps) => {
  const reviewKinds = REVIEWS_BY_STEP[activeSpecStep];
  const selectedKind = reviewKinds.includes(selectedReviewKind) ? selectedReviewKind : reviewKinds[0];
  const selectedReview = getReview(selectedKind);
  const grouped = groupReviewFindings(selectedReview?.findings ?? []);
  const blockers = grouped.blocker.length;
  const missingLinks = grouped["traceability-gap"].length;
  const suggestions =
    grouped.warning.length + grouped.assumption.length + grouped["recommended-fix"].length;
  const reviewBusy = busyAction === `review-${selectedKind}` || busyAction === `override-${selectedKind}`;
  const showOverrideForm = reviewOverrideKind === selectedKind;
  const canSubmitOverride = reviewOverrideReason.trim().length > 0;

  return (
    <div className="planning-review-drawer-layout">
      <div className="planning-review-switcher" role="tablist" aria-label="Reviews">
        {reviewKinds.map((kind) => {
          const review = getReview(kind);
          const groupedFindings = groupReviewFindings(review?.findings ?? []);
          const mustFixCount = groupedFindings.blocker.length + groupedFindings["traceability-gap"].length;

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
              <span className="planning-review-switcher-meta">
                {review
                  ? mustFixCount > 0
                    ? `${mustFixCount} issue${mustFixCount === 1 ? "" : "s"} to fix`
                    : review.status === "overridden"
                      ? "Moved ahead with risk"
                      : "Looks good"
                  : "Not run yet"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="planning-review-detail">
        <div className="planning-review-detail-header">
          <div>
            <h3>{REVIEW_KIND_LABELS[selectedKind]}</h3>
            <p>
              {selectedReview?.summary ??
                "Run this review to check whether the current artifact is ready to move forward."}
            </p>
          </div>
          <div className="button-row planning-review-detail-actions">
            <button type="button" onClick={() => void onRunReview(selectedKind)} disabled={reviewBusy}>
              {busyAction === `review-${selectedKind}` ? "Reviewing..." : "Review again"}
            </button>
            {selectedReview?.status === "blocked" || showOverrideForm ? (
              <button
                type="button"
                onClick={() => {
                  if (showOverrideForm) {
                    onClearReviewOverride();
                    return;
                  }

                  onSetReviewOverride(selectedKind, selectedReview?.overrideReason ?? "");
                }}
                disabled={reviewBusy}
              >
                {showOverrideForm ? "Keep blocking" : "Continue with risk"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="planning-review-detail-stats">
          <span>{blockers} must fix</span>
          <span>{missingLinks} missing link{missingLinks === 1 ? "" : "s"}</span>
          <span>{suggestions} suggestion{suggestions === 1 ? "" : "s"}</span>
        </div>

        {showOverrideForm ? (
          <div className="planning-review-override-panel">
            <label className="planning-review-override-label" htmlFor="planning-review-override">
              Why are you moving ahead anyway?
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
                {busyAction === `override-${selectedKind}` ? "Saving..." : "Continue with risk"}
              </button>
            </div>
          </div>
        ) : null}

        {selectedReview?.overrideReason && !showOverrideForm ? (
          <p className="planning-review-note">Moving ahead with risk: {selectedReview.overrideReason}</p>
        ) : null}

        {DETAIL_ORDER.map((type) =>
          grouped[type].length > 0 ? (
            <section key={type} className="planning-review-detail-section">
              <span className="qa-label">{REVIEW_FINDING_SECTION_LABELS[type]}</span>
              <ul>
                {grouped[type].map((finding) => (
                  <li key={finding.id}>{finding.message}</li>
                ))}
              </ul>
            </section>
          ) : null
        )}

        {DETAIL_ORDER.every((type) => grouped[type].length === 0) && !showOverrideForm ? (
          <p className="planning-review-empty">No open issues in this review.</p>
        ) : null}
      </div>
    </div>
  );
};
