import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { ArtifactsSnapshot, InitiativePlanningStep } from "../../types.js";
import { ActionMenu } from "../components/action-menu.js";
import { CheckpointGateBanner } from "../components/checkpoint-gate-banner.js";
import { MarkdownView } from "../components/markdown-view.js";
import { PhaseTransitionBanner } from "../components/phase-transition-banner.js";
import { Pipeline } from "../components/pipeline.js";
import { SideDrawer } from "../components/side-drawer.js";
import {
  canOpenInitiativeStep,
  INITIATIVE_WORKFLOW_LABELS,
  INITIATIVE_WORKFLOW_STEPS,
  REVIEWS_BY_STEP
} from "../utils/initiative-workflow.js";
import { getInitiativeProgressModel, type PipelineNodeKey } from "../utils/initiative-progress.js";
import {
  getPlanningGenerateActionLabel,
  getPlanningNextActionLabel,
  getPlanningQuestionActionLabel,
  getPlanningStageCopy
} from "../utils/ui-language.js";
import { ArtifactReviewsSection } from "./initiative/artifact-reviews-section.js";
import { RefinementSection } from "./initiative/refinement-section.js";
import {
  SAVE_STATE_LABELS,
  buildArtifactPreview,
  isResolvedReview,
  type PlanningJourneyStage,
  type SaveState
} from "./initiative/shared.js";
import { TicketsStepSection } from "./initiative/tickets-step-section.js";
import { useInitiativePlanningWorkspace } from "./initiative/use-initiative-planning-workspace.js";

const getStageBadgeLabel = (stage: PlanningJourneyStage): string => {
  if (stage === "complete") {
    return "Done";
  }

  if (stage === "checkpoint") {
    return "Needs review";
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
    unresolvedQuestionCount,
    nextStep,
    unresolvedReviewsForActiveStep,
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
    updateDraft,
    updateRefinementAnswer,
    deferRefinementQuestion,
    openReviewDrawer,
    selectReviewInDrawer,
    openDocumentDrawer,
    openEditDrawer,
    closeDrawer
  } = workspace;

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
        generatingKey
      }),
    [generatingKey, initiative, snapshot]
  );
  const unresolvedReviewByStep = {
    brief: REVIEWS_BY_STEP.brief.find((kind) => !isResolvedReview(getReview(kind))) ?? null,
    "core-flows": REVIEWS_BY_STEP["core-flows"].find((kind) => !isResolvedReview(getReview(kind))) ?? null,
    prd: REVIEWS_BY_STEP.prd.find((kind) => !isResolvedReview(getReview(kind))) ?? null,
    "tech-spec": REVIEWS_BY_STEP["tech-spec"].find((kind) => !isResolvedReview(getReview(kind))) ?? null
  } as const;

  const renderArtifactSummary = () => {
    if (!activeSpecStep || !activePreview) {
      return null;
    }

    const hasPreviewContent = Boolean(activePreview.intro) || activePreview.sections.length > 0;
    if (!hasPreviewContent) {
      return (
        <div className="planning-summary-card">
          <h4>Overview</h4>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            The full document exists, but the summary view could not pull out a cleaner preview.
          </p>
        </div>
      );
    }

    return (
      <div className="planning-summary-grid">
        {activePreview.intro ? (
          <div className="planning-summary-card">
            <h4>Overview</h4>
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
            className="multiline planning-drawer-textarea"
            value={drafts[drawerState.step]}
            onChange={(event) => updateDraft(event.target.value)}
            style={{ minHeight: 420 }}
          />
        </SideDrawer>
      );
    }

    return (
      <SideDrawer
        open
        title={`${label} review`}
        onClose={closeDrawer}
      >
        <ArtifactReviewsSection
          activeSpecStep={drawerState.step}
          busyAction={busyAction}
          reviewOverrideKind={reviewOverrideKind}
          reviewOverrideReason={reviewOverrideReason}
          selectedReviewKind={drawerState.reviewKind}
          getReview={getReview}
          onSelectReview={selectReviewInDrawer}
          onRunReview={handleRunReview}
          onSetReviewOverride={setReviewOverride}
          onClearReviewOverride={clearReviewOverride}
          onChangeReviewOverrideReason={setReviewOverrideReason}
          onConfirmOverride={handleOverrideReview}
        />
      </SideDrawer>
    );
  };

  const renderSpecWorkspace = () => {
    if (!activeSpecStep) {
      return null;
    }

    const refinementCheckedAt = activeRefinement?.checkedAt ?? null;
    const canGenerate = !hasRefinementQuestions || unresolvedQuestionCount === 0;
    const checkpointReviewKind = unresolvedReviewsForActiveStep[0] ?? null;
    const needsIntakeStart = activeStage === "consult" && !refinementCheckedAt && !hasRefinementQuestions;
    const label = INITIATIVE_WORKFLOW_LABELS[activeSpecStep];
    const stageBody = getPlanningStageCopy(activeSpecStep, activeStage);
    const actionMenuItems = [
      {
        label: `Open full ${label.toLowerCase()}`,
        onSelect: () => openDocumentDrawer(activeSpecStep)
      },
      {
        label: `Edit ${label.toLowerCase()}`,
        onSelect: () => openEditDrawer(activeSpecStep)
      },
      {
        label: getPlanningQuestionActionLabel(activeSpecStep, refinementCheckedAt),
        onSelect: () => void handleCheckAndAdvance(activeSpecStep),
        disabled: isBusy
      },
      {
        label: getPlanningGenerateActionLabel(activeSpecStep, true),
        onSelect: () => void handleGenerateSpec(activeSpecStep),
        disabled: isBusy
      }
    ];

    return (
      <div className={`planning-step-column${hasActiveContent ? " planning-step-column-wide" : " planning-step-column-narrow"}`}>
        <div className="planning-step-header">
          <div className="planning-step-title-row">
            <h2>{label}</h2>
            <span className={getStageBadgeClassName(activeStage)}>{getStageBadgeLabel(activeStage)}</span>
          </div>
          {hasActiveContent ? <ActionMenu items={actionMenuItems} /> : renderSaveState(refinementSaveState)}
        </div>

        {!hasActiveContent && stageBody ? <p className="planning-step-copy">{stageBody}</p> : null}

        {!hasActiveContent && needsIntakeStart ? (
          <div className="planning-step-card planning-step-card-quiet">
            <div className="planning-step-actions planning-step-actions-centered">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleCheckAndAdvance(activeSpecStep)}
                disabled={isBusy}
              >
                {busyAction === `check-${activeSpecStep}`
                  ? "Getting questions..."
                  : getPlanningQuestionActionLabel(activeSpecStep, refinementCheckedAt)}
              </button>
            </div>
          </div>
        ) : null}

        {!hasActiveContent && busyAction === `check-${activeSpecStep}` && !activeRefinement && !hasRefinementQuestions ? (
          <div className="planning-step-card planning-step-card-quiet">
            <p className="ticket-empty-note">Getting the questions ready...</p>
          </div>
        ) : null}

        {!hasActiveContent && activeRefinement && hasRefinementQuestions ? (
          <div className="planning-step-card planning-step-card-quiet">
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

        {!hasActiveContent && (activeStage === "draft" || (refinementCheckedAt && !hasRefinementQuestions)) ? (
          <div className="planning-step-actions planning-step-actions-centered">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleGenerateSpec(activeSpecStep)}
              disabled={isBusy || !canGenerate}
            >
              {busyAction === `generate-${activeSpecStep}` ? "Generating..." : getPlanningGenerateActionLabel(activeSpecStep, false)}
            </button>
          </div>
        ) : null}

        {hasActiveContent ? (
          <div className="planning-main-column">
            {activeStage === "checkpoint" || stepStatus === "stale" ? (
              <CheckpointGateBanner
                body={stepStatus === "stale"
                    ? "Something changed. Review it again before you continue."
                    : "Review this before you move on."}
                actionLabel="See issues"
                onAction={
                  checkpointReviewKind ? () => openReviewDrawer(activeSpecStep, checkpointReviewKind) : undefined
                }
                disabled={!checkpointReviewKind}
              />
            ) : null}

            {renderArtifactSummary()}

            {nextStep && unresolvedReviewsForActiveStep.length === 0 ? (
              <PhaseTransitionBanner
                body="Move on when you're ready."
                actionLabel={getPlanningNextActionLabel(nextStep)}
                onAction={() => navigateToStep(nextStep)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
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

                if (!canOpenInitiativeStep(initiative.workflow, initiativeReviews, initiative.id, step)) {
                  return;
                }

                navigateToStep(step);

                if (step !== "tickets") {
                  const unresolvedReviewKind = unresolvedReviewByStep[step];
                  if (unresolvedReviewKind) {
                    openReviewDrawer(step, unresolvedReviewKind);
                  }
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

      {renderDrawer()}
    </section>
  );
};
