import {
  buildRequiredBriefConsultationResult,
} from "../../packages/app/src/planner/brief-consultation.js";
import { PlannerService, type GeneratedPhaseResult } from "../../packages/app/src/planner/planner-service.js";
import type { LlmClient } from "../../packages/app/src/llm/client.js";
import type {
  Initiative,
  InitiativeArtifactStep,
  InitiativePlanningQuestion,
  PlanningReviewArtifact,
  PlanningReviewKind,
  Ticket,
  TicketCoverageItem,
} from "../../packages/app/src/types/entities.js";
import type { PhaseCheckResult, PlanResult, RefinementStep } from "../../packages/app/src/planner/types.js";
import {
  completeWorkflowStep,
  getRefinementAssumptions,
  updateRefinementState,
} from "../../packages/app/src/planner/workflow-state.js";
import { ArtifactStore } from "../../packages/app/src/store/artifact-store.js";
import { buildTicketCoverageArtifact } from "../../packages/app/src/planner/ticket-coverage.js";
import { AUTO_REVIEW_KINDS_BY_STEP } from "../../packages/app/src/planner/planning-reviews.js";
import { REVIEW_KIND_LABELS, REVIEW_KIND_SOURCE_STEPS } from "../../packages/app/src/planner/workflow-contract.js";
import { E2E_NOTE_FILE } from "./constants.ts";

const UNUSED_LLM_CLIENT: LlmClient = {
  complete: async () => {
    throw new Error("The E2E fake runtime must not call the live LLM.");
  },
};

const E2E_PHASE_QUESTIONS: Record<Exclude<RefinementStep, "brief">, InitiativePlanningQuestion[]> = {
  "core-flows": [
    {
      id: "core-flows-main-journey",
      label: "What should the main flow cover first?",
      type: "select",
      whyThisBlocks: "Core flows need one primary journey before the rest of the flow map can stay focused.",
      affectedArtifact: "core-flows",
      decisionType: "journey",
      options: [
        "Create, edit, and keep notes on the local machine",
        "Search and organize an existing note library",
        "Import notes from another app before editing",
      ],
      optionHelp: {
        "Create, edit, and keep notes on the local machine":
          "Start with the note-writing loop and keep the first version centered on local use.",
        "Search and organize an existing note library":
          "Lead with retrieval, organization, and quick recall before deeper editing behavior.",
        "Import notes from another app before editing":
          "Treat migration from an existing tool as the first-run path that shapes the product.",
      },
      recommendedOption: "Create, edit, and keep notes on the local machine",
      allowCustomAnswer: true,
      assumptionIfUnanswered: "Assume the first flow is creating and editing notes locally.",
    },
  ],
  prd: [
    {
      id: "prd-v1-scope",
      label: "What has to be true in v1?",
      type: "select",
      whyThisBlocks: "The PRD needs one clear product boundary before it can lock the first release scope.",
      affectedArtifact: "prd",
      decisionType: "scope",
      options: [
        "Local note capture, editing, and search all ship together",
        "Capture and editing ship first, with search staying basic",
        "Editing quality comes first, even if search stays out of scope",
      ],
      optionHelp: {
        "Local note capture, editing, and search all ship together":
          "Treat the first release as a complete local note workflow.",
        "Capture and editing ship first, with search staying basic":
          "Keep search light and focus on the authoring experience.",
        "Editing quality comes first, even if search stays out of scope":
          "Narrow the first release to drafting and revision quality.",
      },
      recommendedOption: "Capture and editing ship first, with search staying basic",
      allowCustomAnswer: true,
      assumptionIfUnanswered: "Assume v1 ships local note capture and editing with a basic search experience.",
    },
  ],
  "tech-spec": [
    {
      id: "tech-spec-persistence",
      label: "What implementation constraint matters most?",
      type: "select",
      whyThisBlocks: "The tech spec needs one implementation guardrail before it can make the build plan concrete.",
      affectedArtifact: "tech-spec",
      decisionType: "persistence",
      options: [
        "Notes stay local and readable on disk",
        "The app has to work offline first",
        "The app must be easy to extend later",
      ],
      optionHelp: {
        "Notes stay local and readable on disk":
          "Keep storage choices simple, local, and easy to inspect.",
        "The app has to work offline first":
          "Treat local-first behavior and resilient offline editing as the top technical constraint.",
        "The app must be easy to extend later":
          "Favor modular structure and clean seams over early optimization.",
      },
      recommendedOption: "Notes stay local and readable on disk",
      allowCustomAnswer: true,
      assumptionIfUnanswered: "Assume notes stay local and readable on disk.",
    },
  ],
};

const E2E_CORE_FLOWS_UPDATE_QUESTION: InitiativePlanningQuestion = {
  id: "core-flows-empty-note",
  label: "How should the app handle notes that are created but left empty?",
  type: "select",
  whyThisBlocks: "The updated core flows still need one explicit empty-note branch before the revised flow can stay coherent.",
  affectedArtifact: "core-flows",
  decisionType: "branch",
  options: [
    "Keep empty notes (visible in list)",
    "Move empty notes to Trash automatically",
    "Prompt user to discard empty note on close",
  ],
  optionHelp: {
    "Keep empty notes (visible in list)":
      "Treat empty notes as valid items that remain in the list until the user deletes them.",
    "Move empty notes to Trash automatically":
      "Treat empty notes as recoverable clutter that should leave the main list automatically.",
    "Prompt user to discard empty note on close":
      "Make the user confirm whether an empty note should be discarded before leaving.",
  },
  recommendedOption: "Move empty notes to Trash automatically",
  allowCustomAnswer: true,
  assumptionIfUnanswered: "Assume empty notes move to Trash automatically.",
  reopensQuestionIds: ["core-flows-main-journey"],
};

const createPassedReview = (
  initiative: Initiative,
  kind: PlanningReviewKind,
  nowIso: string,
): PlanningReviewArtifact => ({
  id: `${initiative.id}:${kind}`,
  initiativeId: initiative.id,
  kind,
  status: "passed",
  summary: `${REVIEW_KIND_LABELS[kind]} passed.`,
  findings: [],
  sourceUpdatedAts: Object.fromEntries(
    REVIEW_KIND_SOURCE_STEPS[kind].map((step) => [
      step,
      initiative.workflow.steps[step].updatedAt ?? nowIso,
    ]),
  ),
  overrideReason: null,
  reviewedAt: nowIso,
  updatedAt: nowIso,
});

const hasResolvedQuestions = (
  initiative: Initiative,
  step: RefinementStep,
  questions: InitiativePlanningQuestion[],
): boolean => questions.every((question) => {
  const answer = initiative.workflow.refinements[step].answers[question.id];
  const hasAnswer =
    typeof answer === "boolean" ||
    (typeof answer === "string" && answer.trim().length > 0) ||
    (Array.isArray(answer) && answer.some((value) => value.trim().length > 0));

  return hasAnswer || initiative.workflow.refinements[step].defaultAnswerQuestionIds.includes(question.id);
});

const ensureSpecId = (initiative: Initiative, step: InitiativeArtifactStep): Initiative =>
  initiative.specIds.includes(`${initiative.id}:${step}`)
    ? initiative
    : {
        ...initiative,
        specIds: [...initiative.specIds, `${initiative.id}:${step}`],
      };

const getPhaseQuestions = (
  initiative: Initiative,
  step: RefinementStep,
): InitiativePlanningQuestion[] => {
  if (step === "brief") {
    return buildRequiredBriefConsultationResult().questions;
  }

  if (step === "core-flows" && initiative.specIds.includes(`${initiative.id}:core-flows`)) {
    const mainJourneyAnswer = initiative.workflow.refinements["core-flows"].answers["core-flows-main-journey"];
    const emptyNoteAnswer = initiative.workflow.refinements["core-flows"].answers[E2E_CORE_FLOWS_UPDATE_QUESTION.id];
    const usedDefaultForEmptyNote = initiative.workflow.refinements["core-flows"].defaultAnswerQuestionIds.includes(
      E2E_CORE_FLOWS_UPDATE_QUESTION.id,
    );

    if (
      mainJourneyAnswer === "Search and organize an existing note library" &&
      emptyNoteAnswer === undefined &&
      !usedDefaultForEmptyNote
    ) {
      return [E2E_CORE_FLOWS_UPDATE_QUESTION];
    }
  }

  return E2E_PHASE_QUESTIONS[step];
};

const buildPhaseMarkdown = (initiative: Initiative, step: InitiativeArtifactStep): string => {
  if (step === "brief") {
    return [
      "# Brief",
      "",
      "## Outcome",
      `${initiative.title} helps solo writers capture and edit notes locally without a cloud dependency.`,
      "",
      "## Scope",
      "The first release focuses on local note capture, editing, and a focused library view.",
      "",
      "## Success",
      "Writers can keep notes on the machine, reopen them quickly, and stay productive offline.",
      "",
    ].join("\n");
  }

  if (step === "core-flows") {
    const mainJourneyAnswer = initiative.workflow.refinements["core-flows"].answers["core-flows-main-journey"];
    const emptyNoteAnswer = initiative.workflow.refinements["core-flows"].answers[E2E_CORE_FLOWS_UPDATE_QUESTION.id];

    if (mainJourneyAnswer === "Search and organize an existing note library") {
      const emptyNoteHandling =
        emptyNoteAnswer === "Keep empty notes (visible in list)"
          ? "Empty notes stay visible in the list until the user deletes them."
          : emptyNoteAnswer === "Prompt user to discard empty note on close"
            ? "If a created note is still empty when the user leaves it, the app asks whether to discard it."
            : "If a created note is still empty when the user leaves it, the app moves it to Trash automatically.";

      return [
        "# Core flows",
        "",
        "## Main flow",
        "1. Search the local note library.",
        "2. Open a note from the list.",
        "3. Edit the note and keep changes local.",
        "",
        "## Empty-note handling",
        emptyNoteHandling,
        "",
      ].join("\n");
    }

    return [
      "# Core flows",
      "",
      "## Main flow",
      "1. Create a note.",
      "2. Edit the note.",
      "3. Reopen the note from the local library.",
      "",
      "## Alternate path",
      "If a note was left half-finished, the app restores it without losing local edits.",
      "",
    ].join("\n");
  }

  if (step === "prd") {
    return [
      "# PRD",
      "",
      "## Requirements",
      "- Users can create, edit, and reopen local notes.",
      "- The app keeps the latest note content on disk.",
      "- Search remains lightweight in v1.",
      "",
      "## Non-goals",
      "- Multi-user sync",
      "- Cloud collaboration",
      "",
    ].join("\n");
  }

  return [
    "# Tech spec",
    "",
    "## Decisions",
    "- Keep note persistence local and readable on disk.",
    "- Use a small note store module for save and load behavior.",
    "",
    "## Verification hooks",
    "- Verify that saving a note updates the local store output.",
    "",
  ].join("\n");
};

export class E2ePlannerService extends PlannerService {
  private readonly storeRef: ArtifactStore;

  public constructor(rootDir: string, store: ArtifactStore) {
    super({
      rootDir,
      store,
      llmClient: UNUSED_LLM_CLIENT,
    });
    this.storeRef = store;
  }

  public override async runPhaseCheckJob(
    input: { initiativeId: string; step: RefinementStep },
  ): Promise<PhaseCheckResult> {
    const initiative = this.storeRef.initiatives.get(input.initiativeId);
    if (!initiative) {
      throw new Error(`Initiative ${input.initiativeId} not found`);
    }

    const phaseQuestions = getPhaseQuestions(initiative, input.step);

    const shouldAsk = phaseQuestions.length > 0 && !hasResolvedQuestions(initiative, input.step, phaseQuestions);
    const result: PhaseCheckResult = shouldAsk
      ? {
          decision: "ask",
          questions: phaseQuestions,
          assumptions: [],
        }
      : {
          decision: "proceed",
          questions: [],
          assumptions: getRefinementAssumptions(initiative.workflow, input.step),
        };

    const nowIso = new Date().toISOString();
    await this.storeRef.upsertInitiative({
      ...initiative,
      workflow: updateRefinementState(initiative.workflow, input.step, {
        questions: result.questions,
        answers: initiative.workflow.refinements[input.step].answers,
        defaultAnswerQuestionIds: initiative.workflow.refinements[input.step].defaultAnswerQuestionIds,
        baseAssumptions: result.assumptions,
        checkedAt: nowIso,
      }),
      updatedAt: nowIso,
    });

    return result;
  }

  public override async runBriefJob(input: { initiativeId: string }): Promise<GeneratedPhaseResult> {
    return this.persistArtifact(input.initiativeId, "brief");
  }

  public override async runCoreFlowsJob(input: { initiativeId: string }): Promise<GeneratedPhaseResult> {
    return this.persistArtifact(input.initiativeId, "core-flows");
  }

  public override async runPrdJob(input: { initiativeId: string }): Promise<GeneratedPhaseResult> {
    return this.persistArtifact(input.initiativeId, "prd");
  }

  public override async runTechSpecJob(input: { initiativeId: string }): Promise<GeneratedPhaseResult> {
    return this.persistArtifact(input.initiativeId, "tech-spec");
  }

  public override async runPlanningReviewJob(
    input: { initiativeId: string; kind: PlanningReviewKind },
  ): Promise<PlanningReviewArtifact> {
    const initiative = this.storeRef.initiatives.get(input.initiativeId);
    if (!initiative) {
      throw new Error(`Initiative ${input.initiativeId} not found`);
    }

    const nowIso = new Date().toISOString();
    const review = createPassedReview(initiative, input.kind, nowIso);
    await this.storeRef.upsertPlanningReview(review);
    return review;
  }

  public override async runPlanJob(input: { initiativeId: string }): Promise<PlanResult> {
    const initiative = this.storeRef.initiatives.get(input.initiativeId);
    if (!initiative) {
      throw new Error(`Initiative ${input.initiativeId} not found`);
    }

    const nowIso = new Date().toISOString();
    const coverageItem: TicketCoverageItem = {
      id: "coverage-prd-requirements-1",
      sourceStep: "prd",
      sectionKey: "requirements",
      sectionLabel: "Requirements",
      kind: "requirement",
      text: "Saving a note updates the local note store.",
    };
    const ticket: Ticket = {
      id: "ticket-1a2b3c4d",
      initiativeId: initiative.id,
      phaseId: "phase-setup",
      title: "Persist local note edits",
      description: "Save note content locally and keep the latest edit available when the app reopens.",
      status: "backlog",
      acceptanceCriteria: [
        {
          id: "criterion-note-save",
          text: "Saving a note updates the local note store.",
        },
      ],
      implementationPlan: [
        "1. Add a small note normalization helper.",
        "2. Save the normalized note through the local note store.",
        "3. Keep the file scope focused on the note store module.",
      ].join("\n"),
      fileTargets: [E2E_NOTE_FILE],
      coverageItemIds: [coverageItem.id],
      blockedBy: [],
      blocks: [],
      runId: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await this.storeRef.upsertTicket(ticket);

    const coverageArtifact = buildTicketCoverageArtifact({
      initiativeId: initiative.id,
      items: [coverageItem],
      uncoveredItemIds: [],
      sourceUpdatedAts: {
        brief: initiative.workflow.steps.brief.updatedAt ?? nowIso,
        "core-flows": initiative.workflow.steps["core-flows"].updatedAt ?? nowIso,
        prd: initiative.workflow.steps.prd.updatedAt ?? nowIso,
        "tech-spec": initiative.workflow.steps["tech-spec"].updatedAt ?? nowIso,
        tickets: nowIso,
      },
      nowIso,
    });
    await this.storeRef.upsertTicketCoverageArtifact(coverageArtifact);

    const updatedInitiative = {
      ...initiative,
      phases: [
        {
          id: "phase-setup",
          name: "Phase 1",
          order: 1,
          status: "active" as const,
        },
      ],
      ticketIds: [ticket.id],
      workflow: completeWorkflowStep(initiative.workflow, "tickets", nowIso),
      updatedAt: nowIso,
    };
    await this.storeRef.upsertInitiative(updatedInitiative);
    await this.storeRef.upsertPlanningReview(
      createPassedReview(updatedInitiative, "ticket-coverage-review", nowIso),
    );

    return {
      phases: [
        {
          name: "Phase 1",
          order: 1,
          tickets: [
            {
              title: ticket.title,
              description: ticket.description,
              acceptanceCriteria: ticket.acceptanceCriteria.map((criterion) => criterion.text),
              fileTargets: [...ticket.fileTargets],
              coverageItemIds: [...ticket.coverageItemIds],
            },
          ],
        },
      ],
      uncoveredCoverageItemIds: [],
    };
  }

  private async persistArtifact(
    initiativeId: string,
    step: InitiativeArtifactStep,
  ): Promise<GeneratedPhaseResult> {
    const initiative = this.storeRef.initiatives.get(initiativeId);
    if (!initiative) {
      throw new Error(`Initiative ${initiativeId} not found`);
    }

    const nowIso = new Date().toISOString();
    const markdown = buildPhaseMarkdown(initiative, step);
    const completedInitiative = ensureSpecId({
      ...initiative,
      status: "active",
      workflow: completeWorkflowStep(initiative.workflow, step, nowIso),
      updatedAt: nowIso,
    }, step);

    await this.storeRef.upsertInitiative(completedInitiative, {
      brief: step === "brief" ? markdown : undefined,
      coreFlows: step === "core-flows" ? markdown : undefined,
      prd: step === "prd" ? markdown : undefined,
      techSpec: step === "tech-spec" ? markdown : undefined,
    });

    const reviews = await Promise.all(
      AUTO_REVIEW_KINDS_BY_STEP[step].map(async (kind) => {
        const refreshedInitiative = this.storeRef.initiatives.get(initiativeId);
        if (!refreshedInitiative) {
          throw new Error(`Initiative ${initiativeId} disappeared during review creation`);
        }

        const review = createPassedReview(refreshedInitiative, kind, nowIso);
        await this.storeRef.upsertPlanningReview(review);
        return review;
      }),
    );

    return {
      markdown,
      reviews,
    };
  }
}
