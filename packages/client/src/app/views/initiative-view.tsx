import type { ArtifactsSnapshot } from "../../types.js";
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
  type SaveState
} from "./initiative/shared.js";
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

  return (
    <section>
      <header className="section-header">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem" }}>
          <h2>{headerTitle}</h2>
          <button type="button" className="btn-danger-subtle" onClick={() => void handleDeleteInitiative()}>
            Delete initiative
          </button>
        </div>
        {showHeaderDescription ? <p>{initiative.description}</p> : null}
      </header>

      <div className="tab-row" role="tablist" aria-label="Initiative workflow">
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
              className={isActive ? "tab active" : "tab"}
              disabled={!stepAccessible}
              onClick={() => navigateToStep(step)}
            >
              {INITIATIVE_WORKFLOW_LABELS[step]}
              <span style={{ marginLeft: "0.45rem", fontSize: "0.72rem", color: "var(--muted)" }}>
                {hasReviewGate && status !== "complete" ? "Not ready" : INITIATIVE_WORKFLOW_STATUS_LABELS[status]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="panel">
        <div style={{ display: "grid", gap: "0.25rem", marginBottom: "1rem" }}>
          <h3 style={{ margin: 0 }}>{INITIATIVE_WORKFLOW_LABELS[activeStep]}</h3>
          <p style={{ color: "var(--muted)", margin: 0 }}>{PHASE_DESCRIPTIONS[activeStep]}</p>
        </div>

        {transitionNotice ? (
          <div
            style={{
              border: "1px solid var(--success-border)",
              background: "var(--success-bg)",
              color: "var(--success-text)",
              padding: "0.65rem 0.8rem",
              borderRadius: "var(--radius-md)",
              marginBottom: "1rem"
            }}
          >
            <strong>{transitionNotice.heading}</strong>
            <div>{transitionNotice.body}</div>
          </div>
        ) : null}

        {stepStatus === "stale" ? (
          <div className="status-banner warn">
            This step needs review because an earlier planning decision changed.
          </div>
        ) : null}

        {blockingReviewBeforeActiveStep ? (
          <div className="status-banner warn">
            This phase is gated until "{REVIEW_KIND_LABELS[blockingReviewBeforeActiveStep]}" is resolved.
          </div>
        ) : null}

        {activeSpecStep ? (
          <>
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

            <div className="button-row">
              {!hasActiveContent && !hasRefinementQuestions ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleCheckAndAdvance(activeSpecStep)}
                  disabled={isBusy}
                >
                  {busyAction === `check-${activeSpecStep}` ? "Checking..." : `Create ${INITIATIVE_WORKFLOW_LABELS[activeSpecStep]}`}
                </button>
              ) : null}

              {!hasActiveContent && hasRefinementQuestions ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleGenerateSpec(activeSpecStep)}
                  disabled={isBusy || unresolvedQuestionCount > 0}
                >
                  {busyAction === `generate-${activeSpecStep}` ? "Creating..." : `Create ${INITIATIVE_WORKFLOW_LABELS[activeSpecStep]}`}
                </button>
              ) : null}

              {hasActiveContent ? (
                <>
                  <button type="button" onClick={toggleEditingStep}>
                    {editingStep === activeSpecStep
                      ? `View ${INITIATIVE_WORKFLOW_LABELS[activeSpecStep]}`
                      : `Edit ${INITIATIVE_WORKFLOW_LABELS[activeSpecStep]}`}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleCheckAndAdvance(activeSpecStep)}
                    disabled={isBusy}
                  >
                    {busyAction === `check-${activeSpecStep}` || busyAction === `generate-${activeSpecStep}`
                      ? "Refreshing..."
                      : `Refresh ${INITIATIVE_WORKFLOW_LABELS[activeSpecStep]}`}
                  </button>
                  {nextStep ? (
                    <button
                      type="button"
                      onClick={() => navigateToStep(nextStep)}
                      disabled={unresolvedReviewsForActiveStep.length > 0}
                    >
                      {nextStep === "tickets" ? "Continue to tickets" : `Continue to ${INITIATIVE_WORKFLOW_LABELS[nextStep]}`}
                    </button>
                  ) : null}
                  {editingStep === activeSpecStep ? renderSaveState(draftSaveState[activeSpecStep]) : null}
                </>
              ) : null}
            </div>

            {hasActiveContent ? (
              editingStep === activeSpecStep ? (
                <textarea
                  className="multiline"
                  value={activeContent}
                  onChange={(event) => updateDraft(event.target.value)}
                />
              ) : (
                <MarkdownView content={savedDrafts[activeSpecStep] || "(empty)"} />
              )
            ) : null}

            {hasActiveContent ? (
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
          </>
        ) : null}

        {activeStep === "tickets" ? (
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
        ) : null}
      </div>
    </section>
  );
};
