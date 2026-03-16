import type { PlanningReviewArtifact, PlanningReviewKind } from "../../../types.js";
import {
  REVIEW_KIND_LABELS,
  REVIEWS_BY_STEP
} from "../../utils/initiative-workflow.js";
import {
  groupReviewFindings,
  type SpecStep
} from "./shared.js";
import { PlanningReviewCard } from "./planning-review-card.js";

interface ArtifactReviewsSectionProps {
  activeSpecStep: SpecStep;
  busyAction: string | null;
  reviewOverrideKind: PlanningReviewKind | null;
  reviewOverrideReason: string;
  getReview: (kind: PlanningReviewKind) => PlanningReviewArtifact | undefined;
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
  getReview,
  onRunReview,
  onSetReviewOverride,
  onClearReviewOverride,
  onChangeReviewOverrideReason,
  onConfirmOverride
}: ArtifactReviewsSectionProps) => {
  const reviewKinds = REVIEWS_BY_STEP[activeSpecStep];

  return (
    <div style={{ display: "grid", gap: "0.85rem", marginTop: "1rem" }}>
      <div style={{ display: "grid", gap: "0.2rem" }}>
        <h3 style={{ margin: 0 }}>Checkpoint</h3>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          Review the generated artifact before you move on to the next step.
        </p>
      </div>

      {reviewKinds.map((kind) => {
        const review = getReview(kind);
        const grouped = groupReviewFindings(review?.findings ?? []);
        const blockers = grouped.blocker.length + grouped["traceability-gap"].length;
        const warnings = grouped.warning.length;
        const reviewBusy = busyAction === `review-${kind}` || busyAction === `override-${kind}`;
        const showOverrideForm = reviewOverrideKind === kind;

        return (
          <PlanningReviewCard
            key={kind}
            title={REVIEW_KIND_LABELS[kind]}
            status={review?.status ?? "stale"}
            meta={
              <>
                {blockers} blocker{blockers === 1 ? "" : "s"} · {warnings} warning{warnings === 1 ? "" : "s"}
                {review ? ` · updated ${new Date(review.updatedAt).toLocaleString()}` : " · not run yet"}
              </>
            }
            summary={review?.summary}
            findings={grouped}
            reviewBusy={reviewBusy}
            primaryActionLabel="Run review"
            primaryActionBusyLabel="Reviewing..."
            onPrimaryAction={() => onRunReview(kind)}
            showOverrideAction={review?.status === "blocked"}
            showOverrideForm={showOverrideForm}
            onToggleOverride={() => {
              if (showOverrideForm) {
                onClearReviewOverride();
                return;
              }

              onSetReviewOverride(kind, review?.overrideReason ?? "");
            }}
            overrideReason={showOverrideForm ? reviewOverrideReason : review?.overrideReason}
            overridePlaceholder="Document why you are accepting this risk."
            onChangeOverrideReason={onChangeReviewOverrideReason}
            onConfirmOverride={() => onConfirmOverride(kind)}
            overrideActionLabel="Override blockers"
            cancelOverrideLabel="Cancel override"
            overrideConfirmLabel="Confirm override"
            overrideBusyLabel="Overriding..."
          />
        );
      })}
    </div>
  );
};
