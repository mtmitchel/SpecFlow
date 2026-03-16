import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import type { ArtifactsSnapshot } from "../../types.js";
import { Pipeline } from "../components/pipeline.js";
import { getInitiativeProgressModel } from "../utils/initiative-progress.js";
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

  const renderSaveState = (label: string | null) =>
    label ? (
      <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
        {label}
      </span>
    ) : null;

  if (!workspace.initiative) {
    return (
      <section className="planning-shell">
        <h2>Initiative not found</h2>
      </section>
    );
  }

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

  const progressModel = useMemo(
    () =>
      getInitiativeProgressModel(initiative, snapshot, {
        currentKey: "brief",
        generatingKey: busyAction === "generate-brief" ? "brief" : null,
      }),
    [busyAction, initiative, snapshot],
  );

  const refinementCheckedAt = activeRefinement?.checkedAt ?? null;
  const canGenerate = !hasRefinementQuestions || unresolvedQuestionCount === 0;
  const resolvedQuestionCount = (activeRefinement?.questions.length ?? 0) - unresolvedQuestionCount;
  const saveStateLabel = SAVE_STATE_LABELS[refinementSaveState];

  useEffect(() => {
    if (intakeStartedRef.current || refinementCheckedAt || busyAction === "check-brief") {
      return;
    }

    intakeStartedRef.current = true;
    void handleCheckAndAdvance("brief");
  }, [busyAction, handleCheckAndAdvance, refinementCheckedAt]);

  useEffect(() => {
    if (!hasActiveContent || isBusy) {
      return;
    }

    navigateToStep("brief");
  }, [hasActiveContent, isBusy, navigateToStep]);

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
        <div className="planning-entry-card planning-entry-card-muted">
          <h3>What do you want to build?</h3>
          <div className="planning-entry-idea">{initiative.description}</div>
        </div>

        <div className="planning-entry-card planning-intake-card">
          <div className="planning-entry-card-header">
            <div>
              <h3>Brief intake</h3>
              <p>Answer what matters. Skip the rest.</p>
            </div>
            <span className="planning-entry-counter">
              {resolvedQuestionCount}/{activeRefinement?.questions.length ?? 0}
            </span>
          </div>

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
                  variant="compact"
                  onRequestGuidance={handleRequestGuidance}
                  onAnswerChange={updateRefinementAnswer}
                  onAnswerLater={deferRefinementQuestion}
                />
              ) : busyAction === "check-brief" ? (
                <p className="ticket-empty-note">Getting the questions ready...</p>
              ) : null}

              {refinementCheckedAt ? (
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
        </div>
      </div>
    </section>
  );
};
