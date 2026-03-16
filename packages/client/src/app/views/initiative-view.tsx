import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  checkInitiativePhase,
  generateInitiativeBrief,
  generateInitiativeCoreFlows,
  generateInitiativePlan,
  generateInitiativePrd,
  generateInitiativeTechSpec,
  overrideInitiativeReview,
  requestInitiativeClarificationHelp,
  runInitiativeReview,
  saveInitiativeRefinement,
  saveInitiativeSpecs,
  updateInitiativePhases
} from "../../api.js";
import { deleteInitiative } from "../../api/initiatives.js";
import type {
  ArtifactsSnapshot,
  InitiativePlanningQuestion,
  InitiativePlanningStep,
  InitiativeArtifactStep,
  PlanningReviewArtifact,
  PlanningReviewFinding,
  PlanningReviewKind
} from "../../types.js";
import { MarkdownView } from "../components/markdown-view.js";
import { MermaidView } from "../components/mermaid-view.js";
import { useToast } from "../context/toast.js";
import { getInitiativeDisplayTitle } from "../utils/initiative-titles.js";
import { getSpecMarkdown } from "../utils/specs.js";
import {
  INITIATIVE_ARTIFACT_STEPS,
  canOpenInitiativeStep,
  getInitiativeResumeStep,
  getNextInitiativeStep,
  INITIATIVE_WORKFLOW_LABELS,
  INITIATIVE_WORKFLOW_STATUS_LABELS,
  INITIATIVE_WORKFLOW_STEPS,
  REQUIRED_REVIEWS_BEFORE_STEP,
  REVIEW_KIND_LABELS,
  REVIEWS_BY_STEP
} from "../utils/initiative-workflow.js";

type SpecStep = InitiativeArtifactStep;
type SaveState = "idle" | "saving" | "saved" | "error";

const PHASE_DESCRIPTIONS: Record<InitiativePlanningStep, string> = {
  brief: "Define the problem, audience, goals, and scope.",
  "core-flows": "Define the primary user journeys and states.",
  prd: "Define how the product should work.",
  "tech-spec": "Define how it should be built.",
  tickets: "Break the work into execution-ready steps."
};

const PHASE_TRANSITIONS: Record<SpecStep | "tickets", { heading: string; body: string }> = {
  brief: {
    heading: "Brief ready",
    body: "The brief now defines the problem, audience, goals, and scope."
  },
  "core-flows": {
    heading: "Core flows ready",
    body: "The primary user journeys and states are ready for product requirements."
  },
  prd: {
    heading: "PRD ready",
    body: "The product requirements are ready for implementation planning."
  },
  "tech-spec": {
    heading: "Tech spec ready",
    body: "The implementation approach is ready to break into tickets."
  },
  tickets: {
    heading: "Tickets ready",
    body: "This initiative is ready for execution."
  }
};

const SAVE_STATE_LABELS: Record<SaveState, string | null> = {
  idle: null,
  saving: "Saving...",
  saved: "Saved",
  error: "Saving failed. Try again."
};

const REVIEW_STATUS_LABELS: Record<PlanningReviewArtifact["status"], string> = {
  passed: "Passed",
  blocked: "Blocked",
  overridden: "Overridden",
  stale: "Needs review"
};

const formatAnswer = (value: string | string[] | boolean | undefined): string => {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string") {
    return value.trim() || "Answer later";
  }

  if (Array.isArray(value) && value.length > 0) {
    return value.join(", ");
  }

  return "Answer later";
};

const isQuestionAnswered = (value: string | string[] | boolean | undefined): boolean => {
  if (typeof value === "boolean") {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some((item) => item.trim().length > 0);
  }

  return false;
};

const isQuestionResolved = (
  question: InitiativePlanningQuestion,
  answers: Record<string, string | string[] | boolean>,
  defaultAnswerQuestionIds: string[]
): boolean =>
  isQuestionAnswered(answers[question.id]) || defaultAnswerQuestionIds.includes(question.id);

const isResolvedReview = (review: PlanningReviewArtifact | undefined): boolean =>
  Boolean(review && (review.status === "passed" || review.status === "overridden"));

const groupReviewFindings = (findings: PlanningReviewFinding[]): Record<PlanningReviewFinding["type"], PlanningReviewFinding[]> => ({
  blocker: findings.filter((finding) => finding.type === "blocker"),
  warning: findings.filter((finding) => finding.type === "warning"),
  "traceability-gap": findings.filter((finding) => finding.type === "traceability-gap"),
  assumption: findings.filter((finding) => finding.type === "assumption"),
  "recommended-fix": findings.filter((finding) => finding.type === "recommended-fix")
});

const SelectChoiceCards = ({
  question,
  value,
  onChange
}: {
  question: InitiativePlanningQuestion;
  value: string | undefined;
  onChange: (nextValue: string) => void;
}) => {
  const options = question.options ?? [];
  const currentValue = value ?? "";
  const hasCustomValue = currentValue !== "" && !options.includes(currentValue) && currentValue !== "Other";
  const otherSelected = currentValue === "Other" || hasCustomValue;

  return (
    <div className="clarification-option-list">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`clarification-option-card clarification-option-button${currentValue === option ? " selected" : ""}`}
          onClick={() => onChange(option)}
        >
          <div className="clarification-option-header">
            <span>{option}</span>
            {question.recommendedOption === option ? (
              <span className="clarification-option-badge">Recommended</span>
            ) : null}
          </div>
          {question.optionHelp?.[option] ? <p>{question.optionHelp[option]}</p> : null}
        </button>
      ))}
      <button
        type="button"
        className={`clarification-option-card clarification-option-button${otherSelected ? " selected" : ""}`}
        onClick={() => onChange(hasCustomValue ? currentValue : "Other")}
      >
        <div className="clarification-option-header">
          <span>Other</span>
        </div>
        <p>Use a custom answer if none of these options fit.</p>
      </button>
      {otherSelected ? (
        <input
          value={hasCustomValue ? currentValue : ""}
          placeholder="Optional custom answer"
          onChange={(event) => onChange(event.target.value || "Other")}
        />
      ) : null}
    </div>
  );
};

const RefinementField = ({
  question,
  value,
  onChange
}: {
  question: InitiativePlanningQuestion;
  value: string | string[] | boolean | undefined;
  onChange: (nextValue: string | string[] | boolean) => void;
}) => {
  if (question.type === "boolean") {
    const otherSelected = typeof value === "string";
    return (
      <div className="clarification-option-list">
        {[
          { label: "Yes", value: true, description: "Use this when the feature or constraint should be included." },
          { label: "No", value: false, description: "Use this when it should stay out of scope or off by default." }
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            className={`clarification-option-card clarification-option-button${value === option.value ? " selected" : ""}`}
            onClick={() => onChange(option.value)}
          >
            <div className="clarification-option-header">
              <span>{option.label}</span>
            </div>
            <p>{option.description}</p>
          </button>
        ))}
        <button
          type="button"
          className={`clarification-option-card clarification-option-button${otherSelected ? " selected" : ""}`}
          onClick={() => onChange(typeof value === "string" && value.trim() ? value : "Other")}
        >
          <div className="clarification-option-header">
            <span>Other</span>
          </div>
          <p>Use a custom answer if yes or no does not fit.</p>
        </button>
        {otherSelected ? (
          <input
            value={typeof value === "string" && value !== "Other" ? value : ""}
            placeholder="Optional custom answer"
            onChange={(event) => onChange(event.target.value || "Other")}
          />
        ) : null}
      </div>
    );
  }

  if (question.type === "select") {
    return (
      <SelectChoiceCards
        question={question}
        value={typeof value === "string" ? value : undefined}
        onChange={onChange}
      />
    );
  }

  if (question.type === "multi-select") {
    const selected = Array.isArray(value) ? value : [];
    const options = question.options ?? [];
    const customValues = selected.filter((item) => !options.includes(item) && item !== "Other");
    const hasOther = selected.includes("Other") || customValues.length > 0;

    return (
      <div className="clarification-option-list">
        {options.map((option) => (
          <label key={option} className="clarification-option-card clarification-option-checkbox">
            <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={(event) => {
                  if (event.target.checked) {
                    onChange([...selected, option]);
                  } else {
                    onChange(selected.filter((item) => item !== option));
                  }
                }}
              />
              <span>{option}</span>
            </span>
            {question.optionHelp?.[option] ? <p>{question.optionHelp[option]}</p> : null}
          </label>
        ))}
        <label className="clarification-option-card clarification-option-checkbox">
          <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={hasOther}
              onChange={(event) => {
                if (event.target.checked) {
                  onChange([...selected.filter((item) => options.includes(item)), "Other"]);
                } else {
                  onChange(selected.filter((item) => options.includes(item)));
                }
              }}
            />
            <span>Other</span>
          </span>
          <p>Use a custom answer if none of these options fit.</p>
        </label>
        {hasOther ? (
          <input
            value={customValues[0] ?? ""}
            placeholder="Optional custom answer"
            onChange={(event) => {
              const baseValues = selected.filter((item) => options.includes(item));
              onChange(event.target.value ? [...baseValues, event.target.value] : [...baseValues, "Other"]);
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <input
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Type your answer"
    />
  );
};

const PhaseNameEditor = ({
  name,
  onCommit
}: {
  name: string;
  onCommit: (nextName: string) => void;
}) => {
  const [localName, setLocalName] = useState(name);

  useEffect(() => {
    setLocalName(name);
  }, [name]);

  return (
    <input
      className="phase-name-input"
      value={localName}
      onChange={(event) => setLocalName(event.target.value)}
      onBlur={() => {
        if (localName !== name) {
          onCommit(localName);
        }
      }}
    />
  );
};

export const InitiativeView = ({
  snapshot,
  onRefresh
}: {
  snapshot: ArtifactsSnapshot;
  onRefresh: () => Promise<void>;
}) => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showError } = useToast();
  const initiative = snapshot.initiatives.find((item) => item.id === params.id);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<SpecStep | null>(null);
  const [drafts, setDrafts] = useState<Record<SpecStep, string>>({
    brief: "",
    "core-flows": "",
    prd: "",
    "tech-spec": ""
  });
  const [draftSaveState, setDraftSaveState] = useState<Record<SpecStep, SaveState>>({
    brief: "idle",
    "core-flows": "idle",
    prd: "idle",
    "tech-spec": "idle"
  });
  const [refinementAnswers, setRefinementAnswers] = useState<Record<string, string | string[] | boolean>>({});
  const [defaultAnswerQuestionIds, setDefaultAnswerQuestionIds] = useState<string[]>([]);
  const [refinementAssumptions, setRefinementAssumptions] = useState<string[]>([]);
  const [refinementSaveState, setRefinementSaveState] = useState<SaveState>("idle");
  const [guidanceQuestionId, setGuidanceQuestionId] = useState<string | null>(null);
  const [guidanceText, setGuidanceText] = useState<string | null>(null);
  const [transitionNotice, setTransitionNotice] = useState<{ heading: string; body: string } | null>(null);
  const [reviewOverrideKind, setReviewOverrideKind] = useState<PlanningReviewKind | null>(null);
  const [reviewOverrideReason, setReviewOverrideReason] = useState("");
  const [showPlanDiagram, setShowPlanDiagram] = useState(false);

  const savedDrafts = useMemo<Record<SpecStep, string>>(() => {
    if (!initiative) {
      return {
        brief: "",
        "core-flows": "",
        prd: "",
        "tech-spec": ""
      };
    }

    return {
      brief: getSpecMarkdown(snapshot.specs, initiative.id, "brief"),
      "core-flows": getSpecMarkdown(snapshot.specs, initiative.id, "core-flows"),
      prd: getSpecMarkdown(snapshot.specs, initiative.id, "prd"),
      "tech-spec": getSpecMarkdown(snapshot.specs, initiative.id, "tech-spec")
    };
  }, [initiative, snapshot.specs]);

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
  }, [editingStep, initiative, savedDrafts]);

  useEffect(() => {
    setShowPlanDiagram(false);
  }, [initiative?.id]);

  if (!initiative) {
    return (
      <section>
        <h2>Initiative not found</h2>
      </section>
    );
  }

  const initiativeReviews = snapshot.planningReviews.filter((item) => item.initiativeId === initiative.id);
  const getReview = (kind: PlanningReviewKind): PlanningReviewArtifact | undefined =>
    initiativeReviews.find((item) => item.kind === kind);
  const reviewBlockedStep =
    INITIATIVE_ARTIFACT_STEPS.find((step) => {
      if (!savedDrafts[step].trim()) {
        return false;
      }

      return REVIEWS_BY_STEP[step].some((kind) => !isResolvedReview(getReview(kind)));
    }) ?? null;
  const requestedStep = searchParams.get("step");
  const resumeStep = reviewBlockedStep ?? getInitiativeResumeStep(initiative.workflow);
  const activeStep =
    canOpenInitiativeStep(initiative.workflow, initiativeReviews, initiative.id, requestedStep)
      ? requestedStep
      : resumeStep;

  useEffect(() => {
    if (requestedStep !== activeStep) {
      setSearchParams({ step: activeStep }, { replace: true });
    }
  }, [activeStep, requestedStep, setSearchParams]);

  const activeSpecStep = activeStep === "tickets" ? null : activeStep;
  const activeRefinement = activeSpecStep ? initiative.workflow.refinements[activeSpecStep] : null;
  const refinementSignature = activeRefinement
    ? JSON.stringify({
        checkedAt: activeRefinement.checkedAt,
        questions: activeRefinement.questions,
        answers: activeRefinement.answers,
        defaultAnswerQuestionIds: activeRefinement.defaultAnswerQuestionIds,
        baseAssumptions: activeRefinement.baseAssumptions
      })
    : "";

  useEffect(() => {
    if (!activeRefinement) {
      setRefinementAnswers({});
      setDefaultAnswerQuestionIds([]);
      setRefinementAssumptions([]);
      setGuidanceQuestionId(null);
      setGuidanceText(null);
      return;
    }

    setRefinementAnswers(activeRefinement.answers);
    setDefaultAnswerQuestionIds(activeRefinement.defaultAnswerQuestionIds);
    setRefinementAssumptions(activeRefinement.baseAssumptions);
    setGuidanceQuestionId(null);
    setGuidanceText(null);
  }, [activeStep, refinementSignature]);

  const initiativeTickets = snapshot.tickets.filter((ticket) => ticket.initiativeId === initiative.id);
  const linkedRuns = snapshot.runs.filter(
    (run) => run.ticketId && initiativeTickets.some((ticket) => ticket.id === run.ticketId)
  );
  const headerTitle = getInitiativeDisplayTitle(initiative.title, initiative.description);
  const showHeaderDescription = headerTitle !== initiative.description;
  const stepStatus = initiative.workflow.steps[activeStep].status;
  const isBusy = busyAction !== null;
  const hasActiveContent = activeSpecStep ? savedDrafts[activeSpecStep].trim().length > 0 : false;
  const activeContent = activeSpecStep ? drafts[activeSpecStep] : "";
  const hasRefinementQuestions = Boolean(activeRefinement && activeRefinement.questions.length > 0);
  const unresolvedQuestionCount = activeRefinement
    ? activeRefinement.questions.filter(
        (question) => !isQuestionResolved(question, refinementAnswers, defaultAnswerQuestionIds)
      ).length
    : 0;
  const nextStep = getNextInitiativeStep(activeStep);
  const firstTicket = initiativeTickets[0] ?? null;
  const unresolvedReviewsForActiveStep = activeSpecStep
    ? REVIEWS_BY_STEP[activeSpecStep].filter((kind) => !isResolvedReview(getReview(kind)))
    : [];
  const blockingReviewBeforeActiveStep = REQUIRED_REVIEWS_BEFORE_STEP(activeStep).find(
    (kind) => !isResolvedReview(getReview(kind))
  );

  useEffect(() => {
    if (!activeSpecStep || editingStep !== activeSpecStep) {
      return;
    }

    if (drafts[activeSpecStep] === savedDrafts[activeSpecStep]) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setDraftSaveState((current) => ({ ...current, [activeSpecStep]: "saving" }));
      try {
        await saveInitiativeSpecs(initiative.id, activeSpecStep, drafts[activeSpecStep]);
        await onRefresh();
        setDraftSaveState((current) => ({ ...current, [activeSpecStep]: "saved" }));
      } catch (error) {
        showError((error as Error).message ?? `Failed to save ${INITIATIVE_WORKFLOW_LABELS[activeSpecStep]}`);
        setDraftSaveState((current) => ({ ...current, [activeSpecStep]: "error" }));
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [activeSpecStep, drafts, editingStep, initiative.id, onRefresh, savedDrafts, showError]);

  const serverRefinementSignature = activeRefinement
    ? JSON.stringify({
        answers: activeRefinement.answers,
        defaultAnswerQuestionIds: activeRefinement.defaultAnswerQuestionIds
      })
    : "";
  const localRefinementSignature = JSON.stringify({
    answers: refinementAnswers,
    defaultAnswerQuestionIds
  });

  useEffect(() => {
    if (!activeSpecStep || !activeRefinement) {
      return;
    }

    if (localRefinementSignature === serverRefinementSignature) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setRefinementSaveState("saving");
      try {
        const result = await saveInitiativeRefinement(
          initiative.id,
          activeSpecStep,
          refinementAnswers,
          defaultAnswerQuestionIds
        );
        setRefinementAssumptions(result.assumptions);
        await onRefresh();
        setRefinementSaveState("saved");
      } catch (error) {
        showError((error as Error).message ?? "Failed to save answers");
        setRefinementSaveState("error");
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [
    activeRefinement,
    activeSpecStep,
    defaultAnswerQuestionIds,
    initiative.id,
    localRefinementSignature,
    onRefresh,
    refinementAnswers,
    serverRefinementSignature,
    showError
  ]);

  const withBusyAction = async (action: string, run: () => Promise<void>) => {
    setBusyAction(action);
    try {
      await run();
    } catch (err) {
      showError((err as Error).message ?? "Initiative action failed");
    } finally {
      setBusyAction(null);
    }
  };

  const navigateToStep = (step: InitiativePlanningStep): void => {
    setSearchParams({ step });
  };

  const generateSpec = async (step: SpecStep): Promise<void> => {
    const result =
      step === "brief"
        ? await generateInitiativeBrief(initiative.id)
        : step === "core-flows"
          ? await generateInitiativeCoreFlows(initiative.id)
          : step === "prd"
            ? await generateInitiativePrd(initiative.id)
            : await generateInitiativeTechSpec(initiative.id);

    await onRefresh();
    setEditingStep(null);
    setDraftSaveState((current) => ({ ...current, [step]: "saved" }));
    setTransitionNotice(PHASE_TRANSITIONS[step]);
    const followingStep = getNextInitiativeStep(step);
    const reviewsResolved = result.reviews.every((review) => review.status === "passed" || review.status === "overridden");
    if (followingStep && reviewsResolved) {
      navigateToStep(followingStep);
    }
  };

  const handleGenerateSpec = async (step: SpecStep): Promise<void> => {
    await withBusyAction(`generate-${step}`, async () => {
      await generateSpec(step);
    });
  };

  const handleCheckAndAdvance = async (step: SpecStep): Promise<void> => {
    await withBusyAction(`check-${step}`, async () => {
      const result = await checkInitiativePhase(initiative.id, step);
      await onRefresh();
      setRefinementAssumptions(result.assumptions);

      if (result.decision === "proceed") {
        setBusyAction(`generate-${step}`);
        await generateSpec(step);
      }
    });
  };

  const handleGenerateTickets = async (): Promise<void> => {
    await withBusyAction("generate-tickets", async () => {
      await generateInitiativePlan(initiative.id);
      await onRefresh();
      setTransitionNotice(PHASE_TRANSITIONS.tickets);
    });
  };

  const handleRequestGuidance = async (questionId: string): Promise<void> => {
    await withBusyAction("refinement-help", async () => {
      const result = await requestInitiativeClarificationHelp(initiative.id, questionId, "");
      setGuidanceQuestionId(questionId);
      setGuidanceText(result.guidance);
    });
  };

  const handleRunReview = async (kind: PlanningReviewKind): Promise<void> => {
    await withBusyAction(`review-${kind}`, async () => {
      const review = await runInitiativeReview(initiative.id, kind);
      await onRefresh();
      if (activeSpecStep && REVIEWS_BY_STEP[activeSpecStep].every((reviewKind) => {
        const currentReview = reviewKind === kind ? review : getReview(reviewKind);
        return currentReview && (currentReview.status === "passed" || currentReview.status === "overridden");
      })) {
        const followingStep = getNextInitiativeStep(activeSpecStep);
        if (followingStep) {
          setTransitionNotice(PHASE_TRANSITIONS[activeSpecStep]);
          navigateToStep(followingStep);
        }
      }
    });
  };

  const handleOverrideReview = async (kind: PlanningReviewKind): Promise<void> => {
    await withBusyAction(`override-${kind}`, async () => {
      await overrideInitiativeReview(initiative.id, kind, reviewOverrideReason.trim());
      const remainingUnresolved =
        activeSpecStep
          ? REVIEWS_BY_STEP[activeSpecStep].filter(
              (reviewKind) => reviewKind !== kind && !isResolvedReview(getReview(reviewKind))
            )
          : [];
      setReviewOverrideKind(null);
      setReviewOverrideReason("");
      await onRefresh();
      if (activeSpecStep && remainingUnresolved.length === 0) {
        const followingStep = getNextInitiativeStep(activeSpecStep);
        if (followingStep) {
          navigateToStep(followingStep);
        }
      }
    });
  };

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

  return (
    <section>
      <header className="section-header">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem" }}>
          <h2>{headerTitle}</h2>
          <button
            type="button"
            className="btn-danger-subtle"
            onClick={async () => {
              if (!window.confirm(`Delete initiative "${headerTitle}"? This cannot be undone.`)) {
                return;
              }
              try {
                await deleteInitiative(initiative.id);
                await onRefresh();
                navigate("/");
              } catch (err) {
                showError((err as Error).message);
              }
            }}
          >
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
          const hasReviewGate = REQUIRED_REVIEWS_BEFORE_STEP(step).some((kind) => !isResolvedReview(getReview(kind)));
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
            {hasRefinementQuestions ? (
              <div className="clarification-review">
                <div className="clarification-progress">
                  {activeRefinement?.questions.length} question{activeRefinement?.questions.length === 1 ? "" : "s"} before the{" "}
                  {INITIATIVE_WORKFLOW_LABELS[activeSpecStep].toLowerCase()}
                </div>
                <div className="button-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  {renderSaveState(refinementSaveState)}
                  {unresolvedQuestionCount > 0 ? (
                    <span style={{ color: "var(--warning)", fontSize: "0.82rem" }}>
                      Answer {unresolvedQuestionCount} more question{unresolvedQuestionCount === 1 ? "" : "s"} or use a default assumption.
                    </span>
                  ) : null}
                </div>
                {activeRefinement?.questions.map((question) => {
                  const usingDefault = defaultAnswerQuestionIds.includes(question.id) && !isQuestionAnswered(refinementAnswers[question.id]);
                  return (
                    <div key={question.id} className="clarification-card">
                      <div>
                        <div className="clarification-option-header" style={{ marginBottom: "0.35rem" }}>
                          <span>{question.label}</span>
                          <span className="clarification-option-badge">{question.decisionType}</span>
                        </div>
                        <p className="qa-label" style={{ margin: 0 }}>{question.whyThisBlocks}</p>
                      </div>
                      <RefinementField
                        question={question}
                        value={refinementAnswers[question.id]}
                        onChange={(nextValue) => {
                          setRefinementAnswers((current) => ({
                            ...current,
                            [question.id]: nextValue
                          }));
                          setDefaultAnswerQuestionIds((current) => current.filter((id) => id !== question.id));
                          setRefinementSaveState("idle");
                        }}
                      />
                      <div className="button-row">
                        <button
                          type="button"
                          onClick={() => void handleRequestGuidance(question.id)}
                          disabled={isBusy}
                        >
                          {busyAction === "refinement-help" && guidanceQuestionId === question.id ? "Thinking..." : "Get guidance"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRefinementAnswers((current) => {
                              const next = { ...current };
                              delete next[question.id];
                              return next;
                            });
                            setDefaultAnswerQuestionIds((current) =>
                              current.includes(question.id) ? current : [...current, question.id]
                            );
                            setRefinementSaveState("idle");
                          }}
                        >
                          {usingDefault ? "Using default assumption" : "Answer later"}
                        </button>
                      </div>
                      {guidanceQuestionId === question.id && guidanceText ? (
                        <div className="clarification-guidance">
                          <MarkdownView content={guidanceText} />
                        </div>
                      ) : null}
                      {usingDefault ? (
                        <div className="status-banner warn" style={{ marginBottom: 0 }}>
                          Default assumption: {question.assumptionIfUnanswered}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {refinementAssumptions.length > 0 ? (
                  <div className="clarification-help-panel">
                    <span className="qa-label">Current assumptions</span>
                    <ul style={{ margin: 0 }}>
                      {refinementAssumptions.map((assumption) => (
                        <li key={assumption}>{assumption}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
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
                  <button
                    type="button"
                    onClick={() => setEditingStep((current) => (current === activeSpecStep ? null : activeSpecStep))}
                  >
                    {editingStep === activeSpecStep ? `View ${INITIATIVE_WORKFLOW_LABELS[activeSpecStep]}` : `Edit ${INITIATIVE_WORKFLOW_LABELS[activeSpecStep]}`}
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
                  onChange={(event) => {
                    setDrafts((current) => ({
                      ...current,
                      [activeSpecStep]: event.target.value
                    }));
                    setDraftSaveState((current) => ({ ...current, [activeSpecStep]: "idle" }));
                  }}
                />
              ) : (
                <MarkdownView content={savedDrafts[activeSpecStep] || "(empty)"} />
              )
            ) : null}

            {hasActiveContent && activeSpecStep ? (
              <div style={{ display: "grid", gap: "0.85rem", marginTop: "1rem" }}>
                <div style={{ display: "grid", gap: "0.2rem" }}>
                  <h3 style={{ margin: 0 }}>Reviews</h3>
                  <p style={{ margin: 0, color: "var(--muted)" }}>
                    Review this artifact for gaps and traceability before moving forward.
                  </p>
                </div>

                {REVIEWS_BY_STEP[activeSpecStep].map((kind) => {
                  const review = getReview(kind);
                  const grouped = groupReviewFindings(review?.findings ?? []);
                  const blockers = grouped.blocker.length + grouped["traceability-gap"].length;
                  const warnings = grouped.warning.length;
                  const reviewBusy =
                    busyAction === `review-${kind}` || busyAction === `override-${kind}`;
                  const showOverrideForm = reviewOverrideKind === kind;

                  return (
                    <div key={kind} className="clarification-help-panel" style={{ gap: "0.8rem" }}>
                      <div className="clarification-option-header">
                        <span>{REVIEW_KIND_LABELS[kind]}</span>
                        <span className="clarification-option-badge">
                          {REVIEW_STATUS_LABELS[review?.status ?? "stale"]}
                        </span>
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
                        {blockers} blocker{blockers === 1 ? "" : "s"} · {warnings} warning{warnings === 1 ? "" : "s"}
                        {review ? ` · updated ${new Date(review.updatedAt).toLocaleString()}` : " · not run yet"}
                      </div>
                      {review?.summary ? <p style={{ margin: 0 }}>{review.summary}</p> : null}

                      <div className="button-row">
                        <button
                          type="button"
                          onClick={() => void handleRunReview(kind)}
                          disabled={reviewBusy}
                        >
                          {busyAction === `review-${kind}` ? "Reviewing..." : "Run review"}
                        </button>
                        {review?.status === "blocked" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReviewOverrideKind(showOverrideForm ? null : kind);
                              setReviewOverrideReason(review?.overrideReason ?? "");
                            }}
                            disabled={reviewBusy}
                          >
                            {showOverrideForm ? "Cancel override" : "Override blockers"}
                          </button>
                        ) : null}
                      </div>

                      {showOverrideForm ? (
                        <div style={{ display: "grid", gap: "0.55rem" }}>
                          <textarea
                            className="multiline"
                            value={reviewOverrideReason}
                            onChange={(event) => setReviewOverrideReason(event.target.value)}
                            placeholder="Document why you are accepting this risk."
                            rows={3}
                          />
                          <div className="button-row">
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => void handleOverrideReview(kind)}
                              disabled={reviewBusy || reviewOverrideReason.trim().length === 0}
                            >
                              {busyAction === `override-${kind}` ? "Overriding..." : "Confirm override"}
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {review?.overrideReason ? (
                        <div className="status-banner warn" style={{ marginBottom: 0 }}>
                          Override reason: {review.overrideReason}
                        </div>
                      ) : null}

                      {grouped.blocker.length > 0 ? (
                        <div>
                          <span className="qa-label">Blockers</span>
                          <ul style={{ margin: "0.35rem 0 0" }}>
                            {grouped.blocker.map((finding) => (
                              <li key={finding.id}>{finding.message}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {grouped["traceability-gap"].length > 0 ? (
                        <div>
                          <span className="qa-label">Traceability gaps</span>
                          <ul style={{ margin: "0.35rem 0 0" }}>
                            {grouped["traceability-gap"].map((finding) => (
                              <li key={finding.id}>{finding.message}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {grouped.warning.length > 0 ? (
                        <div>
                          <span className="qa-label">Warnings</span>
                          <ul style={{ margin: "0.35rem 0 0" }}>
                            {grouped.warning.map((finding) => (
                              <li key={finding.id}>{finding.message}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {grouped.assumption.length > 0 ? (
                        <div>
                          <span className="qa-label">Assumptions</span>
                          <ul style={{ margin: "0.35rem 0 0" }}>
                            {grouped.assumption.map((finding) => (
                              <li key={finding.id}>{finding.message}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {grouped["recommended-fix"].length > 0 ? (
                        <div>
                          <span className="qa-label">Recommended fixes</span>
                          <ul style={{ margin: "0.35rem 0 0" }}>
                            {grouped["recommended-fix"].map((finding) => (
                              <li key={finding.id}>{finding.message}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {unresolvedReviewsForActiveStep.length > 0 ? (
                  <div className="status-banner warn" style={{ marginBottom: 0 }}>
                    Resolve the remaining reviews before continuing to the next phase.
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {activeStep === "tickets" ? (
          <>
            <div className="button-row">
              <button
                type="button"
                className="btn-primary"
                disabled={isBusy || stepStatus === "complete"}
                onClick={() => void handleGenerateTickets()}
              >
                {busyAction === "generate-tickets"
                  ? "Creating..."
                  : stepStatus === "stale"
                    ? "Refresh tickets"
                    : "Create tickets"}
              </button>
              {firstTicket ? (
                <button type="button" onClick={() => navigate(`/ticket/${firstTicket.id}`)}>
                  Open first ticket
                </button>
              ) : null}
            </div>

            {initiative.phases.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>No tickets yet. Create tickets after the tech spec is ready.</p>
            ) : null}

            {initiative.phases
              .slice()
              .sort((left, right) => left.order - right.order)
              .map((phase) => {
                const phaseTickets = initiativeTickets.filter((ticket) => ticket.phaseId === phase.id);
                return (
                  <div key={phase.id} className="phase-block">
                    <PhaseNameEditor
                      name={phase.name}
                      onCommit={(nextName) => {
                        const nextPhases = initiative.phases.map((item) =>
                          item.id === phase.id ? { ...item, name: nextName } : item
                        );
                        void updateInitiativePhases(initiative.id, nextPhases).then(onRefresh);
                      }}
                    />
                    <ul>
                      {phaseTickets.map((ticket) => (
                        <li key={ticket.id}>
                          <Link to={`/ticket/${ticket.id}`}>{ticket.title}</Link> · {ticket.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}

            {initiative.mermaidDiagram ? (
              <div className="clarification-help-panel" style={{ gap: "0.65rem" }}>
                <div style={{ display: "grid", gap: "0.2rem" }}>
                  <h3 style={{ margin: 0 }}>Dependency diagram</h3>
                  <p style={{ margin: 0, color: "var(--muted)" }}>
                    The phase list above is the source of truth. Open the diagram only if you want a visual dependency map.
                  </p>
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() => setShowPlanDiagram((current) => !current)}
                  >
                    {showPlanDiagram ? "Hide dependency diagram" : "Show dependency diagram"}
                  </button>
                </div>
                {showPlanDiagram ? <MermaidView chart={initiative.mermaidDiagram} /> : null}
              </div>
            ) : null}

            {linkedRuns.length > 0 ? (
              <>
                <h3>Recent runs</h3>
                <ul>
                  {linkedRuns.map((run) => (
                    <li key={run.id}>
                      <Link to={`/run/${run.id}`}>{run.id}</Link> · {run.status}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
};
