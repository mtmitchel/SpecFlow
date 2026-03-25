import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { App } from "./App";
import type {
  ArtifactsSnapshot,
  Initiative,
  InitiativePlanningQuestion,
  PlanningReviewArtifact,
  SpecDocument,
  Ticket,
} from "./types";

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class MockChannel<T> {
    public onmessage: ((message: T) => void) | null = null;
  },
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

const briefQuestion: InitiativePlanningQuestion = {
  id: "brief-problem",
  label: "What needs to get better first?",
  type: "select",
  whyThisBlocks: "SpecFlow needs the core user problem before it can draft the brief.",
  affectedArtifact: "brief",
  decisionType: "problem",
  assumptionIfUnanswered: "The app should support fast capture.",
  options: ["Keep capture fast and obvious"],
  recommendedOption: "Keep capture fast and obvious",
  allowCustomAnswer: false,
  reopensQuestionIds: [],
};

const iso = "2026-03-22T22:00:00.000Z";

const createDraftInitiative = (): Initiative => ({
  id: "initiative-12345678",
  title: "Simple notes",
  description: "Plan a simple notes app with quick capture.",
  projectRoot: "/tmp/specflow-smoke-project",
  status: "draft",
  phases: [],
  specIds: [],
  ticketIds: [],
  workflow: {
    activeStep: "brief",
    resumeTicketId: null,
    steps: {
      brief: { status: "ready", updatedAt: null },
      "core-flows": { status: "locked", updatedAt: null },
      prd: { status: "locked", updatedAt: null },
      "tech-spec": { status: "locked", updatedAt: null },
      validation: { status: "locked", updatedAt: null },
      tickets: { status: "locked", updatedAt: null },
    },
    refinements: {
      brief: {
        questions: [briefQuestion],
        history: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        preferredSurface: "questions",
        checkedAt: null,
      },
      "core-flows": {
        questions: [],
        history: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        preferredSurface: null,
        checkedAt: null,
      },
      prd: {
        questions: [],
        history: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        preferredSurface: null,
        checkedAt: null,
      },
      "tech-spec": {
        questions: [],
        history: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        preferredSurface: null,
        checkedAt: null,
      },
    },
  },
  createdAt: iso,
  updatedAt: iso,
});

const createReadyTicketState = (initiativeId: string): {
  ticket: Ticket;
  coverageReview: PlanningReviewArtifact;
  spec: SpecDocument;
} => {
  const ticket: Ticket = {
    id: "ticket-12345678",
    initiativeId,
    phaseId: "phase-brief",
    title: "Create note capture",
    description: "Build the first quick-capture workspace for the note flow.",
    status: "ready",
    acceptanceCriteria: [
      { id: "criterion-1", text: "The capture view stays fast and obvious." },
    ],
    implementationPlan: "Build the first desktop handoff bundle for the capture ticket.",
    fileTargets: ["packages/client/src/App.tsx"],
    coverageItemIds: [],
    blockedBy: [],
    blocks: [],
    runId: null,
    createdAt: iso,
    updatedAt: iso,
  };

  const coverageReview: PlanningReviewArtifact = {
    id: `${initiativeId}:ticket-coverage-review`,
    initiativeId,
    kind: "ticket-coverage-review",
    status: "passed",
    summary: "Coverage is clear.",
    findings: [],
    sourceUpdatedAts: { tickets: iso },
    overrideReason: null,
    reviewedAt: iso,
    updatedAt: iso,
  };

  const spec: SpecDocument = {
    id: `${initiativeId}:brief`,
    initiativeId,
    type: "brief",
    title: "Brief",
    content: "Brief summary for the quick capture workspace.",
    sourcePath: "specflow/initiatives/initiative-12345678/brief.md",
    createdAt: iso,
    updatedAt: iso,
  };

  return { ticket, coverageReview, spec };
};

const emptySnapshot = (): ArtifactsSnapshot => ({
  config: null,
  meta: {
    revision: 1,
    generatedAt: iso,
    generationTimeMs: 2,
    payloadBytes: 512,
    reloadIssues: [],
  },
  workspaceRoot: "/tmp/specflow-smoke-workspace",
  initiatives: [],
  tickets: [],
  runs: [],
  runAttempts: [],
  specs: [],
  planningReviews: [],
  ticketCoverageArtifacts: [],
});

const clone = <T,>(value: T): T => structuredClone(value);

const setSnapshotMeta = (snapshot: ArtifactsSnapshot, revision: number): ArtifactsSnapshot => ({
  ...snapshot,
  meta: {
    revision,
    generatedAt: iso,
    generationTimeMs: 3,
    payloadBytes: 1024,
    reloadIssues: [],
  },
});

const createDesktopSmokeBackend = () => {
  let snapshot = emptySnapshot();
  let nextRevision = 2;
  const specDetails = new Map<string, SpecDocument>();
  let snapshotRequests = 0;
  const savedZipRequests: Array<{ runId: string; attemptId: string; defaultFilename: string }> = [];

  const handleSidecarRequest = (request: { method: string; params?: Record<string, unknown> }) => {
    switch (request.method) {
      case "artifacts.snapshot":
        snapshotRequests += 1;
        return clone(snapshot);
      case "initiatives.create": {
        const initiative = createDraftInitiative();
        snapshot = setSnapshotMeta(
          {
            ...snapshot,
            initiatives: [initiative],
          },
          nextRevision++,
        );
        return { initiative };
      }
      case "initiatives.continueArtifactStep": {
        const initiative = snapshot.initiatives[0];
        if (!initiative) {
          throw new Error("Expected an initiative before continuing the brief.");
        }

        const nextInitiative: Initiative = {
          ...initiative,
          phases: [{ id: "phase-brief", name: "Capture", order: 1, status: "active" }],
          specIds: [`${initiative.id}:brief`],
          ticketIds: ["ticket-12345678"],
          workflow: {
            ...initiative.workflow,
            activeStep: "tickets",
            steps: {
              ...initiative.workflow.steps,
              brief: { status: "complete", updatedAt: iso },
              "core-flows": { status: "ready", updatedAt: null },
              tickets: { status: "ready", updatedAt: iso },
            },
            refinements: {
              ...initiative.workflow.refinements,
              brief: {
                ...initiative.workflow.refinements.brief,
                questions: [],
                history: [briefQuestion],
                answers: { [briefQuestion.id]: "Keep capture fast and obvious" },
                preferredSurface: "review",
                checkedAt: iso,
              },
            },
          },
          updatedAt: iso,
        };
        const { ticket, coverageReview, spec } = createReadyTicketState(nextInitiative.id);
        specDetails.set(spec.id, spec);
        snapshot = setSnapshotMeta(
          {
            ...snapshot,
            initiatives: [nextInitiative],
            tickets: [ticket],
            planningReviews: [coverageReview],
            specs: [
              {
                id: spec.id,
                initiativeId: spec.initiativeId,
                type: spec.type,
                title: spec.title,
                sourcePath: spec.sourcePath,
                createdAt: spec.createdAt,
                updatedAt: spec.updatedAt,
              },
            ],
          },
          nextRevision++,
        );
        return {
          decision: "proceed",
          generated: true,
          blockedSteps: [],
          questions: [],
          assumptions: [],
          markdown: spec.content,
          reviews: [],
        };
      }
      case "initiatives.update": {
        const initiativeId = String(request.params?.id ?? "");
        const body = ((request.params?.body as Record<string, unknown> | undefined) ?? {});
        const initiative = snapshot.initiatives.find((entry) => entry.id === initiativeId);
        if (!initiative) {
          throw new Error(`Unknown initiative update request: ${initiativeId}`);
        }

        const updated: Initiative = {
          ...initiative,
          title: typeof body.title === "string" ? body.title : initiative.title,
          description: typeof body.description === "string" ? body.description : initiative.description,
          phases: Array.isArray(body.phases)
            ? (body.phases as Initiative["phases"])
            : initiative.phases,
          workflow:
            Object.prototype.hasOwnProperty.call(body, "resumeTicketId")
              ? {
                  ...initiative.workflow,
                  resumeTicketId:
                    typeof body.resumeTicketId === "string" && body.resumeTicketId.length > 0
                      ? body.resumeTicketId
                      : null,
                }
              : initiative.workflow,
          updatedAt: iso,
        };

        snapshot = setSnapshotMeta(
          {
            ...snapshot,
            initiatives: snapshot.initiatives.map((entry) =>
              entry.id === updated.id ? updated : entry,
            ),
          },
          nextRevision++,
        );

        return { initiative: updated };
      }
      case "specs.detail": {
        const specId = String(request.params?.id ?? "");
        const spec = specDetails.get(specId);
        if (!spec) {
          throw new Error(`Unknown spec detail request: ${specId}`);
        }
        return { spec };
      }
      case "tickets.exportBundle":
        return {
          runId: "run-12345678",
          attemptId: "attempt-12345678",
          bundlePath: "specflow/runs/run-12345678/attempt-12345678/PROMPT.md",
        };
      case "runs.state": {
        return { run: null, attempts: [] };
      }
      case "runs.attemptDetail":
        throw new Error("Unexpected run attempt detail request in smoke export flow");
      case "operations.status":
        return null;
      case "tickets.capturePreview":
        throw new Error("Unexpected capture preview request in smoke export flow");
      default:
        throw new Error(`Unhandled smoke sidecar request: ${request.method}`);
    }
  };

  return {
    get snapshotRequests() {
      return snapshotRequests;
    },
    get savedZipRequests() {
      return savedZipRequests;
    },
    async invoke(command: string, args: Record<string, unknown>) {
      if (command === "sidecar_request") {
        const request = (args.request ?? {}) as { method: string; params?: Record<string, unknown> };
        return handleSidecarRequest(request);
      }

      if (command === "desktop_pick_project_root") {
        return {
          token: "project-root-token-123",
          displayPath: "/tmp/specflow-smoke-project",
        };
      }

      if (command === "desktop_save_bundle_zip") {
        savedZipRequests.push({
          runId: String(args.runId ?? ""),
          attemptId: String(args.attemptId ?? ""),
          defaultFilename: String(args.defaultFilename ?? ""),
        });
        return { saved: true };
      }

      if (command === "desktop_runtime_status") {
        return {
          transport: "desktop",
          sidecarPid: 1234,
          runtimeGeneration: 1,
          buildFingerprint: "smoke-test",
          restartCount: 0,
          restartPending: false,
        };
      }

      if (command === "sidecar_cancel") {
        return undefined;
      }

      throw new Error(`Unhandled smoke desktop command: ${command}`);
    },
  };
};

describe("App desktop smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTauri).mockReturnValue(true);
    window.history.pushState({}, "", "/new-initiative");
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 900px)" ? false : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("launches the desktop app, creates a project, continues planning, and saves a ZIP bundle", async () => {
    const backend = createDesktopSmokeBackend();

    vi.mocked(invoke).mockImplementation((command, args) => backend.invoke(command, (args ?? {}) as Record<string, unknown>));
    vi.mocked(listen).mockImplementation(async () => () => undefined);

    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "What are you planning?" })).toBeInTheDocument();
    });

    expect(backend.snapshotRequests).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Choose folder" }));
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Project folder" })).toHaveValue("/tmp/specflow-smoke-project");
    });

    fireEvent.change(screen.getByRole("textbox", { name: "Project idea" }), {
      target: { value: "Plan a simple notes app with quick capture." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start brief intake" }));

    await waitFor(() => {
      expect(screen.getByText("What needs to get better first?")).toBeInTheDocument();
    });

    expect(backend.snapshotRequests).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /Keep capture fast and obvious/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Revise answers" })).toBeInTheDocument();
    });
    expect(screen.queryByText("What needs to get better first?")).not.toBeInTheDocument();

    expect(backend.snapshotRequests).toBe(2);

    await act(async () => {
      window.history.pushState({}, "", "/ticket/ticket-12345678");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create bundle" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create bundle" }));

    await waitFor(() => {
      expect(screen.getByText("Bundle tools")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Bundle tools"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save ZIP bundle" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Save ZIP bundle" }));

    await waitFor(() => {
      expect(backend.savedZipRequests).toEqual([
        {
          runId: "run-12345678",
          attemptId: "attempt-12345678",
          defaultFilename: "run-12345678-attempt-12345678-bundle.zip",
        },
      ]);
    });

    expect(backend.snapshotRequests).toBe(3);
  });
});
