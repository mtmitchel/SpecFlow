import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { ArtifactsSnapshot, InitiativePlanningStep } from "../../types.js";
import { MarkdownView } from "../components/markdown-view.js";
import { Pipeline } from "../components/pipeline.js";
import { SideDrawer } from "../components/side-drawer.js";
import {
  canOpenInitiativeStep,
  INITIATIVE_WORKFLOW_LABELS,
  INITIATIVE_WORKFLOW_STEPS
} from "../utils/initiative-workflow.js";
import { getInitiativeProgressModel, type PipelineNodeKey } from "../utils/initiative-progress.js";
import { getPlanningStageCopy } from "../utils/ui-language.js";
import { PlanningSpecSection } from "./initiative/planning-spec-section.js";
import { RefinementSection } from "./initiative/refinement-section.js";
import { SAVE_STATE_LABELS, type SaveState } from "./initiative/shared.js";
import { TicketsStepSection } from "./initiative/tickets-step-section.js";
import { useInitiativePlanningWorkspace } from "./initiative/use-initiative-planning-workspace.js";

export const InitiativeView = ({
  snapshot,
  onRefresh
}: {
  snapshot: ArtifactsSnapshot;
  onRefresh: () => Promise<void>;
}) => {
  const workspace = useInitiativePlanningWorkspace(snapshot, onRefresh);

  const renderSaveState = (state: SaveState) => {
    const label = SAVE_STATE_LABELS[state];
    if (!label) {
      return null;
    }

    return (
      <span
        className="text-muted-sm planning-save-indicator"
        style={state === "error" ? { color: "var(--danger-text)" } : undefined}
      >
        {label}
      </span>
    );
  };

  const {
    initiative,
    initiativeReviews,
    headerTitle,
    activeStep,
    activeSurface,
    activeSpecStep,
    activeRefinement,
    activeStage,
    isBusy,
    isDeletingInitiative,
    busyAction,
    drawerState,
    drafts,
    savedDrafts,
    draftSaveState,
    refinementAnswers,
    defaultAnswerQuestionIds,
    refinementAssumptions,
    refinementSaveState,
    guidanceQuestionId,
    guidanceText,
    reviewOverrideKind,
    reviewOverrideReason,
    setReviewOverrideReason,
    ticketCoverageArtifact,
    ticketCoverageReview,
    uncoveredCoverageItems,
    coveredCoverageCount,
    initiativeTickets,
    linkedRuns,
    hasActiveContent,
    hasRefinementQuestions,
    hasPhaseSpecificRefinementDecisions,
    unresolvedQuestionCount,
    nextStep,
    autoQuestionLoadStep,
    autoQuestionLoadFailedStep,
    navigateToStep,
    setActiveSurface,
    handleGenerateSpec,
    handleCheckAndAdvance,
    handleGenerateTickets,
    handleRequestGuidance,
    handleRunReview,
    handleOverrideReview,
    setReviewOverride,
    clearReviewOverride,
    handleDeleteInitiative,
    handlePhaseRename,
    openTicket,
    updateDraft,
    updateRefinementAnswer,
    deferRefinementQuestion,
    openEditDrawer,
    closeDrawer
  } = workspace;
  const generatingKey = useMemo<PipelineNodeKey | null>(() => {
    if (!busyAction?.startsWith("generate-")) {
      return null;
    }

    return busyAction.replace("generate-", "") as PipelineNodeKey;
  }, [busyAction]);
  const progressModel = useMemo(
    () =>
      initiative
        ? getInitiativeProgressModel(initiative, snapshot, {
        currentKey: activeStep,
        generatingKey
      })
        : null,
    [activeStep, generatingKey, initiative, snapshot]
  );
  if (!initiative || !progressModel) {
    return (
      <section>
        <h2>Initiative not found</h2>
      </section>
    );
  }

  const renderDrawer = () => {
    if (!drawerState) {
      return null;
    }

    const label = INITIATIVE_WORKFLOW_LABELS[drawerState.step];

    if (drawerState.type === "document") {
      return (
        <SideDrawer
          open
          title={label}
          headerActions={
            <button type="button" className="btn-primary" onClick={() => openEditDrawer(drawerState.step)} disabled={isBusy}>
              Edit
            </button>
          }
          onClose={closeDrawer}
        >
          <div className="planning-drawer-document">
            <MarkdownView content={savedDrafts[drawerState.step]} />
          </div>
        </SideDrawer>
      );
    }

    if (drawerState.type === "edit") {
      return (
        <SideDrawer
          open
          title={`Edit ${label.toLowerCase()}`}
          headerActions={renderSaveState(draftSaveState[drawerState.step])}
          onClose={closeDrawer}
        >
          <textarea
            className="multiline planning-drawer-textarea textarea-lg"
            value={drafts[drawerState.step]}
            onChange={(event) => updateDraft(event.target.value)}
          />
        </SideDrawer>
      );
    }

    if (drawerState.type === "refinement") {
      return (
        <SideDrawer
          open
          title={`Revise ${label.toLowerCase()} answers`}
          headerActions={renderSaveState(refinementSaveState)}
          onClose={closeDrawer}
        >
          {activeRefinement && activeRefinement.questions.length > 0 ? (
            <div className="planning-drawer-refinement">
              <RefinementSection
                activeSpecStep={drawerState.step}
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
                saveStateIndicator={renderSaveState(refinementSaveState)}
                variant="compact"
                onRequestGuidance={handleRequestGuidance}
                onAnswerChange={updateRefinementAnswer}
                onAnswerLater={deferRefinementQuestion}
              />
              <div className="planning-step-actions planning-step-actions-centered">
                {unresolvedQuestionCount === 0 ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleGenerateSpec(drawerState.step)}
                    disabled={isBusy}
                  >
                    {busyAction === `generate-${drawerState.step}` ? "Updating..." : `Update ${label.toLowerCase()}`}
                  </button>
                ) : null}
              </div>
            </div>
          ) : busyAction === `check-${drawerState.step}` ? (
            <div className="status-loading-card" role="status" aria-live="polite">
              <span className="status-loading-spinner" aria-hidden="true" />
              <div className="status-loading-copy">
                <strong>Loading choices</strong>
                <span>SpecFlow is checking whether this step needs more input.</span>
              </div>
            </div>
          ) : (
            <div className="planning-step-card planning-step-card-quiet">
              <p className="ticket-empty-note">No answers need revising right now.</p>
              <div className="planning-step-actions planning-step-actions-centered">
                <button type="button" onClick={() => openEditDrawer(drawerState.step)}>
                  Edit text
                </button>
              </div>
            </div>
          )}
        </SideDrawer>
      );
    }
  };

  const renderSpecWorkspace = () => {
    if (!activeSpecStep) {
      return null;
    }

    return (
      <PlanningSpecSection
        initiativeId={initiative.id}
        initiativeTitle={headerTitle}
        activeSpecStep={activeSpecStep}
        activeSurface={activeSurface}
        activeRefinement={activeRefinement}
        busyAction={busyAction}
        isBusy={isBusy}
        isDeletingInitiative={isDeletingInitiative}
        hasActiveContent={hasActiveContent}
        hasRefinementQuestions={hasRefinementQuestions}
        hasPhaseSpecificRefinementDecisions={hasPhaseSpecificRefinementDecisions}
        unresolvedQuestionCount={unresolvedQuestionCount}
        nextStep={nextStep}
        refinementAnswers={refinementAnswers}
        defaultAnswerQuestionIds={defaultAnswerQuestionIds}
        refinementAssumptions={refinementAssumptions}
        refinementSaveState={refinementSaveState}
          guidanceQuestionId={guidanceQuestionId}
          guidanceText={guidanceText}
          savedDrafts={savedDrafts}
          autoQuestionLoadStep={autoQuestionLoadStep}
        autoQuestionLoadFailedStep={autoQuestionLoadFailedStep}
        onRefresh={onRefresh}
        navigateToStep={navigateToStep}
        setActiveSurface={setActiveSurface}
        handleCheckAndAdvance={handleCheckAndAdvance}
        handleRequestGuidance={handleRequestGuidance}
        updateRefinementAnswer={updateRefinementAnswer}
        deferRefinementQuestion={deferRefinementQuestion}
        openEditDrawer={openEditDrawer}
        renderSaveState={renderSaveState}
      />
    );
  };

  return (
    <section className="planning-shell">
      <div className="planning-topbar planning-topbar-sticky">
        <div className="planning-topbar-row">
          <div className="planning-breadcrumb">
            <Link to="/">Home</Link>
            <span>/</span>
            <span>{headerTitle}</span>
          </div>
          <button
            type="button"
            className="planning-icon-button planning-icon-button-danger"
            aria-label="Delete initiative"
            title="Delete initiative"
            disabled={isDeletingInitiative}
            onClick={() => void handleDeleteInitiative()}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 4.4h9" />
              <path d="M6.1 4.4V3.2c0-.7.5-1.2 1.2-1.2h1.4c.7 0 1.2.5 1.2 1.2v1.2" />
              <path d="M5.1 4.4v7.3c0 .8.6 1.3 1.3 1.3h3.2c.8 0 1.3-.6 1.3-1.3V4.4" />
              <path d="M6.9 6.5v4.2" />
              <path d="M9.1 6.5v4.2" />
            </svg>
          </button>
        </div>
        <div className="planning-topbar-pipeline">
          <Pipeline
            nodes={progressModel.nodes}
            selectedKey={activeStep}
            onNodeClick={(key) => {
              if (isDeletingInitiative) {
                return;
              }

              if (INITIATIVE_WORKFLOW_STEPS.includes(key as InitiativePlanningStep)) {
                const step = key as InitiativePlanningStep;

                if (!canOpenInitiativeStep(initiative.workflow, initiativeReviews, initiative.id, step)) {
                  return;
                }

                navigateToStep(step, step === activeStep ? activeSurface : null);
                return;
              }

              if ((key === "execute" || key === "verify") && progressModel.nextTicket) {
                openTicket(progressModel.nextTicket.id);
                return;
              }

              if (key === "done" && progressModel.initiativeTickets[0]) {
                openTicket(progressModel.initiativeTickets[0].id);
              }
            }}
          />
        </div>
      </div>

      <div className="planning-content-area">
        {isDeletingInitiative ? (
          <div className="planning-step-column planning-step-column-narrow">
            <div className="status-loading-card planning-intake-loading planning-intake-loading-hero" role="status" aria-live="polite">
              <span className="status-loading-spinner" aria-hidden="true" />
              <div className="status-loading-copy">
                <strong>Deleting initiative</strong>
                <span>SpecFlow is stopping the current work and removing this initiative.</span>
              </div>
            </div>
          </div>
        ) : activeSpecStep ? (
          renderSpecWorkspace()
        ) : (
          <div className="planning-step-column planning-step-column-wide">
            {getPlanningStageCopy("tickets", activeStage) ? (
              <p className="planning-step-copy">{getPlanningStageCopy("tickets", activeStage)}</p>
            ) : null}
            <TicketsStepSection
              initiative={initiative}
              initiativeTickets={initiativeTickets}
              linkedRuns={linkedRuns}
              ticketCoverageArtifact={ticketCoverageArtifact}
              ticketCoverageReview={ticketCoverageReview}
              uncoveredCoverageItems={uncoveredCoverageItems}
              coveredCoverageCount={coveredCoverageCount}
              busyAction={busyAction}
              reviewOverrideKind={reviewOverrideKind}
              reviewOverrideReason={reviewOverrideReason}
              onGenerateTickets={handleGenerateTickets}
              onOpenFirstTicket={openTicket}
              onRunReview={handleRunReview}
              onSetReviewOverride={setReviewOverride}
              onClearReviewOverride={clearReviewOverride}
              onChangeReviewOverrideReason={setReviewOverrideReason}
              onConfirmOverride={handleOverrideReview}
              onCommitPhaseName={handlePhaseRename}
            />
          </div>
        )}
      </div>

      {isDeletingInitiative ? null : renderDrawer()}
    </section>
  );
};
