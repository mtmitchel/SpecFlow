import { useEffect, useMemo, useState } from "react";
import type { ArtifactsSnapshot, InitiativePlanningStep } from "../../types.js";
import { MarkdownView } from "../components/markdown-view.js";
import {
  canOpenInitiativeStep,
  INITIATIVE_WORKFLOW_LABELS,
  INITIATIVE_WORKFLOW_STATUS_LABELS,
  INITIATIVE_WORKFLOW_STEPS,
  REQUIRED_REVIEWS_BEFORE_STEP,
  REVIEW_KIND_LABELS
} from "../utils/initiative-workflow.js";
import { ArtifactReviewsSection } from "./initiative/artifact-reviews-section.js";
import { RefinementSection } from "./initiative/refinement-section.js";
import {
  PHASE_DESCRIPTIONS,
  SAVE_STATE_LABELS,
  JOURNEY_STAGE_GUIDANCE,
  JOURNEY_STAGE_LABELS,
  buildArtifactPreview,
  type PlanningJourneyStage,
  type SaveState
} from "./initiative/shared.js";
import { TicketsStepSection } from "./initiative/tickets-step-section.js";
import { useInitiativePlanningWorkspace } from "./initiative/use-initiative-planning-workspace.js";

const getStageTitle = (step: InitiativePlanningStep, stage: PlanningJourneyStage): string => {
  const label = INITIATIVE_WORKFLOW_LABELS[step];

  if (stage === "consult") {
    return step === "brief" ? "Start with brief intake" : `Shape the decisions for ${label.toLowerCase()}`;
  }

  if (stage === "draft") {
    return step === "tickets" ? "Break the plan into tickets" : `Generate the ${label.toLowerCase()}`;
  }

  if (stage === "checkpoint") {
    return `Resolve the ${label.toLowerCase()} checkpoint`;
  }

  return `${label} is ready`;
};

const getStageBody = (step: InitiativePlanningStep, stage: PlanningJourneyStage): string => {
  if (stage === "consult") {
    return step === "brief"
      ? "Answer a short intake before SpecFlow writes the first brief. The brief should never appear fully formed from a raw idea."
      : "Use this step to lock the decisions that materially change the next artifact before you generate it.";
  }

  if (stage === "draft") {
    return step === "tickets"
      ? "Turn the planning set into execution-ready tickets with explicit coverage and sequencing."
      : "The decisions for this step are in place. Generate the artifact once the intake looks right.";
  }

  if (stage === "checkpoint") {
    return "The artifact exists, but the checkpoint is still carrying unresolved blockers, stale work, or traceability gaps.";
  }

  return "This step is in shape. Review the summary, then continue when you are ready.";
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

const getTicketStageSummary = (
  hasTickets: boolean,
  coveredCoverageCount: number,
  uncoveredCoverageCount: number,
  linkedRunsCount: number
): string => {
  if (!hasTickets) {
    return "No tickets exist yet. Generate the ticket set once the tech spec is ready.";
  }

  const runSummary =
    linkedRunsCount > 0 ? ` ${linkedRunsCount} linked run${linkedRunsCount === 1 ? "" : "s"} already exist.` : "";
  return `${coveredCoverageCount} covered spec item${coveredCoverageCount === 1 ? "" : "s"}, ${uncoveredCoverageCount} uncovered.${runSummary}`;
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
    showHeaderDescription,
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
  const stepIndex = INITIATIVE_WORKFLOW_STEPS.indexOf(activeStep) + 1;

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

    return (
      <div className="planning-main-column">
        {!hasActiveContent ? (
          <div className="planning-section-card">
            <div className="button-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h4 style={{ margin: 0 }}>Intake</h4>
                <p style={{ margin: "0.25rem 0 0", color: "var(--muted)" }}>
                  Clarify the decisions that shape the {INITIATIVE_WORKFLOW_LABELS[activeSpecStep].toLowerCase()} before you generate it.
                </p>
              </div>
              {renderSaveState(refinementSaveState)}
            </div>

            {activeStage === "consult" ? (
              <div className="button-row">
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
                {refinementCheckedAt ? (
                  <button
                    type="button"
                    onClick={() => void handleGenerateSpec(activeSpecStep)}
                    disabled={isBusy || !canGenerate}
                  >
                    {busyAction === `generate-${activeSpecStep}`
                      ? "Generating..."
                      : getGenerateActionLabel(activeSpecStep, hasActiveContent)}
                  </button>
                ) : null}
              </div>
            ) : null}

            {activeRefinement && hasRefinementQuestions ? (
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
                onRequestGuidance={handleRequestGuidance}
                onAnswerChange={updateRefinementAnswer}
                onAnswerLater={deferRefinementQuestion}
              />
            ) : null}

            {activeStage === "draft" || (refinementCheckedAt && !hasRefinementQuestions) ? (
              <div className="planning-inline-note">
                <span>{refinementAssumptions.length > 0 ? "Intake complete." : "No additional questions are required."}</span>
                <div className="button-row" style={{ marginBottom: 0 }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleGenerateSpec(activeSpecStep)}
                    disabled={isBusy || !canGenerate}
                  >
                    {busyAction === `generate-${activeSpecStep}`
                      ? "Generating..."
                      : getGenerateActionLabel(activeSpecStep, hasActiveContent)}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="planning-section-card">
              <div className="planning-section-header">
                <div>
                  <h4 style={{ margin: 0 }}>{INITIATIVE_WORKFLOW_LABELS[activeSpecStep]}</h4>
                  <p style={{ margin: "0.25rem 0 0", color: "var(--muted)" }}>
                    Summary first. Open the full document only when you need the long-form source.
                  </p>
                </div>
                <div className="button-row planning-view-toggle">
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

              <div className="button-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div className="button-row" style={{ marginBottom: 0 }}>
                  <button
                    type="button"
                    onClick={() => void handleCheckAndAdvance(activeSpecStep)}
                    disabled={isBusy}
                  >
                    {busyAction === `check-${activeSpecStep}`
                      ? "Checking..."
                      : getCheckActionLabel(activeSpecStep, activeRefinement?.checkedAt ?? null)}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGenerateSpec(activeSpecStep)}
                    disabled={isBusy}
                  >
                    {busyAction === `generate-${activeSpecStep}`
                      ? "Refreshing..."
                      : getGenerateActionLabel(activeSpecStep, hasActiveContent)}
                  </button>
                  {nextStep ? (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => navigateToStep(nextStep)}
                      disabled={unresolvedReviewsForActiveStep.length > 0}
                    >
                      {nextStep === "tickets" ? "Continue to tickets" : `Continue to ${INITIATIVE_WORKFLOW_LABELS[nextStep]}`}
                    </button>
                  ) : null}
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
            </div>

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
          </>
        )}
      </div>
    );
  };

  return (
    <section className="planning-shell">
      <header className="section-header planning-shell-header">
        <div className="planning-shell-header-main">
          <div className="planning-shell-kicker">Planning spectrum</div>
          <h2>{headerTitle}</h2>
          {showHeaderDescription ? <p>{initiative.description}</p> : null}
        </div>
        <button type="button" className="btn-danger-subtle" onClick={() => void handleDeleteInitiative()}>
          Delete initiative
        </button>
      </header>

      <div className="planning-shell-grid">
        <aside className="planning-rail">
          <div className="planning-rail-header">
            <span className="planning-rail-step-count">Step {stepIndex} of {INITIATIVE_WORKFLOW_STEPS.length}</span>
            <span className="planning-rail-step-label">{INITIATIVE_WORKFLOW_LABELS[activeStep]}</span>
          </div>

          <div className="planning-rail-list" role="tablist" aria-label="Initiative workflow">
            {INITIATIVE_WORKFLOW_STEPS.map((step) => {
              const status = initiative.workflow.steps[step].status;
              const isActive = step === activeStep;
              const stepAccessible = canOpenInitiativeStep(initiative.workflow, initiativeReviews, initiative.id, step);
              const hasReviewGate = REQUIRED_REVIEWS_BEFORE_STEP(step).some((kind) => {
                const review = getReview(kind);
                return !review || (review.status !== "passed" && review.status !== "overridden");
              });

              return (
                <button
                  key={step}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`planning-rail-item${isActive ? " active" : ""}`}
                  disabled={!stepAccessible}
                  onClick={() => navigateToStep(step)}
                >
                  <span className="planning-rail-item-title">{INITIATIVE_WORKFLOW_LABELS[step]}</span>
                  <span className="planning-rail-item-meta">
                    {hasReviewGate && status !== "complete"
                      ? "Checkpoint pending"
                      : INITIATIVE_WORKFLOW_STATUS_LABELS[status]}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="planning-workspace">
          <div className="planning-stage-card">
            <div className="planning-stage-card-top">
              <div>
                <div className="planning-stage-chip">{JOURNEY_STAGE_LABELS[activeStage]}</div>
                <h3>{getStageTitle(activeStep, activeStage)}</h3>
              </div>
              <div className="planning-stage-step-copy">{PHASE_DESCRIPTIONS[activeStep]}</div>
            </div>
            <p className="planning-stage-body">{getStageBody(activeStep, activeStage)}</p>
            <p className="planning-stage-guidance">{JOURNEY_STAGE_GUIDANCE[activeStage]}</p>

            {transitionNotice ? (
              <div className="planning-inline-note planning-inline-note-success">
                <strong>{transitionNotice.heading}</strong>
                <span>{transitionNotice.body}</span>
              </div>
            ) : null}

            {stepStatus === "stale" ? (
              <div className="planning-inline-note planning-inline-note-warn">
                <span>Earlier planning decisions changed. Revisit this step before moving on.</span>
              </div>
            ) : null}

            {blockingReviewBeforeActiveStep ? (
              <div className="planning-inline-note planning-inline-note-warn">
                <span>
                  This step stays locked until "{REVIEW_KIND_LABELS[blockingReviewBeforeActiveStep]}" is resolved.
                </span>
              </div>
            ) : null}

            {activeStep === "tickets" ? (
              <div className="planning-inline-note">
                <span>
                  {getTicketStageSummary(
                    initiativeTickets.length > 0,
                    coveredCoverageCount,
                    uncoveredCoverageItems.length,
                    linkedRuns.length
                  )}
                </span>
              </div>
            ) : null}
          </div>

          {activeSpecStep ? (
            renderSpecWorkspace()
          ) : (
            <div className="planning-main-column">
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
      </div>
    </section>
  );
};
