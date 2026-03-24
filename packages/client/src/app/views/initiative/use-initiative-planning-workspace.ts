import { useParams } from "react-router-dom";
import type { ArtifactsSnapshot } from "../../../types.js";
import {
  noopApplySnapshotUpdate,
  type ApplySnapshotUpdate,
} from "../../utils/snapshot-updates.js";
import { useInitiativePlanningActions } from "./use-initiative-planning-actions.js";
import { useInitiativePlanningDerivedState } from "./use-initiative-planning-derived-state.js";
import {
  useInitiativePlanningLocalState,
  useInitiativePlanningLocalStateSync,
} from "./use-initiative-planning-local-state.js";

export const useInitiativePlanningWorkspace = (
  snapshot: ArtifactsSnapshot,
  onRefresh: () => Promise<void>,
  onApplySnapshotUpdate: ApplySnapshotUpdate = noopApplySnapshotUpdate,
) => {
  const params = useParams<{ id: string }>();
  const localState = useInitiativePlanningLocalState();
  const derivedState = useInitiativePlanningDerivedState({
    snapshot,
    initiativeId: params.id,
    refinementAnswers: localState.refinementAnswers,
    defaultAnswerQuestionIds: localState.defaultAnswerQuestionIds,
  });

  useInitiativePlanningLocalStateSync({
    initiative: derivedState.initiative,
    activeStep: derivedState.activeStep,
    activeSpecStep: derivedState.activeSpecStep,
    activeRefinement: derivedState.activeRefinement,
    savedDrafts: derivedState.savedDrafts,
    editingStep: localState.editingStep,
    drawerState: localState.drawerState,
    setDrafts: localState.setDrafts,
    setRefinementAnswers: localState.setRefinementAnswers,
    setDefaultAnswerQuestionIds: localState.setDefaultAnswerQuestionIds,
    setRefinementAssumptions: localState.setRefinementAssumptions,
    setGuidanceQuestionId: localState.setGuidanceQuestionId,
    setGuidanceText: localState.setGuidanceText,
    setDrawerState: localState.setDrawerState,
    setReviewOverrideKind: localState.setReviewOverrideKind,
    setReviewOverrideReason: localState.setReviewOverrideReason,
    setEditingStep: localState.setEditingStep,
  });

  const actions = useInitiativePlanningActions({
    initiative: derivedState.initiative,
    headerTitle: derivedState.headerTitle,
    activeStep: derivedState.activeStep,
    activeSurface: derivedState.activeSurface,
    activeSpecStep: derivedState.activeSpecStep,
    activeRefinement: derivedState.activeRefinement,
    persistedActiveRefinement: derivedState.persistedActiveRefinement,
    validationReview: derivedState.validationReview,
    validationFeedback: derivedState.validationFeedback,
    validationFeedbackByStep: derivedState.validationFeedbackByStep,
    initiativeTickets: derivedState.initiativeTickets,
    hasActiveContent: derivedState.hasActiveContent,
    hasRefinementQuestions: derivedState.hasRefinementQuestions,
    hasPhaseSpecificRefinementDecisions: derivedState.hasPhaseSpecificRefinementDecisions,
    getReview: derivedState.getReview,
    hasOutstandingReview: derivedState.hasOutstandingReview,
    navigateToStep: derivedState.navigateToStep,
    onRefresh,
    onApplySnapshotUpdate,
    editingStep: localState.editingStep,
    drafts: localState.drafts,
    savedDrafts: derivedState.savedDrafts,
    drawerState: localState.drawerState,
    refinementAnswers: localState.refinementAnswers,
    defaultAnswerQuestionIds: localState.defaultAnswerQuestionIds,
    reviewOverrideReason: localState.reviewOverrideReason,
    setEditingStep: localState.setEditingStep,
    setDraftSaveState: localState.setDraftSaveState,
    setRefinementAssumptions: localState.setRefinementAssumptions,
    setRefinementSaveState: localState.setRefinementSaveState,
    setGuidanceQuestionId: localState.setGuidanceQuestionId,
    setGuidanceText: localState.setGuidanceText,
    setReviewOverrideKind: localState.setReviewOverrideKind,
    setReviewOverrideReason: localState.setReviewOverrideReason,
    setDrawerState: localState.setDrawerState,
    setIsDeletingInitiative: localState.setIsDeletingInitiative,
    applyPhaseCheckResult: derivedState.applyPhaseCheckResult,
  });

  return {
    ...derivedState,
    ...localState,
    ...actions,
    updateDraft: (value: string) => localState.updateDraft(derivedState.activeSpecStep, value),
  };
};
