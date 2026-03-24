import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../api/http.js";
import type { Initiative, InitiativeRefinementState } from "../../../types.js";
import { useValidationTicketGeneration } from "./use-validation-ticket-generation.js";

const continueInitiativeValidationMock = vi.fn();
const generateInitiativePlanMock = vi.fn();

vi.mock("../../../api.js", async () => {
  const actual = await vi.importActual<typeof import("../../../api.js")>("../../../api.js");
  return {
    ...actual,
    continueInitiativeValidation: (...args: unknown[]) =>
      continueInitiativeValidationMock(...args),
    generateInitiativePlan: (...args: unknown[]) => generateInitiativePlanMock(...args),
  };
});

const initiative: Initiative = {
  id: "initiative-12345678",
  title: "Local notes",
  description: "Build a lightweight offline-first note-taking app.",
  projectRoot: "/tmp/local-notes",
  status: "draft",
  phases: [],
  specIds: [],
  ticketIds: [],
  workflow: {
    activeStep: "validation",
    resumeTicketId: null,
    steps: {
      brief: { status: "complete", updatedAt: "2026-03-20T09:00:00.000Z" },
      "core-flows": { status: "complete", updatedAt: "2026-03-20T09:05:00.000Z" },
      prd: { status: "complete", updatedAt: "2026-03-20T09:10:00.000Z" },
      "tech-spec": { status: "complete", updatedAt: "2026-03-20T09:15:00.000Z" },
      validation: { status: "ready", updatedAt: "2026-03-20T09:20:00.000Z" },
      tickets: { status: "locked", updatedAt: null },
    },
    refinements: {
      brief: {
        questions: [],
        history: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        preferredSurface: null,
        checkedAt: "2026-03-20T09:00:00.000Z",
      },
      "core-flows": {
        questions: [],
        history: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        preferredSurface: null,
        checkedAt: "2026-03-20T09:05:00.000Z",
      },
      prd: {
        questions: [],
        history: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        preferredSurface: null,
        checkedAt: "2026-03-20T09:10:00.000Z",
      },
      "tech-spec": {
        questions: [],
        history: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        preferredSurface: null,
        checkedAt: "2026-03-20T09:15:00.000Z",
      },
    },
  },
  createdAt: "2026-03-20T09:00:00.000Z",
  updatedAt: "2026-03-20T09:20:00.000Z",
};

const activeRefinement: InitiativeRefinementState = {
  questions: [],
  history: [],
  answers: {},
  defaultAnswerQuestionIds: [],
  baseAssumptions: [],
  preferredSurface: null,
  checkedAt: "2026-03-20T09:20:00.000Z",
};

const FRIENDLY_CONTRACT_MESSAGE =
  "SpecFlow received an incomplete ticket plan from the planner. Try again.";

function ValidationTicketGenerationHarness({
  withBusyAction,
}: {
  withBusyAction: (
    label: string,
    work: (signal: AbortSignal) => Promise<void>
  ) => Promise<"completed" | "cancelled" | "failed">;
}) {
  const { ticketGenerationError, handleGenerateTickets } =
    useValidationTicketGeneration({
      initiative,
      initiativeTicketCount: 0,
      activeStep: "validation",
      activeRefinement,
      refinementAnswers: {},
      defaultAnswerQuestionIds: [],
      validationFeedbackByStep: {},
      validationFeedback: null,
      flushRefinementPersistence: async () => true,
      withBusyAction,
      onRefresh: async () => undefined,
      navigateToStep: () => undefined,
    });

  return (
    <>
      <button type="button" onClick={() => void handleGenerateTickets()}>
        Validate
      </button>
      {ticketGenerationError ? <p>{ticketGenerationError}</p> : null}
    </>
  );
}

describe("useValidationTicketGeneration", () => {
  it("surfaces a friendly message for plan-contract failures", async () => {
    continueInitiativeValidationMock.mockRejectedValue(
      new ApiError(
        500,
        "Plan result missing phases array",
        "planner_plan_contract_error",
        {
          kind: "plan-contract",
          summary: "Plan result missing phases array",
          issues: [],
        },
      ),
    );
    generateInitiativePlanMock.mockReset();
    let surfacedError: Error | null = null;

    const withBusyAction = vi.fn(
      async (
        _label: string,
        work: (signal: AbortSignal) => Promise<void>,
      ): Promise<"completed" | "cancelled" | "failed"> => {
        try {
          await work(new AbortController().signal);
          return "completed";
        } catch (error) {
          surfacedError = error as Error;
          return "failed";
        }
      },
    );

    render(<ValidationTicketGenerationHarness withBusyAction={withBusyAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));

    await waitFor(() => {
      expect(screen.getByText(FRIENDLY_CONTRACT_MESSAGE)).toBeInTheDocument();
    });

    expect(continueInitiativeValidationMock).toHaveBeenCalledTimes(1);
    expect(generateInitiativePlanMock).not.toHaveBeenCalled();
    expect((surfacedError as Error | null)?.message).toBe(
      FRIENDLY_CONTRACT_MESSAGE,
    );
  });
});
