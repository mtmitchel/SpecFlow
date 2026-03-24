import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Initiative, InitiativeRefinementState, PlanningReviewKind } from "../../../types.js";
import type { PlanningDrawerState, SaveState, SpecStep } from "./shared.js";
import { EMPTY_SPEC_DRAFTS } from "./use-initiative-loaded-specs.js";

const EMPTY_DRAFT_SAVE_STATE: Record<SpecStep, SaveState> = {
  brief: "idle",
  "core-flows": "idle",
  prd: "idle",
  "tech-spec": "idle"
};

export const useInitiativePlanningLocalState = () => {
  const [editingStep, setEditingStep] = useState<SpecStep | null>(null);
  const [drafts, setDrafts] = useState<Record<SpecStep, string>>(EMPTY_SPEC_DRAFTS);
  const [draftSaveState, setDraftSaveState] = useState<Record<SpecStep, SaveState>>(EMPTY_DRAFT_SAVE_STATE);
  const [refinementAnswers, setRefinementAnswers] = useState<Record<string, string | string[] | boolean>>({});
  const [defaultAnswerQuestionIds, setDefaultAnswerQuestionIds] = useState<string[]>([]);
  const [refinementAssumptions, setRefinementAssumptions] = useState<string[]>([]);
  const [refinementSaveState, setRefinementSaveState] = useState<SaveState>("idle");
  const [guidanceQuestionId, setGuidanceQuestionId] = useState<string | null>(null);
  const [guidanceText, setGuidanceText] = useState<string | null>(null);
  const [reviewOverrideKind, setReviewOverrideKind] = useState<PlanningReviewKind | null>(null);
  const [reviewOverrideReason, setReviewOverrideReason] = useState("");
  const [drawerState, setDrawerState] = useState<PlanningDrawerState>(null);
  const [isDeletingInitiative, setIsDeletingInitiative] = useState(false);

  const setReviewOverride = (kind: PlanningReviewKind, reason: string) => {
    setReviewOverrideKind(kind);
    setReviewOverrideReason(reason);
  };

  const clearReviewOverride = () => {
    setReviewOverrideKind(null);
    setReviewOverrideReason("");
  };

  const updateDraft = (step: SpecStep | null, value: string) => {
    if (!step) {
      return;
    }

    setDrafts((current) => ({
      ...current,
      [step]: value
    }));
    setDraftSaveState((current) => ({ ...current, [step]: "idle" }));
  };

  const openEditDrawer = (step: SpecStep) => {
    clearReviewOverride();
    setEditingStep(step);
    setDrawerState({ type: "edit", step });
  };

  const openRefinementDrawer = (step: SpecStep) => {
    clearReviewOverride();
    setEditingStep(null);
    setDrawerState({ type: "refinement", step });
  };

  const closeDrawer = () => {
    setDrawerState(null);
    clearReviewOverride();
  };

  const updateRefinementAnswer = (questionId: string, nextValue: string | string[] | boolean) => {
    setRefinementAnswers((current) => ({
      ...current,
      [questionId]: nextValue
    }));
    setDefaultAnswerQuestionIds((current) => current.filter((id) => id !== questionId));
    setRefinementSaveState("idle");
  };

  const deferRefinementQuestion = (questionId: string) => {
    setRefinementAnswers((current) => {
      const next = { ...current };
      delete next[questionId];
      return next;
    });
    setDefaultAnswerQuestionIds((current) => (current.includes(questionId) ? current : [...current, questionId]));
    setRefinementSaveState("idle");
  };

  return {
    editingStep,
    setEditingStep,
    drafts,
    setDrafts,
    draftSaveState,
    setDraftSaveState,
    refinementAnswers,
    setRefinementAnswers,
    defaultAnswerQuestionIds,
    setDefaultAnswerQuestionIds,
    refinementAssumptions,
    setRefinementAssumptions,
    refinementSaveState,
    setRefinementSaveState,
    guidanceQuestionId,
    guidanceText,
    setGuidanceQuestionId,
    setGuidanceText,
    reviewOverrideKind,
    setReviewOverrideKind,
    reviewOverrideReason,
    setReviewOverrideReason,
    drawerState,
    setDrawerState,
    isDeletingInitiative,
    setIsDeletingInitiative,
    setReviewOverride,
    clearReviewOverride,
    updateDraft,
    openEditDrawer,
    openRefinementDrawer,
    closeDrawer,
    updateRefinementAnswer,
    deferRefinementQuestion,
  };
};

export const useInitiativePlanningLocalStateSync = ({
  initiative,
  activeStep,
  activeSpecStep,
  activeRefinement,
  savedDrafts,
  editingStep,
  drawerState,
  setDrafts,
  setRefinementAnswers,
  setDefaultAnswerQuestionIds,
  setRefinementAssumptions,
  setGuidanceQuestionId,
  setGuidanceText,
  setDrawerState,
  setReviewOverrideKind,
  setReviewOverrideReason,
  setEditingStep,
}: {
  initiative: Initiative | null;
  activeStep: string;
  activeSpecStep: SpecStep | null;
  activeRefinement: InitiativeRefinementState | null;
  savedDrafts: Record<SpecStep, string>;
  editingStep: SpecStep | null;
  drawerState: PlanningDrawerState;
  setDrafts: Dispatch<SetStateAction<Record<SpecStep, string>>>;
  setRefinementAnswers: Dispatch<SetStateAction<Record<string, string | string[] | boolean>>>;
  setDefaultAnswerQuestionIds: Dispatch<SetStateAction<string[]>>;
  setRefinementAssumptions: Dispatch<SetStateAction<string[]>>;
  setGuidanceQuestionId: Dispatch<SetStateAction<string | null>>;
  setGuidanceText: Dispatch<SetStateAction<string | null>>;
  setDrawerState: Dispatch<SetStateAction<PlanningDrawerState>>;
  setReviewOverrideKind: Dispatch<SetStateAction<PlanningReviewKind | null>>;
  setReviewOverrideReason: Dispatch<SetStateAction<string>>;
  setEditingStep: Dispatch<SetStateAction<SpecStep | null>>;
}) => {
  useEffect(() => {
    if (!initiative) {
      return;
    }

    setDrafts((current) => ({
      brief: editingStep === "brief" && current.brief !== savedDrafts.brief ? current.brief : savedDrafts.brief,
      "core-flows":
        editingStep === "core-flows" && current["core-flows"] !== savedDrafts["core-flows"]
          ? current["core-flows"]
          : savedDrafts["core-flows"],
      prd: editingStep === "prd" && current.prd !== savedDrafts.prd ? current.prd : savedDrafts.prd,
      "tech-spec":
        editingStep === "tech-spec" && current["tech-spec"] !== savedDrafts["tech-spec"]
          ? current["tech-spec"]
          : savedDrafts["tech-spec"]
    }));
  }, [editingStep, initiative, savedDrafts, setDrafts]);

  const refinementSignature = activeRefinement
    ? JSON.stringify({
        checkedAt: activeRefinement.checkedAt,
        questions: activeRefinement.questions,
        answers: activeRefinement.answers,
        defaultAnswerQuestionIds: activeRefinement.defaultAnswerQuestionIds,
        baseAssumptions: activeRefinement.baseAssumptions
      })
    : "";

  const previousSyncStepRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeRefinement) {
      setRefinementAnswers({});
      setDefaultAnswerQuestionIds([]);
      setRefinementAssumptions([]);
      setGuidanceQuestionId(null);
      setGuidanceText(null);
      previousSyncStepRef.current = null;
      return;
    }

    const stepChanged = previousSyncStepRef.current !== activeStep;
    previousSyncStepRef.current = activeStep;

    if (stepChanged) {
      setRefinementAnswers(activeRefinement.answers);
    } else {
      setRefinementAnswers((current) => ({ ...activeRefinement.answers, ...current }));
    }
    setDefaultAnswerQuestionIds(activeRefinement.defaultAnswerQuestionIds);
    setRefinementAssumptions(activeRefinement.baseAssumptions);
    setGuidanceQuestionId(null);
    setGuidanceText(null);
  }, [
    activeRefinement,
    activeStep,
    refinementSignature,
    setDefaultAnswerQuestionIds,
    setGuidanceQuestionId,
    setGuidanceText,
    setRefinementAnswers,
    setRefinementAssumptions,
  ]);

  useEffect(() => {
    if (!drawerState) {
      return;
    }

    if (drawerState.step === activeSpecStep) {
      return;
    }

    setDrawerState(null);
    setReviewOverrideKind(null);
    setReviewOverrideReason("");

    if (editingStep && editingStep !== activeSpecStep) {
      setEditingStep(null);
    }
  }, [
    activeSpecStep,
    drawerState,
    editingStep,
    setDrawerState,
    setEditingStep,
    setReviewOverrideKind,
    setReviewOverrideReason,
  ]);
};
