import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  Initiative,
  InitiativePlanningStep,
  PlanningReviewArtifact,
  SpecDocumentSummary,
} from "../../../types.js";
import {
  buildInitiativeStepSearchParams,
  type InitiativePlanningSurface,
} from "../../utils/initiative-progress.js";
import { resolveInitiativePlanningRouteState } from "./planning-route-state.js";
import type { SpecStep } from "./shared.js";

export const useInitiativePlanningRoute = (options: {
  initiative: Initiative | null;
  planningReviews: PlanningReviewArtifact[];
  specSummaries: SpecDocumentSummary[];
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStep = searchParams.get("step");
  const requestedSurface = searchParams.get("surface");

  const routeState = useMemo(
    () =>
      options.initiative
        ? resolveInitiativePlanningRouteState({
            initiative: options.initiative,
            planningReviews: options.planningReviews,
            requestedStep,
            requestedSurface,
            specSummaries: options.specSummaries,
          })
        : null,
    [options.initiative, options.planningReviews, options.specSummaries, requestedStep, requestedSurface],
  );

  const activeStep: InitiativePlanningStep = routeState?.activeStep ?? "brief";
  const activeSurface: InitiativePlanningSurface | null =
    routeState?.activeSurface ??
    (activeStep === "validation" || activeStep === "tickets" ? null : "questions");
  const activeSpecStep: SpecStep | null =
    activeStep === "validation" || activeStep === "tickets" ? null : activeStep;

  useEffect(() => {
    if (
      options.initiative &&
      routeState &&
      searchParams.toString() !== routeState.canonicalSearchParams.toString()
    ) {
      setSearchParams(routeState.canonicalSearchParams, { replace: true });
    }
  }, [options.initiative, routeState, searchParams, setSearchParams]);

  const navigateToStep = (step: InitiativePlanningStep, surface?: InitiativePlanningSurface | null): void => {
    setSearchParams(buildInitiativeStepSearchParams(step, surface));
  };

  const setActiveSurface = (surface: InitiativePlanningSurface): void => {
    if (activeStep === "validation" || activeStep === "tickets") {
      return;
    }

    navigateToStep(activeStep, surface);
  };

  return {
    activeStep,
    activeSurface,
    activeSpecStep,
    navigateToStep,
    setActiveSurface,
  };
};
