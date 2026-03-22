import { StrictMode, useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/http.js";
import type { ArtifactsSnapshot, Initiative } from "../../types.js";
import { InitiativeRouteView } from "./initiative-route-view.js";

const fetchSpecDetailMock = vi.fn();
const checkInitiativePhaseMock = vi.fn();
const generateInitiativeBriefMock = vi.fn();
const generateInitiativeCoreFlowsMock = vi.fn();
const generateInitiativePlanMock = vi.fn();
const saveInitiativeRefinementMock = vi.fn();

vi.mock("../../api.js", async () => {
  const actual = await vi.importActual<typeof import("../../api.js")>("../../api.js");
  return {
    ...actual,
    fetchSpecDetail: (...args: unknown[]) => fetchSpecDetailMock(...args),
    checkInitiativePhase: (...args: unknown[]) => checkInitiativePhaseMock(...args),
    generateInitiativeBrief: (...args: unknown[]) => generateInitiativeBriefMock(...args),
    generateInitiativeCoreFlows: (...args: unknown[]) => generateInitiativeCoreFlowsMock(...args),
    generateInitiativePlan: (...args: unknown[]) => generateInitiativePlanMock(...args),
    saveInitiativeRefinement: (...args: unknown[]) => saveInitiativeRefinementMock(...args),
  };
});

vi.mock("../context/toast.js", () => ({
  useToast: () => ({ showError: vi.fn() })
}));

vi.mock("../context/confirm.js", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(false)
}));

const briefProblemOption = "Automate or speed up a repetitive process";

const initiative: Initiative = {
  id: "initiative-12345678",
  title: "Note App for Linux Fedora",
  description: "Build a Linux note app with fast capture and richer note editing.",
  status: "draft",
  phases: [],
  specIds: [],
  ticketIds: [],
  workflow: {
    activeStep: "brief",
    steps: {
      brief: { status: "ready", updatedAt: null },
      "core-flows": { status: "locked", updatedAt: null },
      prd: { status: "locked", updatedAt: null },
      "tech-spec": { status: "locked", updatedAt: null },
      validation: { status: "locked", updatedAt: null },
      tickets: { status: "locked", updatedAt: null }
    },
    refinements: {
      brief: {
        questions: [
          {
            id: "brief-problem",
            label: "What primary problem should v1 solve?",
            type: "select",
            whyThisBlocks: "One focused problem — not a feature list.",
            affectedArtifact: "brief",
            decisionType: "problem",
            assumptionIfUnanswered: "Focus on the user's primary note-taking problem.",
            options: [
              briefProblemOption,
              "Replace or improve an existing tool or workflow",
              "Build something new that does not exist yet",
              "Fix reliability, correctness, or data quality issues",
              "Meet a new requirement, standard, or constraint"
            ],
            optionHelp: {
              [briefProblemOption]:
                "Treat speed or reduced manual effort as the main outcome."
            },
            recommendedOption: null,
            allowCustomAnswer: true
          },
        ],
        history: [
          {
            id: "brief-problem",
            label: "What primary problem should v1 solve?",
            type: "select",
            whyThisBlocks: "One focused problem — not a feature list.",
            affectedArtifact: "brief",
            decisionType: "problem",
            assumptionIfUnanswered: "Focus on the user's primary note-taking problem.",
            options: [
              briefProblemOption,
              "Replace or improve an existing tool or workflow",
              "Build something new that does not exist yet",
              "Fix reliability, correctness, or data quality issues",
              "Meet a new requirement, standard, or constraint"
            ],
            optionHelp: {
              [briefProblemOption]:
                "Treat speed or reduced manual effort as the main outcome."
            },
            recommendedOption: null,
            allowCustomAnswer: true
          },
        ],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: "2026-03-16T12:05:00.000Z",
      },
      "core-flows": { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null }
    }
  },
  createdAt: "2026-03-16T12:00:00.000Z",
  updatedAt: "2026-03-16T12:00:00.000Z"
};

const snapshot: ArtifactsSnapshot = {
  config: null,
  initiatives: [initiative],
  tickets: [],
  runs: [],
  runAttempts: [],
  specs: [],
  planningReviews: [],
  ticketCoverageArtifacts: []
};

const freshBriefSnapshot: ArtifactsSnapshot = {
  ...snapshot,
  initiatives: [
    {
      ...initiative,
      workflow: {
        ...initiative.workflow,
        refinements: {
          ...initiative.workflow.refinements,
          brief: {
            questions: [],
            history: [],
            answers: {},
            defaultAnswerQuestionIds: [],
            baseAssumptions: [],
            checkedAt: null,
          },
        },
      },
    },
  ],
};

const briefSpec = {
  id: `${initiative.id}:brief`,
  initiativeId: initiative.id,
  type: "brief" as const,
  title: "Brief",
  content: "# Brief\n\nA short summary.\n\n## Goals\n\n- Keep capture fast.\n- Support richer notes.",
  sourcePath: "specflow/initiatives/initiative-12345678/brief.md",
  createdAt: "2026-03-16T12:10:00.000Z",
  updatedAt: "2026-03-16T12:10:00.000Z"
};

const coreFlowsQuestion = {
  id: "core-flow-primary-path",
  label: "What should the primary note flow feel like?",
  type: "select" as const,
  whyThisBlocks: "The core flows need one primary path before they can be drafted.",
  affectedArtifact: "core-flows" as const,
  decisionType: "journey" as const,
  assumptionIfUnanswered: "The app should optimize for fast capture first.",
  options: [
    "Capture first, organize later",
    "Browse existing notes first",
    "Equal emphasis on capture and browsing"
  ],
  optionHelp: {
    "Capture first, organize later": "Use this when the app should open straight into quick note entry."
  },
  recommendedOption: "Capture first, organize later",
  allowCustomAnswer: true
};

const validationQuestion = {
  id: "validation-lww-source",
  label: "Which clock/timestamp source is authoritative for last-write-wins (LWW) conflict resolution?",
  type: "select" as const,
  whyThisBlocks: "The ticket plan needs one canonical timestamp rule before execution starts.",
  affectedArtifact: "tech-spec" as const,
  decisionType: "architecture" as const,
  assumptionIfUnanswered: "Use server-assigned canonical timestamps.",
  options: [
    "Server-assigned canonical timestamps (server authoritative)",
    "Client-provided UTC timestamps (clients authoritative, LWW uses client timestamps)",
    "Hybrid: accept client timestamps but server records receipt time and uses server time as tie-breaker"
  ],
  recommendedOption: "Server-assigned canonical timestamps (server authoritative)",
  allowCustomAnswer: true
};

const validationPrdQuestion = {
  id: "validation-empty-states",
  label: "How should empty states and save/load indicators behave in the PRD?",
  type: "select" as const,
  whyThisBlocks: "The PRD must define the empty-state and save/load UX before tickets are created.",
  affectedArtifact: "prd" as const,
  decisionType: "behavior" as const,
  assumptionIfUnanswered: "Show lightweight empty states and save/load indicators inline.",
  options: [
    "Use lightweight inline empty states and save/load indicators",
    "Use full-page empty states and persistent loading banners",
  ],
  recommendedOption: "Use lightweight inline empty states and save/load indicators",
  allowCustomAnswer: true,
};

const reviewSnapshot: ArtifactsSnapshot = {
  ...snapshot,
  initiatives: [
    {
      ...initiative,
      workflow: {
        activeStep: "brief",
        steps: {
          brief: { status: "stale", updatedAt: "2026-03-16T12:10:00.000Z" },
          "core-flows": { status: "locked", updatedAt: null },
          prd: { status: "locked", updatedAt: null },
          "tech-spec": { status: "locked", updatedAt: null },
          validation: { status: "locked", updatedAt: null },
          tickets: { status: "locked", updatedAt: null }
        },
        refinements: initiative.workflow.refinements
      }
    }
  ],
  specs: [
    {
      id: briefSpec.id,
      initiativeId: briefSpec.initiativeId,
      type: briefSpec.type,
      title: briefSpec.title,
      sourcePath: briefSpec.sourcePath,
      createdAt: briefSpec.createdAt,
      updatedAt: briefSpec.updatedAt
    }
  ],
  planningReviews: [
    {
      id: `${initiative.id}:brief-review`,
      initiativeId: initiative.id,
      kind: "brief-review",
      status: "blocked",
      summary: "The brief still needs one clearer scope decision.",
      findings: [
        {
          id: "finding-1",
          type: "blocker",
          message: "The scope is still too broad for a first release.",
          relatedArtifacts: ["brief"]
        },
        {
          id: "finding-2",
          type: "warning",
          message: "The goals still need one measurable success metric.",
          relatedArtifacts: ["brief"]
        }
      ],
      sourceUpdatedAts: {
        brief: "2026-03-16T12:10:00.000Z"
      },
      overrideReason: null,
      reviewedAt: "2026-03-16T12:12:00.000Z",
      updatedAt: "2026-03-16T12:12:00.000Z"
    }
  ]
};

const coreFlowsSpec = {
  id: `${initiative.id}:core-flows`,
  initiativeId: initiative.id,
  type: "core-flows" as const,
  title: "Core flows",
  content: "# Core flows\n\n## Capture\n\n- Open into note capture.\n",
  sourcePath: "specflow/initiatives/initiative-12345678/core-flows.md",
  createdAt: "2026-03-16T12:30:00.000Z",
  updatedAt: "2026-03-16T12:30:00.000Z"
};

const completedReviewBlockedSnapshot: ArtifactsSnapshot = {
  ...snapshot,
  initiatives: [
    {
      ...initiative,
      workflow: {
        activeStep: "core-flows",
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T12:10:00.000Z" },
          "core-flows": { status: "ready", updatedAt: "2026-03-16T12:12:00.000Z" },
          prd: { status: "locked", updatedAt: null },
          "tech-spec": { status: "locked", updatedAt: null },
          validation: { status: "locked", updatedAt: null },
          tickets: { status: "locked", updatedAt: null }
        },
        refinements: initiative.workflow.refinements
      }
    }
  ],
  specs: [
    {
      id: briefSpec.id,
      initiativeId: briefSpec.initiativeId,
      type: briefSpec.type,
      title: briefSpec.title,
      sourcePath: briefSpec.sourcePath,
      createdAt: briefSpec.createdAt,
      updatedAt: briefSpec.updatedAt
    }
  ],
  planningReviews: reviewSnapshot.planningReviews
};

const validationBlockedSnapshot: ArtifactsSnapshot = {
  ...snapshot,
  initiatives: [
    {
      ...initiative,
      workflow: {
        activeStep: "validation",
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T12:10:00.000Z" },
          "core-flows": { status: "complete", updatedAt: "2026-03-16T12:30:00.000Z" },
          prd: { status: "complete", updatedAt: "2026-03-16T12:50:00.000Z" },
          "tech-spec": { status: "complete", updatedAt: "2026-03-16T13:05:00.000Z" },
          validation: { status: "ready", updatedAt: "2026-03-16T13:10:00.000Z" },
          tickets: { status: "locked", updatedAt: null }
        },
        refinements: {
          ...initiative.workflow.refinements,
          brief: {
            questions: [],
            history: [],
            answers: {},
            defaultAnswerQuestionIds: [],
            baseAssumptions: [],
            checkedAt: "2026-03-16T12:10:00.000Z"
          },
          "core-flows": {
            questions: [],
            history: [],
            answers: {},
            defaultAnswerQuestionIds: [],
            baseAssumptions: [],
            checkedAt: "2026-03-16T12:30:00.000Z"
          },
          prd: {
            questions: [],
            history: [],
            answers: {},
            defaultAnswerQuestionIds: [],
            baseAssumptions: [],
            checkedAt: "2026-03-16T12:50:00.000Z"
          },
          "tech-spec": {
            questions: [validationQuestion],
            history: [validationQuestion],
            answers: {},
            defaultAnswerQuestionIds: [],
            baseAssumptions: [],
            checkedAt: "2026-03-16T13:05:00.000Z"
          }
        }
      }
    }
  ],
  planningReviews: [
    {
      id: `${initiative.id}:ticket-coverage-review`,
      initiativeId: initiative.id,
      kind: "ticket-coverage-review",
      status: "blocked",
      summary: "Validation needs one remaining product decision.",
      findings: [
        {
          id: "validation-finding-1",
          type: "blocker",
          message: "Pick the authoritative timestamp source before ticket generation.",
          relatedArtifacts: ["tech-spec"]
        }
      ],
      sourceUpdatedAts: {
        brief: "2026-03-16T12:10:00.000Z",
        "core-flows": "2026-03-16T12:30:00.000Z",
        prd: "2026-03-16T12:50:00.000Z",
        "tech-spec": "2026-03-16T13:05:00.000Z",
        validation: "2026-03-16T13:10:00.000Z"
      },
      overrideReason: null,
      reviewedAt: "2026-03-16T13:10:00.000Z",
      updatedAt: "2026-03-16T13:10:00.000Z"
    }
  ]
};

const validationPrdRecoverySnapshot: ArtifactsSnapshot = {
  ...validationBlockedSnapshot,
  initiatives: [
    {
      ...validationBlockedSnapshot.initiatives[0]!,
      workflow: {
        ...validationBlockedSnapshot.initiatives[0]!.workflow,
        refinements: {
          ...validationBlockedSnapshot.initiatives[0]!.workflow.refinements,
          prd: {
            questions: [validationPrdQuestion],
            history: [validationPrdQuestion],
            answers: {},
            defaultAnswerQuestionIds: [],
            baseAssumptions: [],
            checkedAt: "2026-03-16T13:15:00.000Z",
          },
          "tech-spec": {
            ...validationBlockedSnapshot.initiatives[0]!.workflow.refinements["tech-spec"],
            questions: [],
            history: [validationQuestion],
            answers: {
              [validationQuestion.id]: "Server-assigned canonical timestamps (server authoritative)",
            },
          },
        },
      },
    },
  ],
};

const briefCompleteSnapshot: ArtifactsSnapshot = {
  ...snapshot,
  initiatives: [
    {
      ...initiative,
      workflow: {
        activeStep: "core-flows",
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T12:10:00.000Z" },
          "core-flows": { status: "ready", updatedAt: null },
          prd: { status: "locked", updatedAt: null },
          "tech-spec": { status: "locked", updatedAt: null },
          validation: { status: "locked", updatedAt: null },
          tickets: { status: "locked", updatedAt: null }
        },
        refinements: {
          ...initiative.workflow.refinements,
          brief: {
            ...initiative.workflow.refinements.brief,
            questions: [],
            answers: {
              "brief-problem": briefProblemOption,
            },
          },
        }
      }
    }
  ],
  specs: [
    {
      id: briefSpec.id,
      initiativeId: briefSpec.initiativeId,
      type: briefSpec.type,
      title: briefSpec.title,
      sourcePath: briefSpec.sourcePath,
      createdAt: briefSpec.createdAt,
      updatedAt: briefSpec.updatedAt
    }
  ]
};

const briefReviewSnapshot: ArtifactsSnapshot = {
  ...briefCompleteSnapshot,
  initiatives: [
    {
      ...briefCompleteSnapshot.initiatives[0]!,
      workflow: {
        ...briefCompleteSnapshot.initiatives[0]!.workflow,
        refinements: {
          ...briefCompleteSnapshot.initiatives[0]!.workflow.refinements,
          brief: {
            ...briefCompleteSnapshot.initiatives[0]!.workflow.refinements.brief,
            answers: {
              "brief-problem": briefProblemOption
            }
          }
        }
      }
    }
  ]
};

const readyToDraftSnapshot: ArtifactsSnapshot = {
  ...snapshot,
  initiatives: [
    {
      ...initiative,
      workflow: {
        ...initiative.workflow,
        refinements: {
          ...initiative.workflow.refinements,
          brief: {
            ...initiative.workflow.refinements.brief,
            questions: [],
            answers: {
              "brief-problem": briefProblemOption,
            },
            checkedAt: "2026-03-16T12:15:00.000Z",
          },
        },
      },
    },
  ],
};

const coreFlowsQuestionSnapshot: ArtifactsSnapshot = {
  ...snapshot,
  initiatives: [
    {
      ...initiative,
      workflow: {
        activeStep: "core-flows",
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T12:10:00.000Z" },
          "core-flows": { status: "ready", updatedAt: null },
          prd: { status: "locked", updatedAt: null },
          "tech-spec": { status: "locked", updatedAt: null },
          validation: { status: "locked", updatedAt: null },
          tickets: { status: "locked", updatedAt: null }
        },
        refinements: {
          ...initiative.workflow.refinements,
          "core-flows": {
            questions: [coreFlowsQuestion],
            history: [coreFlowsQuestion],
            answers: {},
            defaultAnswerQuestionIds: [],
            baseAssumptions: [],
            checkedAt: "2026-03-16T12:20:00.000Z"
          }
        }
      }
    }
  ]
};

const coreFlowsReadyToGenerateSnapshot: ArtifactsSnapshot = {
  ...snapshot,
  initiatives: [
    {
      ...initiative,
      workflow: {
        activeStep: "core-flows",
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T12:10:00.000Z" },
          "core-flows": { status: "ready", updatedAt: null },
          prd: { status: "locked", updatedAt: null },
          "tech-spec": { status: "locked", updatedAt: null },
          validation: { status: "locked", updatedAt: null },
          tickets: { status: "locked", updatedAt: null }
        },
        refinements: {
          ...initiative.workflow.refinements,
          "core-flows": {
            questions: [],
            history: [coreFlowsQuestion],
            answers: {
              [coreFlowsQuestion.id]: "Capture first, organize later"
            },
            defaultAnswerQuestionIds: [],
            baseAssumptions: [],
            checkedAt: "2026-03-16T12:25:00.000Z"
          }
        }
      }
    }
  ],
  specs: [
    {
      id: briefSpec.id,
      initiativeId: briefSpec.initiativeId,
      type: briefSpec.type,
      title: briefSpec.title,
      sourcePath: briefSpec.sourcePath,
      createdAt: briefSpec.createdAt,
      updatedAt: briefSpec.updatedAt
    }
  ]
};

const prdReadySnapshot: ArtifactsSnapshot = {
  ...snapshot,
  initiatives: [
    {
      ...initiative,
      workflow: {
        activeStep: "prd",
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T12:10:00.000Z" },
          "core-flows": { status: "complete", updatedAt: "2026-03-16T12:30:00.000Z" },
          prd: { status: "ready", updatedAt: null },
          "tech-spec": { status: "locked", updatedAt: null },
          validation: { status: "locked", updatedAt: null },
          tickets: { status: "locked", updatedAt: null }
        },
        refinements: {
          ...initiative.workflow.refinements,
          "core-flows": {
            questions: [],
            history: [coreFlowsQuestion],
            answers: {
              [coreFlowsQuestion.id]: "Capture first, organize later"
            },
            defaultAnswerQuestionIds: [],
            baseAssumptions: [],
            checkedAt: "2026-03-16T12:25:00.000Z"
          }
        }
      }
    }
  ],
  specs: [
    {
      id: briefSpec.id,
      initiativeId: briefSpec.initiativeId,
      type: briefSpec.type,
      title: briefSpec.title,
      sourcePath: briefSpec.sourcePath,
      createdAt: briefSpec.createdAt,
      updatedAt: briefSpec.updatedAt
    },
    {
      id: coreFlowsSpec.id,
      initiativeId: coreFlowsSpec.initiativeId,
      type: coreFlowsSpec.type,
      title: coreFlowsSpec.title,
      sourcePath: coreFlowsSpec.sourcePath,
      createdAt: coreFlowsSpec.createdAt,
      updatedAt: coreFlowsSpec.updatedAt
    }
  ]
};

const WorkspaceWithLocation = () => {
  const location = useLocation();

  return (
    <>
      <div>{location.search || "(no search)"}</div>
      <InitiativeRouteView snapshot={snapshot} onRefresh={vi.fn(async () => undefined)} />
    </>
  );
};

const StatefulHandoffRoute = ({
  initialSnapshot,
  refreshedSnapshot,
}: {
  initialSnapshot: ArtifactsSnapshot;
  refreshedSnapshot: ArtifactsSnapshot;
}) => {
  const [currentSnapshot, setCurrentSnapshot] = useState(initialSnapshot);

  return (
    <InitiativeRouteView
      snapshot={currentSnapshot}
      onRefresh={vi.fn(async () => {
        setCurrentSnapshot(refreshedSnapshot);
      })}
    />
  );
};

const StatefulSequenceRoute = ({
  initialSnapshot,
  refreshedSnapshots,
}: {
  initialSnapshot: ArtifactsSnapshot;
  refreshedSnapshots: ArtifactsSnapshot[];
}) => {
  const [currentSnapshot, setCurrentSnapshot] = useState(initialSnapshot);
  const refreshIndexRef = useRef(0);
  const location = useLocation();

  return (
    <>
      <div>{location.search || "(no search)"}</div>
      <InitiativeRouteView
        snapshot={currentSnapshot}
        onRefresh={vi.fn(async () => {
          const nextSnapshot = refreshedSnapshots[Math.min(refreshIndexRef.current, refreshedSnapshots.length - 1)];
          refreshIndexRef.current += 1;

          if (nextSnapshot) {
            setCurrentSnapshot(nextSnapshot);
          }
        })}
      />
    </>
  );
};

describe("InitiativeView", () => {
  beforeEach(() => {
    fetchSpecDetailMock.mockReset();
    checkInitiativePhaseMock.mockReset();
    generateInitiativeBriefMock.mockReset();
    generateInitiativeCoreFlowsMock.mockReset();
    generateInitiativePlanMock.mockReset();
    saveInitiativeRefinementMock.mockReset();
    saveInitiativeRefinementMock.mockResolvedValue({ assumptions: [] });
  });

  it("opens the standard brief survey when the user lands on the brief step", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
        <Routes>
          <Route path="/initiative/:id" element={<WorkspaceWithLocation />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByRole("heading", { name: "What do you want to build?" })).not.toBeInTheDocument();
    expect(screen.getByText("What primary problem should v1 solve?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("?step=brief&surface=questions")).toBeInTheDocument();
    });
  });

  it("waits for explicit confirmation before re-checking the completed brief intake", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);
    checkInitiativePhaseMock.mockResolvedValue({
      decision: "ask",
      questions: initiative.workflow.refinements.brief.questions,
      assumptions: []
    });

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
        <Routes>
          <Route path="/initiative/:id" element={<WorkspaceWithLocation />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(briefProblemOption, "i") }));

    expect(screen.getByText("What primary problem should v1 solve?")).toBeInTheDocument();
    expect(screen.queryByText("Ready to draft the brief")).not.toBeInTheDocument();
    expect(checkInitiativePhaseMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(checkInitiativePhaseMock).toHaveBeenCalledWith(initiative.id, "brief", expect.anything());
    });
  });

  it("collapses the brief survey shell while completed answers are being re-checked", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);
    let resolveCheck:
      | ((value: { decision: "ask"; questions: typeof initiative.workflow.refinements.brief.questions; assumptions: string[] }) => void)
      | undefined;
    checkInitiativePhaseMock.mockReturnValue(
      new Promise<{ decision: "ask"; questions: typeof initiative.workflow.refinements.brief.questions; assumptions: string[] }>(
        (resolve) => {
          resolveCheck = resolve;
        },
      ),
    );

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
        <Routes>
          <Route path="/initiative/:id" element={<WorkspaceWithLocation />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(briefProblemOption, "i") }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByText("Checking brief questions...")).toBeInTheDocument();
    });

    expect(screen.queryByText("What primary problem should v1 solve?")).not.toBeInTheDocument();
    expect(screen.getByText("Checking brief questions...").closest(".planning-survey-card")).toHaveClass(
      "planning-survey-card-compact",
    );
    expect(screen.getByText("Checking brief questions...").closest(".planning-survey-card")).toHaveClass(
      "planning-survey-card-transient",
    );

    if (resolveCheck) {
      resolveCheck({
        decision: "ask",
        questions: initiative.workflow.refinements.brief.questions,
        assumptions: [],
      });
    }
  });

  it("shows an active loading panel while drafting the brief after the final intake answer", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);
    checkInitiativePhaseMock.mockResolvedValue({
      decision: "proceed",
      questions: [],
      assumptions: []
    });
    let resolveGeneration: ((value: { reviews: Array<{ status: "passed" | "overridden" }> }) => void) | undefined;
    generateInitiativeBriefMock.mockReturnValue(
      new Promise<{ reviews: Array<{ status: "passed" | "overridden" }> }>((resolve) => {
        resolveGeneration = resolve;
      })
    );

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={<StatefulHandoffRoute initialSnapshot={snapshot} refreshedSnapshot={readyToDraftSnapshot} />}
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(briefProblemOption, "i") }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByText("Generating brief...")).toBeInTheDocument();
    });

    if (resolveGeneration) {
      resolveGeneration({ reviews: [] });
    }
  });

  it("shows a retry action instead of an empty survey shell when the completed brief re-check fails", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);
    checkInitiativePhaseMock.mockRejectedValue(new Error("Checking the brief questions took too long. Try again."));

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
        <Routes>
          <Route path="/initiative/:id" element={<WorkspaceWithLocation />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(briefProblemOption, "i") }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(checkInitiativePhaseMock).toHaveBeenCalledWith(initiative.id, "brief", expect.anything());
    });

    expect(checkInitiativePhaseMock.mock.calls[0]?.[2]).not.toHaveProperty("timeoutMs");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "What primary problem should v1 solve?" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("retries the initial brief check once before falling back to retry", async () => {
    checkInitiativePhaseMock
      .mockRejectedValueOnce(new Error("Checking the brief questions took too long. Try again."))
      .mockResolvedValueOnce({
        decision: "ask",
        questions: initiative.workflow.refinements.brief.questions,
        assumptions: [],
      });

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={<InitiativeRouteView snapshot={freshBriefSnapshot} onRefresh={vi.fn(() => new Promise<void>(() => undefined))} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(checkInitiativePhaseMock).toHaveBeenCalledTimes(2);
    });

    expect(checkInitiativePhaseMock.mock.calls[0]?.[2]).not.toHaveProperty("timeoutMs");
    expect(checkInitiativePhaseMock.mock.calls[1]?.[2]).not.toHaveProperty("timeoutMs");

    await waitFor(() => {
      expect(screen.getByText("What primary problem should v1 solve?")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("restarts the initial brief check after StrictMode cancels the first mount", async () => {
    checkInitiativePhaseMock
      .mockImplementationOnce((_initiativeId: string, _step: string, options?: { signal?: AbortSignal }) =>
        new Promise<never>((_, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => {
              reject(options.signal?.reason ?? new Error("Request cancelled"));
            },
            { once: true }
          );
        })
      )
      .mockResolvedValueOnce({
        decision: "ask",
        questions: initiative.workflow.refinements.brief.questions,
        assumptions: [],
      });

    render(
      <StrictMode>
        <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
          <Routes>
            <Route
              path="/initiative/:id"
              element={<InitiativeRouteView snapshot={freshBriefSnapshot} onRefresh={vi.fn(() => new Promise<void>(() => undefined))} />}
            />
          </Routes>
        </MemoryRouter>
      </StrictMode>
    );

    await waitFor(() => {
      expect(checkInitiativePhaseMock).toHaveBeenCalledTimes(2);
    });

    expect(checkInitiativePhaseMock.mock.calls[0]?.[2]).not.toHaveProperty("timeoutMs");
    expect(checkInitiativePhaseMock.mock.calls[1]?.[2]).not.toHaveProperty("timeoutMs");

    await waitFor(() => {
      expect(screen.getByText("What primary problem should v1 solve?")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("shows the returned brief questions even when the follow-up refresh stalls", async () => {
    checkInitiativePhaseMock.mockResolvedValue({
      decision: "ask",
      questions: initiative.workflow.refinements.brief.questions,
      assumptions: [],
    });

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={<InitiativeRouteView snapshot={freshBriefSnapshot} onRefresh={vi.fn(() => new Promise<void>(() => undefined))} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(checkInitiativePhaseMock).toHaveBeenCalledWith(initiative.id, "brief", expect.anything());
    });

    expect(checkInitiativePhaseMock.mock.calls[0]?.[2]).not.toHaveProperty("timeoutMs");

    await waitFor(() => {
      expect(screen.getByText("What primary problem should v1 solve?")).toBeInTheDocument();
    });

    expect(screen.queryByText("Preparing brief questions...")).not.toBeInTheDocument();
  });

  it("shows a retry action when the initial brief question check fails", async () => {
    checkInitiativePhaseMock.mockRejectedValue(new Error("Checking the brief questions took too long. Try again."));

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={<InitiativeRouteView snapshot={freshBriefSnapshot} onRefresh={vi.fn(() => Promise.resolve())} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(checkInitiativePhaseMock).toHaveBeenCalledWith(initiative.id, "brief", expect.anything());
    });

    expect(checkInitiativePhaseMock.mock.calls[0]?.[2]).not.toHaveProperty("timeoutMs");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });
  });

  it("returns to the generated brief for review after brief generation completes", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);
    checkInitiativePhaseMock.mockResolvedValue({
      decision: "proceed",
      questions: [],
      assumptions: []
    });
    generateInitiativeBriefMock.mockResolvedValue({ reviews: [{ status: "passed" }] });

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={<StatefulHandoffRoute initialSnapshot={snapshot} refreshedSnapshot={briefCompleteSnapshot} />}
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(briefProblemOption, "i") }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByText("A short summary.")).toBeInTheDocument();
    });

    expect(screen.queryByText("Ready to draft the brief")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Brief" })).toHaveClass("pipeline-node-selected");
    expect(screen.queryByRole("button", { name: "Core flows" })).not.toHaveClass("pipeline-node-selected");
  });

  it("goes straight into core flow questions after entering the phase", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);
    checkInitiativePhaseMock.mockResolvedValue({
      decision: "ask",
      questions: [coreFlowsQuestion],
      assumptions: []
    });

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=core-flows`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={<StatefulHandoffRoute initialSnapshot={briefCompleteSnapshot} refreshedSnapshot={coreFlowsQuestionSnapshot} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText("Answer the missing questions before you generate the core flows.")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(checkInitiativePhaseMock).toHaveBeenCalledWith(initiative.id, "core-flows", expect.anything());
    });

    await waitFor(() => {
      expect(screen.getByText("What should the primary note flow feel like?")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Answer core flows questions" })).not.toBeInTheDocument();
  });

  it("hides the generate action while core flow questions are loading", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);
    let resolveCheck: ((value: { decision: "ask"; questions: typeof coreFlowsQuestion[]; assumptions: string[] }) => void) | undefined;
    checkInitiativePhaseMock.mockReturnValue(
      new Promise<{ decision: "ask"; questions: typeof coreFlowsQuestion[]; assumptions: string[] }>((resolve) => {
        resolveCheck = resolve;
      })
    );

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=core-flows`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={<StatefulHandoffRoute initialSnapshot={briefCompleteSnapshot} refreshedSnapshot={coreFlowsQuestionSnapshot} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Preparing core flows questions...")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Generate core flows" })).not.toBeInTheDocument();

    if (resolveCheck) {
      resolveCheck({
        decision: "ask",
        questions: [coreFlowsQuestion],
        assumptions: []
      });
    }
  });

  it("re-checks the phase instead of leaving a blank card after the last core flow answer", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);
    let resolveCheck:
      | ((value: { decision: "ask"; questions: typeof coreFlowsQuestion[]; assumptions: string[] }) => void)
      | undefined;
    checkInitiativePhaseMock.mockReturnValue(
      new Promise<{ decision: "ask"; questions: typeof coreFlowsQuestion[]; assumptions: string[] }>((resolve) => {
        resolveCheck = resolve;
      }),
    );

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=core-flows`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={<StatefulHandoffRoute initialSnapshot={coreFlowsQuestionSnapshot} refreshedSnapshot={coreFlowsQuestionSnapshot} />}
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /Capture first, organize later/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(checkInitiativePhaseMock).toHaveBeenCalledWith(initiative.id, "core-flows", expect.anything());
    });

    expect(screen.getByText("Checking core flows questions...")).toBeInTheDocument();
    expect(screen.queryByText("What should the primary note flow feel like?")).not.toBeInTheDocument();

    if (resolveCheck) {
      resolveCheck({
        decision: "ask",
        questions: [coreFlowsQuestion],
        assumptions: [],
      });
    }
  });

  it("auto-generates core flows and lands on review after the last answer when no more questions are needed", async () => {
    fetchSpecDetailMock.mockImplementation(async (specId: string) => (specId === coreFlowsSpec.id ? coreFlowsSpec : briefSpec));
    checkInitiativePhaseMock.mockResolvedValue({
      decision: "proceed",
      questions: [],
      assumptions: [],
    });
    generateInitiativeCoreFlowsMock.mockResolvedValue({
      markdown: coreFlowsSpec.content,
      reviews: [],
    });

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=core-flows`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={
              <StatefulSequenceRoute
                initialSnapshot={coreFlowsQuestionSnapshot}
                refreshedSnapshots={[coreFlowsReadyToGenerateSnapshot, prdReadySnapshot]}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /Capture first, organize later/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(generateInitiativeCoreFlowsMock).toHaveBeenCalledWith(initiative.id, expect.anything());
    });

    await waitFor(() => {
      expect(screen.getByText("?step=core-flows&surface=review")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByText("Open into note capture.")).toBeInTheDocument();
  });

  it("re-checks validation-backed artifact questions before regenerating tickets", async () => {
    const onRefresh = vi.fn(async () => undefined);
    checkInitiativePhaseMock.mockResolvedValueOnce({
      decision: "ask",
      questions: [validationQuestion],
      assumptions: []
    });

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=validation`]}>
        <Routes>
          <Route path="/initiative/:id" element={<InitiativeRouteView snapshot={validationBlockedSnapshot} onRefresh={onRefresh} />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Server-assigned canonical timestamps \(server authoritative\)/i
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(checkInitiativePhaseMock).toHaveBeenCalledTimes(1);
    });

    expect(checkInitiativePhaseMock.mock.calls.map((call) => call[1])).toEqual([
      "tech-spec"
    ]);
    expect(checkInitiativePhaseMock.mock.calls[0]?.[2]).toMatchObject({
      validationFeedback: expect.stringContaining("Pick the authoritative timestamp source before ticket generation.")
    });
    expect(generateInitiativePlanMock).not.toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalled();
  });

  it("turns plan validation failures back into in-place validation questions", async () => {
    checkInitiativePhaseMock
      .mockResolvedValueOnce({ decision: "proceed", questions: [], assumptions: [] })
      .mockResolvedValueOnce({ decision: "ask", questions: [validationPrdQuestion], assumptions: [] });
    generateInitiativePlanMock.mockRejectedValue(
      new ApiError(
        500,
        "Generated ticket plan has 2 coverage validation issues.",
        "planner_validation_error",
        {
          issues: [
            {
              kind: "missing-coverage-item",
              message:
                "Missing PRD requirement: Friendly empty states and lightweight save/load indicators.",
              coverageItem: {
                sourceStep: "prd",
              },
            },
            {
              kind: "missing-coverage-item",
              message:
                "Missing PRD requirement: Local persistence failures show inline error and preserve draft for retry.",
              coverageItem: {
                sourceStep: "prd",
              },
            },
          ],
        }
      )
    );

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=validation`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={
              <StatefulSequenceRoute
                initialSnapshot={validationBlockedSnapshot}
                refreshedSnapshots={[validationPrdRecoverySnapshot]}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Server-assigned canonical timestamps \(server authoritative\)/i
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(generateInitiativePlanMock).toHaveBeenCalledWith(initiative.id, expect.anything());
    });

    await waitFor(() => {
      expect(checkInitiativePhaseMock).toHaveBeenCalledTimes(2);
    });

    expect(checkInitiativePhaseMock.mock.calls.map((call) => call[1])).toEqual([
      "tech-spec",
      "prd",
    ]);
    expect(checkInitiativePhaseMock.mock.calls[1]?.[2]).toMatchObject({
      validationFeedback: [
        "Missing PRD requirement: Friendly empty states and lightweight save/load indicators.",
        "Missing PRD requirement: Local persistence failures show inline error and preserve draft for retry.",
      ].join("\n"),
    });

    await waitFor(() => {
      expect(screen.getByText(validationPrdQuestion.label)).toBeInTheDocument();
    });
  });

  it("keeps the viewed brief selected in the pipeline and shows direct actions in the header", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={<InitiativeRouteView snapshot={briefCompleteSnapshot} onRefresh={vi.fn(async () => undefined)} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("A short summary.")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Brief" })).toHaveClass("pipeline-node-selected");
    expect(screen.getByRole("button", { name: "Core flows" })).not.toHaveClass("pipeline-node-active");
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revise answers" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("returns to the brief intake survey inline and offers regenerate instead of opening the drawer", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={<InitiativeRouteView snapshot={briefReviewSnapshot} onRefresh={vi.fn(async () => undefined)} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("A short summary.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Revise answers" }));

    expect(await screen.findByText("All questions are answered")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate brief" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit text" })).not.toBeInTheDocument();
  });

  it("shows the answered survey summary instead of resetting to the first question", async () => {
    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief&surface=questions`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={<InitiativeRouteView snapshot={briefReviewSnapshot} onRefresh={vi.fn(async () => undefined)} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("All questions are answered")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "What primary problem should v1 solve?" }),
    ).not.toBeInTheDocument();
  });

  it("keeps blocked brief work in the clarification flow instead of dumping review findings into the page", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={<InitiativeRouteView snapshot={reviewSnapshot} onRefresh={vi.fn(async () => undefined)} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("What primary problem should v1 solve?")).toBeInTheDocument();
    expect(screen.queryByText("The scope is still too broad for a first release.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(briefProblemOption, "i") })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
    expect(screen.queryByText("24 questions to answer")).not.toBeInTheDocument();
    expect(screen.queryByText("The scope is still too broad for a first release.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move on anyway" })).not.toBeInTheDocument();
  });

  it("does not surface override actions while clarification is still required", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={<InitiativeRouteView snapshot={reviewSnapshot} onRefresh={vi.fn(async () => undefined)} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText("More")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Move on anyway" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revise answers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit text" })).not.toBeInTheDocument();
    expect(screen.getByText("What primary problem should v1 solve?")).toBeInTheDocument();
  });

  it("lets the next phase stay active even if the previous planning review artifact is still unresolved", () => {
    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=core-flows`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={
              <InitiativeRouteView snapshot={completedReviewBlockedSnapshot} onRefresh={vi.fn(async () => undefined)} />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "Brief" })).toHaveClass("pipeline-node-complete");
    expect(screen.getByRole("button", { name: "Core flows" })).toHaveClass("pipeline-node-active");
    expect(screen.queryByRole("button", { name: "Move on anyway" })).not.toBeInTheDocument();
  });
});
