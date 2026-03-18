import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactsSnapshot, Initiative } from "../../types.js";
import { InitiativeRouteView } from "./initiative-route-view.js";

const fetchSpecDetailMock = vi.fn();
const checkInitiativePhaseMock = vi.fn();
const generateInitiativeBriefMock = vi.fn();
const generateInitiativeCoreFlowsMock = vi.fn();

vi.mock("../../api.js", async () => {
  const actual = await vi.importActual<typeof import("../../api.js")>("../../api.js");
  return {
    ...actual,
    fetchSpecDetail: (...args: unknown[]) => fetchSpecDetailMock(...args),
    checkInitiativePhase: (...args: unknown[]) => checkInitiativePhaseMock(...args),
    generateInitiativeBrief: (...args: unknown[]) => generateInitiativeBriefMock(...args),
    generateInitiativeCoreFlows: (...args: unknown[]) => generateInitiativeCoreFlowsMock(...args),
  };
});

vi.mock("../context/toast.js", () => ({
  useToast: () => ({ showError: vi.fn() })
}));

vi.mock("../context/confirm.js", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(false)
}));

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
      tickets: { status: "locked", updatedAt: null }
    },
    refinements: {
      brief: {
        questions: [
          {
            id: "brief-problem",
            label: "Which problem matters most in v1?",
            type: "select",
            whyThisBlocks: "One focused problem — not a feature list.",
            affectedArtifact: "brief",
            decisionType: "scope",
            assumptionIfUnanswered: "Focus on the user's primary note-taking problem.",
            options: [
              "Capture something quickly",
              "Find or organize things better",
              "Replace an existing tool or workflow",
              "Support a platform-specific need",
              "Other"
            ],
            optionHelp: {
              "Capture something quickly": "Use this when speed matters most."
            },
            recommendedOption: null
          },
        ],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: "2026-03-16T12:05:00.000Z",
      },
      "core-flows": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null }
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
  decisionType: "workflow" as const,
  assumptionIfUnanswered: "The app should optimize for fast capture first.",
  options: [
    "Capture first, organize later",
    "Browse existing notes first",
    "Equal emphasis on capture and browsing",
    "Other"
  ],
  optionHelp: {
    "Capture first, organize later": "Use this when the app should open straight into quick note entry."
  },
  recommendedOption: "Capture first, organize later"
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
              "brief-problem": "Capture something quickly"
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
              "brief-problem": "Capture something quickly",
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
          tickets: { status: "locked", updatedAt: null }
        },
        refinements: {
          ...initiative.workflow.refinements,
          "core-flows": {
            questions: [coreFlowsQuestion],
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
          tickets: { status: "locked", updatedAt: null }
        },
        refinements: {
          ...initiative.workflow.refinements,
          "core-flows": {
            questions: [],
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
          tickets: { status: "locked", updatedAt: null }
        },
        refinements: {
          ...initiative.workflow.refinements,
          "core-flows": {
            questions: [],
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
  const [refreshIndex, setRefreshIndex] = useState(0);
  const location = useLocation();

  return (
    <>
      <div>{location.search || "(no search)"}</div>
      <InitiativeRouteView
        snapshot={currentSnapshot}
        onRefresh={vi.fn(async () => {
          setCurrentSnapshot(refreshedSnapshots[Math.min(refreshIndex, refreshedSnapshots.length - 1)] ?? currentSnapshot);
          setRefreshIndex((current) => current + 1);
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
    expect(screen.getByText("Which problem matters most in v1?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("?step=brief")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /Capture something quickly/i }));

    expect(screen.getByText("Which problem matters most in v1?")).toBeInTheDocument();
    expect(screen.queryByText("Ready to draft the brief")).not.toBeInTheDocument();
    expect(checkInitiativePhaseMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(checkInitiativePhaseMock).toHaveBeenCalledWith(initiative.id, "brief");
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

    fireEvent.click(screen.getByRole("button", { name: /Capture something quickly/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByText("Checking if the brief needs anything else")).toBeInTheDocument();
    });

    expect(screen.queryByText("Which problem matters most in v1?")).not.toBeInTheDocument();
    expect(screen.getByText("Checking if the brief needs anything else").closest(".planning-survey-card")).toHaveClass(
      "planning-survey-card-compact",
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

    fireEvent.click(screen.getByRole("button", { name: /Capture something quickly/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByText("Drafting the brief")).toBeInTheDocument();
    });

    if (resolveGeneration) {
      resolveGeneration({ reviews: [] });
    }
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

    fireEvent.click(screen.getByRole("button", { name: /Capture something quickly/i }));
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
      expect(checkInitiativePhaseMock).toHaveBeenCalledWith(initiative.id, "core-flows");
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
      expect(screen.getByText("Getting the questions ready")).toBeInTheDocument();
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
      expect(checkInitiativePhaseMock).toHaveBeenCalledWith(initiative.id, "core-flows");
    });

    expect(screen.getByText("Checking if the core flows needs anything else")).toBeInTheDocument();
    expect(screen.queryByText("What should the primary note flow feel like?")).not.toBeInTheDocument();

    if (resolveCheck) {
      resolveCheck({
        decision: "ask",
        questions: [coreFlowsQuestion],
        assumptions: [],
      });
    }
  });

  it("auto-generates and advances after the last core flow answer when no more questions are needed", async () => {
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
      expect(generateInitiativeCoreFlowsMock).toHaveBeenCalledWith(initiative.id);
    });

    await waitFor(() => {
      expect(screen.getByText("?step=prd")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to core flows" })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByText("Which problem matters most in v1?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate brief" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue to core flows" })).not.toBeInTheDocument();
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

    expect(screen.getByText("Which problem matters most in v1?")).toBeInTheDocument();
    expect(screen.queryByText("The scope is still too broad for a first release.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Capture something quickly/i })).toBeInTheDocument();
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
    expect(screen.getByText("Which problem matters most in v1?")).toBeInTheDocument();
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
