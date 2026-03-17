import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { updateInitiative } from "../../api/initiatives.js";
import type { ArtifactsSnapshot } from "../../types.js";
import { Pipeline } from "../components/pipeline.js";
import { getInitiativeProgressModel } from "../utils/initiative-progress.js";
import { useToast } from "../context/toast.js";
import { RefinementSection } from "./initiative/refinement-section.js";
import { SAVE_STATE_LABELS } from "./initiative/shared.js";
import { useInitiativePlanningWorkspace } from "./initiative/use-initiative-planning-workspace.js";

export const InitiativeHandoffView = ({
  snapshot,
  onRefresh,
}: {
  snapshot: ArtifactsSnapshot;
  onRefresh: () => Promise<void>;
}) => {
  const workspace = useInitiativePlanningWorkspace(snapshot, onRefresh);
  const intakeStartedRef = useRef(false);
  const followUpCheckSignatureRef = useRef<string | null>(null);
  const { showError } = useToast();
  const [activeSurveyStep, setActiveSurveyStep] = useState<"idea" | "brief">("brief");
  const [ideaDraft, setIdeaDraft] = useState("");
  const [ideaBusy, setIdeaBusy] = useState(false);

  const renderSaveState = (label: string | null) =>
    label ? (
      <span className="text-muted-sm">
        {label}
      </span>
    ) : null;

  const {
    initiative,
    activeRefinement,
    activeStep,
    busyAction,
    refinementAnswers,
    defaultAnswerQuestionIds,
    refinementAssumptions,
    refinementSaveState,
    unresolvedQuestionCount,
    guidanceQuestionId,
    guidanceText,
    isBusy,
    hasActiveContent,
    hasRefinementQuestions,
    handleCheckAndAdvance,
    handleGenerateSpec,
    handleRequestGuidance,
    updateRefinementAnswer,
    deferRefinementQuestion,
    navigateToStep,
  } = workspace;

  useEffect(() => {
    if (!initiative) {
      return;
    }

    setIdeaDraft(initiative.description);
  }, [initiative]);

  const progressModel = useMemo(
    () =>
      initiative
        ? getInitiativeProgressModel(initiative, snapshot, {
        currentKey: "brief",
        generatingKey: busyAction === "generate-brief" ? "brief" : null,
      })
        : null,
    [busyAction, initiative, snapshot],
  );

  const refinementCheckedAt = activeRefinement?.checkedAt ?? null;
  const canGenerate = !hasRefinementQuestions || unresolvedQuestionCount === 0;
  const saveStateLabel = SAVE_STATE_LABELS[refinementSaveState];
  const loadingStateLabel =
    busyAction === "check-brief" && activeRefinement?.questions.length && unresolvedQuestionCount === 0
      ? "Checking if the brief needs anything else"
      : null;
  const completedQuestionSignature = useMemo(() => {
    if (!activeRefinement || activeRefinement.questions.length === 0 || unresolvedQuestionCount > 0) {
      return null;
    }

    return JSON.stringify({
      ids: activeRefinement.questions.map((question) => question.id),
      answers: refinementAnswers,
      defaults: defaultAnswerQuestionIds,
    });
  }, [activeRefinement, defaultAnswerQuestionIds, refinementAnswers, unresolvedQuestionCount]);

  useEffect(() => {
    if (!initiative) {
      return;
    }

    if (intakeStartedRef.current || refinementCheckedAt || busyAction === "check-brief") {
      return;
    }

    intakeStartedRef.current = true;
    void handleCheckAndAdvance("brief");
  }, [busyAction, handleCheckAndAdvance, refinementCheckedAt]);

  useEffect(() => {
    if (!initiative) {
      return;
    }

    if (!hasActiveContent || isBusy) {
      return;
    }

    navigateToStep("brief");
  }, [hasActiveContent, isBusy, navigateToStep]);

  useEffect(() => {
    if (!initiative) {
      return;
    }

    if (
      !completedQuestionSignature ||
      hasActiveContent ||
      isBusy ||
      activeStep !== "brief" ||
      completedQuestionSignature === followUpCheckSignatureRef.current
    ) {
      return;
    }

    followUpCheckSignatureRef.current = completedQuestionSignature;
    void handleCheckAndAdvance("brief");
  }, [activeStep, completedQuestionSignature, handleCheckAndAdvance, hasActiveContent, initiative, isBusy]);

  if (!initiative || !progressModel) {
    return (
      <section className="planning-shell">
        <h2>Initiative not found</h2>
      </section>
    );
  }

  const handleContinueFromIdea = async () => {
    const trimmed = ideaDraft.trim();
    if (!trimmed || ideaBusy) {
      return;
    }

    if (trimmed === initiative.description) {
      setActiveSurveyStep("brief");
      return;
    }

    setIdeaBusy(true);
    try {
      intakeStartedRef.current = false;
      followUpCheckSignatureRef.current = null;
      await updateInitiative(initiative.id, { description: trimmed });
      await onRefresh();
      setActiveSurveyStep("brief");
    } catch (error) {
      showError((error as Error).message ?? "Failed to update the idea");
    } finally {
      setIdeaBusy(false);
    }
  };

  return (
    <section className="planning-shell planning-entry-shell">
      <div className="planning-topbar">
        <div className="planning-topbar-row">
          <div className="planning-breadcrumb">
            <Link to="/">Home</Link>
            <span>/</span>
            <span>New initiative</span>
          </div>
        </div>
        <div className="planning-topbar-pipeline">
          <Pipeline nodes={progressModel.nodes} />
        </div>
      </div>

      <div className="planning-entry-column">
        <div className="planning-survey-deck">
          <div className="planning-survey-card planning-survey-card-active">
            {activeSurveyStep === "idea" ? (
              <>
                <div className="planning-survey-step-header">
                  <span className="planning-survey-card-step">Step 1</span>
                </div>
                <div className="planning-entry-card-header">
                  <div>
                    <h3>What do you want to build?</h3>
                    <p>Start with the outcome and any hard limits.</p>
                  </div>
                </div>
                <textarea
                  className="multiline"
                  value={ideaDraft}
                  onChange={(event) => setIdeaDraft(event.target.value)}
                  placeholder="What are you building? Who is it for? Any hard limits?"
                  autoFocus
                />
                <div className="planning-entry-card-footer">
                  <button
                    type="button"
                    onClick={() => {
                      setIdeaDraft(initiative.description);
                      setActiveSurveyStep("brief");
                    }}
                    disabled={ideaBusy}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleContinueFromIdea()}
                    disabled={ideaBusy || ideaDraft.trim().length === 0}
                  >
                    {ideaBusy ? "Saving..." : "Continue"}
                  </button>
                </div>
              </>
            ) : (
              <>
                {!hasActiveContent ? (
                  <>
                    {activeRefinement && hasRefinementQuestions ? (
                      <RefinementSection
                        activeSpecStep="brief"
                        activeRefinement={activeRefinement}
                        refinementAnswers={refinementAnswers}
                        defaultAnswerQuestionIds={defaultAnswerQuestionIds}
                        refinementAssumptions={refinementAssumptions}
                        refinementSaveState={refinementSaveState}
                        unresolvedQuestionCount={unresolvedQuestionCount}
                        guidanceQuestionId={guidanceQuestionId}
                        guidanceText={guidanceText}
                        busyAction={busyAction}
                        isBusy={isBusy}
                        saveStateIndicator={renderSaveState(saveStateLabel)}
                        loadingStateLabel={loadingStateLabel}
                        variant="survey"
                        leadingStepCount={1}
                        onBackToPreviousStep={() => setActiveSurveyStep("idea")}
                        onRequestGuidance={handleRequestGuidance}
                        onAnswerChange={updateRefinementAnswer}
                        onAnswerLater={deferRefinementQuestion}
                      />
                    ) : busyAction === "check-brief" ? (
                      <>
                        <div className="planning-survey-step-header">
                          <span className="planning-survey-card-step">Step 2</span>
                          {renderSaveState(saveStateLabel)}
                        </div>
                        <div className="planning-intake-loading" role="status" aria-live="polite">
                          <span className="planning-intake-loading-dot" aria-hidden="true" />
                          <div className="planning-intake-loading-copy">
                            <strong>
                              {refinementCheckedAt ? "Checking if anything else is needed..." : "Getting the questions ready..."}
                            </strong>
                            <span>Stay here. More questions may appear, or the brief will be ready to draft.</span>
                          </div>
                        </div>
                      </>
                    ) : null}

                    {refinementCheckedAt && unresolvedQuestionCount === 0 ? (
                      <div className="planning-survey-finish">
                        <div className="planning-survey-finish-copy">
                          <h3>Ready to draft the brief</h3>
                          <p>You answered what matters. Generate the first draft when you're ready.</p>
                        </div>
                        <div className="planning-step-actions planning-step-actions-centered">
                          <button
                            type="button"
                            onClick={() => setActiveSurveyStep("idea")}
                            disabled={isBusy}
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => void handleGenerateSpec("brief")}
                            disabled={isBusy || !canGenerate}
                          >
                            {busyAction === "generate-brief" ? "Generating..." : "Generate brief"}
                          </button>
                        </div>
                      </div>
                    ) : refinementCheckedAt ? (
                      <div className="planning-step-actions planning-step-actions-centered">
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => void handleGenerateSpec("brief")}
                          disabled={isBusy || !canGenerate}
                        >
                          {busyAction === "generate-brief" ? "Generating..." : "Generate brief"}
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
