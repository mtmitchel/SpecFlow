import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ArtifactsSnapshot, InitiativePlanningStep } from "../../types.js";
import { CheckpointGateBanner } from "../components/checkpoint-gate-banner.js";
import { MarkdownView } from "../components/markdown-view.js";
import { PhaseTransitionBanner } from "../components/phase-transition-banner.js";
import { Pipeline } from "../components/pipeline.js";
import {
  canOpenInitiativeStep,
  INITIATIVE_WORKFLOW_LABELS,
  INITIATIVE_WORKFLOW_STEPS,
  REVIEW_KIND_LABELS
} from "../utils/initiative-workflow.js";
import { getInitiativeProgressModel, type PipelineNodeKey } from "../utils/initiative-progress.js";
import { ArtifactReviewsSection } from "./initiative/artifact-reviews-section.js";
import { RefinementSection } from "./initiative/refinement-section.js";
import {
  PHASE_DESCRIPTIONS,
  SAVE_STATE_LABELS,
  PHASE_TRANSITIONS,
  buildArtifactPreview,
  type PlanningJourneyStage,
  type SaveState
} from "./initiative/shared.js";
import { TicketsStepSection } from "./initiative/tickets-step-section.js";
import { useInitiativePlanningWorkspace } from "./initiative/use-initiative-planning-workspace.js";

const getStageBody = (step: InitiativePlanningStep, stage: PlanningJourneyStage): string => {
  if (stage === "consult") {
    return step === "brief"
      ? "Answer these questions to shape the first brief before anything is generated."
      : `${PHASE_DESCRIPTIONS[step]} SpecFlow needs this context before it can generate the artifact.`;
  }

  if (stage === "draft") {
    return step === "tickets"
      ? "Break the planning set into execution-ready tickets with clear coverage and sequencing."
      : `The intake for ${INITIATIVE_WORKFLOW_LABELS[step].toLowerCase()} is ready. Generate the artifact when you are ready.`;
  }

  if (stage === "checkpoint") {
    return `Review the ${INITIATIVE_WORKFLOW_LABELS[step].toLowerCase()} and clear the remaining blockers before moving forward.`;
  }

  return PHASE_TRANSITIONS[step].body;
};

const getCheckActionLabel = (step: InitiativePlanningStep, checkedAt: string | null): string => {
  if (step === "brief") {
    return checkedAt ? "Refresh brief intake" : "Start brief intake";
  }

  return checkedAt
    ? `Refresh ${INITIATIVE_WORKFLOW_LABELS[step].toLowerCase()} intake`
    : `Start ${INITIATIVE_WORKFLOW_LABELS[step].toLowerCase()} intake`;
};

const getGenerateActionLabel = (step: InitiativePlanningStep, hasContent: boolean): string =>
  hasContent ? `Refresh ${INITIATIVE_WORKFLOW_LABELS[step]}` : `Generate ${INITIATIVE_WORKFLOW_LABELS[step]}`;

const getNextStepActionLabel = (step: InitiativePlanningStep): string =>
  step === "tickets" ? "Continue to tickets" : `Continue to ${INITIATIVE_WORKFLOW_LABELS[step]}`;

const getStageBadgeLabel = (stage: PlanningJourneyStage): string => {
  if (stage === "complete") {
    return "Done";
  }

  if (stage === "checkpoint") {
    return "Checkpoint";
  }

  return "Up next";
};

const getStageBadgeClassName = (stage: PlanningJourneyStage): string => {
  if (stage === "complete") {
    return "planning-step-status planning-step-status-complete";
  }

  if (stage === "checkpoint") {
    return "planning-step-status planning-step-status-checkpoint";
  }

  return "planning-step-status planning-step-status-active";
};

export const InitiativeView = ({
  snapshot,
  onRefresh
}: {
  snapshot: ArtifactsSnapshot;
  onRefresh: () => Promise<void>;
}) => {
  const workspace = useInitiativePlanningWorkspace(snapshot, onRefresh);
  const [artifactViewMode, setArtifactViewMode] = useState<"summary" | "document">("summary");

  const renderSaveState = (state: SaveState) => {
    const label = SAVE_STATE_LABELS[state];
    if (!label) {
      return null;
    }

    return (
      <span style={{ color: state === "error" ? "var(--danger-text)" : "var(--muted)", fontSize: "0.82rem" }}>
        {label}
      </span>
    );
  };

  if (!workspace.initiative) {
    return (
      <section>
        <h2>Initiative not found</h2>
      </section>
    );
  }

  const {
    initiative,
    initiativeReviews,
    getReview,
    headerTitle,
    activeStep,
    activeSpecStep,
    activeRefinement,
    activeStage,
    stepStatus,
    isBusy,
    busyAction,
    editingStep,
    drafts,
    savedDrafts,
    draftSaveState,
    refinementAnswers,
    defaultAnswerQuestionIds,
    refinementAssumptions,
    refinementSaveState,
    guidanceQuestionId,
    guidanceText,
    transitionNotice,
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
    activeContent,
    hasRefinementQuestions,
    unresolvedQuestionCount,
    nextStep,
    unresolvedReviewsForActiveStep,
    blockingReviewBeforeActiveStep,
    navigateToStep,
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
    toggleEditingStep,
    updateDraft,
    updateRefinementAnswer,
    deferRefinementQuestion
  } = workspace;

  useEffect(() => {
    setArtifactViewMode("summary");
  }, [activeStep]);

  const activePreview = useMemo(
    () => (activeSpecStep ? buildArtifactPreview(savedDrafts[activeSpecStep]) : null),
    [activeSpecStep, savedDrafts]
  );
  const generatingKey = useMemo<PipelineNodeKey | null>(() => {
    if (!busyAction?.startsWith("generate-")) {
      return null;
    }

    return busyAction.replace("generate-", "") as PipelineNodeKey;
  }, [busyAction]);
  const progressModel = useMemo(
    () =>
      getInitiativeProgressModel(initiative, snapshot, {
        generatingKey,
      }),
    [generatingKey, initiative, snapshot]
  );

  const openSummaryView = () => {
    if (activeSpecStep && editingStep === activeSpecStep) {
      toggleEditingStep();
    }
    setArtifactViewMode("summary");
  };

  const openDocumentView = () => {
    if (activeSpecStep && editingStep === activeSpecStep) {
      toggleEditingStep();
    }
    setArtifactViewMode("document");
  };

  const openEditView = () => {
    if (!activeSpecStep) {
      return;
    }

    setArtifactViewMode("summary");
    if (editingStep !== activeSpecStep) {
      toggleEditingStep();
    }
  };

  const closeEditView = () => {
    if (!activeSpecStep || editingStep !== activeSpecStep) {
      return;
    }

    toggleEditingStep();
    setArtifactViewMode("summary");
  };

  const renderArtifactSummary = () => {
    if (!activeSpecStep || !activePreview) {
      return null;
    }

    const hasPreviewContent = Boolean(activePreview.intro) || activePreview.sections.length > 0;
    if (!hasPreviewContent) {
      return (
        <div className="planning-summary-card">
          <h4>Summary</h4>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            The document is available, but the summary view could not extract a focused preview.
          </p>
        </div>
      );
    }

    return (
      <div className="planning-summary-grid">
        {activePreview.intro ? (
          <div className="planning-summary-card">
            <h4>Summary</h4>
            <MarkdownView content={activePreview.intro} />
          </div>
        ) : null}
        {activePreview.sections.map((section) => (
          <div key={section.heading} className="planning-summary-card">
            <h4>{section.heading}</h4>
            <MarkdownView content={section.content} />
          </div>
        ))}
      </div>
    );
  };

  const renderSpecWorkspace = () => {
    if (!activeSpecStep) {
      return null;
    }

    const refinementCheckedAt = activeRefinement?.checkedAt ?? null;
    const canGenerate = !hasRefinementQuestions || unresolvedQuestionCount === 0;
    const checkpointReviewKind = unresolvedReviewsForActiveStep[0] ?? null;
    const showReviewCards = activeStage === "checkpoint" || unresolvedReviewsForActiveStep.length > 0;
    const checkpointBody =
      stepStatus === "stale"
        ? `Earlier planning decisions changed. Revisit the ${INITIATIVE_WORKFLOW_LABELS[activeSpecStep].toLowerCase()} before you move on.`
        : `Review the ${INITIATIVE_WORKFLOW_LABELS[activeSpecStep].toLowerCase()} before moving to ${
            nextStep ? INITIATIVE_WORKFLOW_LABELS[nextStep].toLowerCase() : "execution"
          }.`;
    const needsIntakeStart = activeStage === "consult" && !refinementCheckedAt && !hasRefinementQuestions;

    return (
      <div className={`planning-step-column${hasActiveContent ? " planning-step-column-wide" : " planning-step-column-narrow"}`}>
        {!hasActiveContent ? (
          <>
            <div className="planning-step-header">
              <div className="planning-step-title-row">
                <h2>{INITIATIVE_WORKFLOW_LABELS[activeSpecStep]}</h2>
                <span className={getStageBadgeClassName(activeStage)}>{getStageBadgeLabel(activeStage)}</span>
              </div>
              {renderSaveState(refinementSaveState)}
            </div>
            <p className="planning-step-copy">{getStageBody(activeSpecStep, activeStage)}</p>

            {needsIntakeStart ? (
              <div className="planning-step-card">
                <div className="planning-step-actions planning-step-actions-centered">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleCheckAndAdvance(activeSpecStep)}
                    disabled={isBusy}
                  >
                    {busyAction === `check-${activeSpecStep}`
                      ? "Checking..."
                      : getCheckActionLabel(activeSpecStep, refinementCheckedAt)}
                  </button>
                </div>
              </div>
            ) : null}

            {busyAction === `check-${activeSpecStep}` && !activeRefinement && !hasRefinementQuestions ? (
              <div className="planning-step-card">
                <p className="ticket-empty-note">Preparing the {INITIATIVE_WORKFLOW_LABELS[activeSpecStep].toLowerCase()} intake...</p>
              </div>
            ) : null}

            {activeRefinement && hasRefinementQuestions ? (
              <div className="planning-step-card">
                <RefinementSection
                  activeSpecStep={activeSpecStep}
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
              </div>
            ) : null}

            {activeStage === "draft" || (refinementCheckedAt && !hasRefinementQuestions) ? (
              <div className="planning-step-actions planning-step-actions-centered">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleGenerateSpec(activeSpecStep)}
                  disabled={isBusy || !canGenerate}
                >
                  {busyAction === `generate-${activeSpecStep}` ? "Generating..." : getGenerateActionLabel(activeSpecStep, hasActiveContent)}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="planning-main-column">
            <div className="planning-step-header">
              <div className="planning-step-title-row">
                <h2>{INITIATIVE_WORKFLOW_LABELS[activeSpecStep]}</h2>
                <span className={getStageBadgeClassName(activeStage)}>{getStageBadgeLabel(activeStage)}</span>
              </div>
              <div className="planning-view-toggle-group">
                <button
                  type="button"
                  className={artifactViewMode === "summary" && editingStep !== activeSpecStep ? "btn-primary" : undefined}
                  onClick={openSummaryView}
                >
                  Summary
                </button>
                <button
                  type="button"
                  className={artifactViewMode === "document" && editingStep !== activeSpecStep ? "btn-primary" : undefined}
                  onClick={openDocumentView}
                >
                  Document
                </button>
                <button
                  type="button"
                  className={editingStep === activeSpecStep ? "btn-primary" : undefined}
                  onClick={editingStep === activeSpecStep ? closeEditView : openEditView}
                >
                  {editingStep === activeSpecStep ? "Done editing" : "Edit"}
                </button>
              </div>
            </div>

            {activeStage !== "complete" ? <p className="planning-step-copy">{getStageBody(activeSpecStep, activeStage)}</p> : null}

            {activeStage === "checkpoint" || stepStatus === "stale" ? (
              <CheckpointGateBanner
                title={`${INITIATIVE_WORKFLOW_LABELS[activeSpecStep]} checkpoint`}
                body={checkpointBody}
                actionLabel={
                  checkpointReviewKind
                    ? busyAction === `review-${checkpointReviewKind}`
                      ? "Reviewing..."
                      : "Run review"
                    : undefined
                }
                onAction={checkpointReviewKind ? () => void handleRunReview(checkpointReviewKind) : undefined}
                disabled={isBusy || !checkpointReviewKind}
              />
            ) : null}

            <div className="planning-step-secondary-actions">
              <div className="button-row" style={{ marginBottom: 0 }}>
                <button type="button" onClick={() => void handleCheckAndAdvance(activeSpecStep)} disabled={isBusy}>
                  {busyAction === `check-${activeSpecStep}`
                    ? "Checking..."
                    : getCheckActionLabel(activeSpecStep, activeRefinement?.checkedAt ?? null)}
                </button>
                <button type="button" onClick={() => void handleGenerateSpec(activeSpecStep)} disabled={isBusy}>
                  {busyAction === `generate-${activeSpecStep}`
                    ? "Refreshing..."
                    : getGenerateActionLabel(activeSpecStep, hasActiveContent)}
                </button>
              </div>
              {editingStep === activeSpecStep ? renderSaveState(draftSaveState[activeSpecStep]) : null}
            </div>

            {editingStep === activeSpecStep ? (
              <textarea
                className="multiline"
                value={activeContent}
                onChange={(event) => updateDraft(event.target.value)}
                style={{ minHeight: 360 }}
              />
            ) : artifactViewMode === "document" ? (
              <div className="planning-document-view">
                <MarkdownView content={savedDrafts[activeSpecStep]} />
              </div>
            ) : (
              renderArtifactSummary()
            )}

            {nextStep && unresolvedReviewsForActiveStep.length === 0 ? (
              <PhaseTransitionBanner
                title={`${INITIATIVE_WORKFLOW_LABELS[activeSpecStep]} ready`}
                body={PHASE_TRANSITIONS[activeSpecStep].body}
                actionLabel={getNextStepActionLabel(nextStep)}
                onAction={() => navigateToStep(nextStep)}
              />
            ) : null}

            {showReviewCards ? (
              <ArtifactReviewsSection
                activeSpecStep={activeSpecStep}
                busyAction={busyAction}
                reviewOverrideKind={reviewOverrideKind}
                reviewOverrideReason={reviewOverrideReason}
                getReview={getReview}
                onRunReview={handleRunReview}
                onSetReviewOverride={setReviewOverride}
                onClearReviewOverride={clearReviewOverride}
                onChangeReviewOverrideReason={setReviewOverrideReason}
                onConfirmOverride={handleOverrideReview}
              />
            ) : null}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="planning-shell">
      <div className="planning-topbar">
        <div className="planning-topbar-row">
          <div className="planning-breadcrumb">
            <Link to="/">Home</Link>
            <span>/</span>
            <span>{headerTitle}</span>
          </div>
          <button type="button" className="btn-danger-subtle" onClick={() => void handleDeleteInitiative()}>
            Delete initiative
          </button>
        </div>
        <div className="planning-topbar-pipeline">
          <Pipeline
            nodes={progressModel.nodes}
            selectedKey={activeStep}
            onNodeClick={(key) => {
              if (INITIATIVE_WORKFLOW_STEPS.includes(key as InitiativePlanningStep)) {
                const step = key as InitiativePlanningStep;
                if (canOpenInitiativeStep(initiative.workflow, initiativeReviews, initiative.id, step)) {
                  navigateToStep(step);
                }
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
        {transitionNotice ? (
          <PhaseTransitionBanner title={transitionNotice.heading} body={transitionNotice.body} />
        ) : null}

        {blockingReviewBeforeActiveStep ? (
          <CheckpointGateBanner
            title="Earlier checkpoint still blocks this step"
            body={`Resolve "${REVIEW_KIND_LABELS[blockingReviewBeforeActiveStep]}" before moving further into ${INITIATIVE_WORKFLOW_LABELS[activeStep].toLowerCase()}.`}
          />
        ) : null}

        {activeSpecStep ? (
          renderSpecWorkspace()
        ) : (
          <div className="planning-step-column planning-step-column-wide">
            <div className="planning-step-header">
              <div className="planning-step-title-row">
                <h2>Tickets</h2>
                <span className={getStageBadgeClassName(activeStage)}>{getStageBadgeLabel(activeStage)}</span>
              </div>
            </div>
            <p className="planning-step-copy">{getStageBody("tickets", activeStage)}</p>
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
    </section>
  );
};
