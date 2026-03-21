import { overrideInitiativeReview, runInitiativeReview } from "../../../api.js";
import type { PlanningReviewArtifact, PlanningReviewKind } from "../../../types.js";
import { getNextInitiativeStep, REVIEWS_BY_STEP } from "../../utils/initiative-workflow.js";
import type { InitiativePlanningSurface } from "../../utils/initiative-progress.js";
import type { SpecStep } from "./shared.js";

export const useInitiativeReviewActions = (options: {
  initiativeId: string | null;
  activeSpecStep: SpecStep | null;
  getReview: (kind: PlanningReviewKind) => PlanningReviewArtifact | undefined;
  hasOutstandingReview: (kind: PlanningReviewKind) => boolean;
  reviewOverrideReason: string;
  onRefresh: () => Promise<void>;
  navigateToStep: (step: SpecStep | "validation" | "tickets", surface?: InitiativePlanningSurface | null) => void;
  setReviewOverrideKind: (kind: PlanningReviewKind | null) => void;
  setReviewOverrideReason: (reason: string) => void;
  withBusyAction: (label: string, work: (signal: AbortSignal) => Promise<void>) => Promise<unknown>;
}) => {
  const handleRunReview = async (kind: PlanningReviewKind): Promise<void> => {
    if (!options.initiativeId) {
      return;
    }
    const initiativeId = options.initiativeId;

    await options.withBusyAction(`review-${kind}`, async (signal) => {
      const review = await runInitiativeReview(initiativeId, kind, { signal });
      await options.onRefresh();
      if (
        options.activeSpecStep &&
        REVIEWS_BY_STEP[options.activeSpecStep].every((reviewKind) => {
          const currentReview = reviewKind === kind ? review : options.getReview(reviewKind);
          return currentReview && (currentReview.status === "passed" || currentReview.status === "overridden");
        })
      ) {
        const followingStep = getNextInitiativeStep(options.activeSpecStep);
        if (followingStep) {
          options.navigateToStep(followingStep);
        }
      }
    });
  };

  const handleOverrideReview = async (kind: PlanningReviewKind): Promise<void> => {
    if (!options.initiativeId) {
      return;
    }
    const initiativeId = options.initiativeId;

    await options.withBusyAction(`override-${kind}`, async () => {
      await overrideInitiativeReview(initiativeId, kind, options.reviewOverrideReason.trim());
      const remainingUnresolved =
        options.activeSpecStep
          ? REVIEWS_BY_STEP[options.activeSpecStep].filter(
              (reviewKind) => reviewKind !== kind && options.hasOutstandingReview(reviewKind),
            )
          : [];
      options.setReviewOverrideKind(null);
      options.setReviewOverrideReason("");
      await options.onRefresh();
      if (options.activeSpecStep && remainingUnresolved.length === 0) {
        const followingStep = getNextInitiativeStep(options.activeSpecStep);
        if (followingStep) {
          options.navigateToStep(followingStep);
        }
      }
    });
  };

  return {
    handleRunReview,
    handleOverrideReview,
  };
};
