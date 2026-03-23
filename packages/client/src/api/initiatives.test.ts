import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  continueInitiativeArtifactStep,
  continueInitiativeValidation,
  generateInitiativePlan,
  saveInitiativeRefinement,
  saveInitiativeSpecs,
} from "./initiatives";

const transportJsonRequestMock = vi.fn();
const transportRequestMock = vi.fn();

vi.mock("./transport", () => ({
  transportJsonRequest: (...args: unknown[]) => transportJsonRequestMock(...args),
  transportRequest: (...args: unknown[]) => transportRequestMock(...args),
  transportSseRequest: (...args: unknown[]) => transportRequestMock(...args),
}));

describe("initiatives api", () => {
  beforeEach(() => {
    transportJsonRequestMock.mockReset();
    transportRequestMock.mockReset();
  });

  it("adds a bounded timeout when saving refinement answers", async () => {
    transportJsonRequestMock.mockResolvedValue({ assumptions: [] });

    await saveInitiativeRefinement("initiative-1", "core-flows", { scope: "notes" }, [], null);

    expect(transportJsonRequestMock).toHaveBeenCalledWith(
      "initiatives.refinement.save",
      {
        id: "initiative-1",
        step: "core-flows",
        body: {
          answers: { scope: "notes" },
          defaultAnswerQuestionIds: [],
          preferredSurface: null
        }
      },
      undefined,
      {
        timeoutMs: 20_000,
        timeoutMessage: "Saving your core flows answers took too long. Try again."
      }
    );
  });

  it("adds a bounded timeout when saving a draft spec", async () => {
    transportJsonRequestMock.mockResolvedValue(undefined);

    await saveInitiativeSpecs("initiative-1", "tech-spec", "# Tech spec");

    expect(transportJsonRequestMock).toHaveBeenCalledWith(
      "initiatives.spec.save",
      {
        id: "initiative-1",
        type: "tech-spec",
        body: { content: "# Tech spec" }
      },
      undefined,
      {
        timeoutMs: 20_000,
        timeoutMessage: "Saving the tech spec draft took too long. Try again."
      }
    );
  });

  it("routes artifact step continuation through the long-running continue method", async () => {
    transportRequestMock.mockResolvedValue({ decision: "proceed", generated: true });

    await continueInitiativeArtifactStep(
      "initiative-1",
      "prd",
      {
        draft: {
          answers: { audience: "Teams" },
          defaultAnswerQuestionIds: [],
          preferredSurface: "questions",
        },
      }
    );

    expect(transportRequestMock).toHaveBeenCalledWith(
      "initiatives.continueArtifactStep",
      {
        id: "initiative-1",
        step: "prd",
        body: {
          draft: {
            answers: { audience: "Teams" },
            defaultAnswerQuestionIds: [],
            preferredSurface: "questions",
          },
        },
      },
      expect.any(Function),
      undefined
    );
  });

  it("routes validation continuation through the long-running continue method", async () => {
    transportRequestMock.mockResolvedValue({ decision: "ask", generated: false, blockedSteps: ["tech-spec"] });

    await continueInitiativeValidation("initiative-1", {
      draftByStep: {
        "tech-spec": {
          answers: { "validation-lww-source": "Server-assigned canonical timestamps" },
          defaultAnswerQuestionIds: [],
          preferredSurface: "questions",
        },
      },
      validationFeedbackByStep: {
        "tech-spec": "Pick the authoritative timestamp source before ticket generation.",
      },
      validationFeedback: "Pick the authoritative timestamp source before ticket generation.",
    });

    expect(transportRequestMock).toHaveBeenCalledWith(
      "initiatives.continueValidation",
      {
        id: "initiative-1",
        body: {
          draftByStep: {
            "tech-spec": {
              answers: { "validation-lww-source": "Server-assigned canonical timestamps" },
              defaultAnswerQuestionIds: [],
              preferredSurface: "questions",
            },
          },
          validationFeedbackByStep: {
            "tech-spec": "Pick the authoritative timestamp source before ticket generation.",
          },
          validationFeedback: "Pick the authoritative timestamp source before ticket generation.",
        },
      },
      expect.any(Function),
      undefined
    );
  });

  it("forwards planner-status notifications during plan generation", async () => {
    const onPlannerStatus = vi.fn();
    transportRequestMock.mockImplementation(async (_method, _params, onEvent) => {
      onEvent?.({
        event: "planner-status",
        payload: { message: "Drafting ticket plan..." },
      });
      onEvent?.({
        event: "planner-token",
        payload: { chunk: "ignore-me" },
      });
      onEvent?.({
        event: "planner-status",
        payload: { message: "Running ticket coverage review..." },
      });

      return { phases: [], uncoveredCoverageItemIds: [] };
    });

    await generateInitiativePlan("initiative-1", { onPlannerStatus });

    expect(onPlannerStatus.mock.calls).toEqual([
      ["Drafting ticket plan..."],
      ["Running ticket coverage review..."],
    ]);
  });

  it("forwards planner-status notifications during validation continuation", async () => {
    const onPlannerStatus = vi.fn();
    transportRequestMock.mockImplementation(async (_method, _params, onEvent) => {
      onEvent?.({
        event: "planner-status",
        payload: { message: "Preparing validation inputs..." },
      });
      onEvent?.({
        event: "planner-status",
        payload: { notMessage: true },
      });

      return { decision: "proceed", generated: true, blockedSteps: [] };
    });

    await continueInitiativeValidation(
      "initiative-1",
      {
        draftByStep: {},
        validationFeedbackByStep: {},
        validationFeedback: null,
      },
      { onPlannerStatus }
    );

    expect(onPlannerStatus.mock.calls).toEqual([
      ["Preparing validation inputs..."],
    ]);
  });
});
