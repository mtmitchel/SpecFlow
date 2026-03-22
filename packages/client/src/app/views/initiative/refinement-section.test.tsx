// @vitest-environment jsdom

import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InitiativeRefinementState } from "../../../types.js";
import { RefinementSection } from "./refinement-section.js";

const activeRefinement: InitiativeRefinementState = {
  questions: [
    {
      id: "brief-problem",
      label: "What primary problem should v1 solve?",
      type: "select",
      whyThisBlocks: "The brief cannot define the right scope until the primary problem is explicit.",
      affectedArtifact: "brief",
      decisionType: "problem",
      assumptionIfUnanswered: "Focus on the user's primary note-taking problem.",
      options: ["Capture something quickly", "Find or organize things better"],
      optionHelp: {
        "Capture something quickly": "Use this when speed matters most."
      },
      recommendedOption: null,
      allowCustomAnswer: true
    }
  ],
  answers: {
    "brief-problem": "Capture something quickly"
  },
  defaultAnswerQuestionIds: [],
  baseAssumptions: [],
  checkedAt: "2026-03-16T20:00:00.000Z"
};

describe("RefinementSection", () => {
  it("shows an inline loading state when follow-up questions are being checked", () => {
    render(
      <RefinementSection
        activeSpecStep="brief"
        activeRefinement={activeRefinement}
        refinementAnswers={activeRefinement.answers}
        defaultAnswerQuestionIds={[]}
        refinementAssumptions={[]}
        refinementSaveState="saved"
        unresolvedQuestionCount={0}
        guidanceQuestionId={null}
        guidanceText={null}
        busyAction="check-brief"
        isBusy
        saveStateIndicator={null}
        loadingStateLabel="Checking brief questions..."
        loadingStateBody="Reviewing your answers before drafting the brief."
        variant="compact"
        onRequestGuidance={vi.fn()}
        onAnswerChange={vi.fn()}
        onAnswerLater={vi.fn()}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Checking brief questions...");
    expect(screen.getByText("Reviewing your answers before drafting the brief.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("planning-intake-loading-compact");
    expect(screen.getByRole("status").closest(".planning-intake-flow")).toHaveClass("planning-intake-flow-loading");
  });

  it("uses a multiline field for custom other answers", () => {
    const refinementWithBooleanQuestion: InitiativeRefinementState = {
      ...activeRefinement,
      questions: [
        {
          id: "brief-sync",
          label: "Should the product include optional cloud sync in the initial design?",
          type: "boolean",
          whyThisBlocks: "This changes the architecture and scope of the first release.",
          affectedArtifact: "brief",
          decisionType: "constraint",
          assumptionIfUnanswered: "Keep the first release local-first.",
          allowCustomAnswer: true
        }
      ],
      answers: {},
      checkedAt: "2026-03-16T20:05:00.000Z"
    };

    render(
      <RefinementSection
        activeSpecStep="brief"
        activeRefinement={refinementWithBooleanQuestion}
        refinementAnswers={{ "brief-sync": "Other" }}
        defaultAnswerQuestionIds={[]}
        refinementAssumptions={[]}
        refinementSaveState="idle"
        unresolvedQuestionCount={1}
        guidanceQuestionId={null}
        guidanceText={null}
        busyAction={null}
        isBusy={false}
        saveStateIndicator={null}
        onRequestGuidance={vi.fn()}
        onAnswerChange={vi.fn()}
        onAnswerLater={vi.fn()}
      />
    );

    const customAnswerField = screen.getByPlaceholderText("Add a custom answer");
    expect(customAnswerField.tagName).toBe("TEXTAREA");
  });

  it("uses the single-question survey layout for compact phase refinements", () => {
    const multiQuestionRefinement: InitiativeRefinementState = {
      ...activeRefinement,
      questions: [
        activeRefinement.questions[0],
        {
          id: "brief-user",
          label: "Who is this for first?",
          type: "select",
          whyThisBlocks: "The brief needs a clear primary user before it can define scope.",
          affectedArtifact: "brief",
          decisionType: "user",
          assumptionIfUnanswered: "Start with one primary user group.",
          options: ["Just me", "A small team I know"],
        },
      ],
      answers: {},
      checkedAt: null,
    };

    render(
      <RefinementSection
        activeSpecStep="core-flows"
        activeRefinement={multiQuestionRefinement}
        refinementAnswers={{}}
        defaultAnswerQuestionIds={[]}
        refinementAssumptions={[]}
        refinementSaveState="idle"
        unresolvedQuestionCount={2}
        guidanceQuestionId={null}
        guidanceText={null}
        busyAction={null}
        isBusy={false}
        saveStateIndicator={null}
        variant="compact"
        onRequestGuidance={vi.fn()}
        onAnswerChange={vi.fn()}
        onAnswerLater={vi.fn()}
      />
    );

    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("What primary problem should v1 solve?")).toBeInTheDocument();
    expect(
      screen.queryByText("The brief cannot define the right scope until the primary problem is explicit.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Who is this for first?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("shows only the loading state in survey mode while a follow-up submit is running", () => {
    render(
      <RefinementSection
        activeSpecStep="tech-spec"
        activeRefinement={activeRefinement}
        refinementAnswers={activeRefinement.answers}
        defaultAnswerQuestionIds={[]}
        refinementAssumptions={[]}
        refinementSaveState="saved"
        unresolvedQuestionCount={0}
        guidanceQuestionId={null}
        guidanceText={null}
        busyAction={null}
        isBusy={false}
        saveStateIndicator={null}
        loadingStateLabel="Checking tech spec questions..."
        loadingStateBody="Reviewing your answers before drafting the tech spec."
        variant="survey"
        onRequestGuidance={vi.fn()}
        onAnswerChange={vi.fn()}
        onAnswerLater={vi.fn()}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Checking tech spec questions...");
    expect(screen.queryByRole("heading", { name: "What primary problem should v1 solve?" })).not.toBeInTheDocument();
    expect(screen.queryByText("All questions are answered")).not.toBeInTheDocument();
  });

  it("still shows a custom answer affordance for select questions when the planner omits allowCustomAnswer", () => {
    render(
      <RefinementSection
        activeSpecStep="brief"
        activeRefinement={{
          ...activeRefinement,
          questions: [
            {
              ...activeRefinement.questions[0],
              allowCustomAnswer: false,
            },
          ],
        }}
        refinementAnswers={{ "brief-problem": "Capture something quickly" }}
        defaultAnswerQuestionIds={[]}
        refinementAssumptions={[]}
        refinementSaveState="idle"
        unresolvedQuestionCount={1}
        guidanceQuestionId={null}
        guidanceText={null}
        busyAction={null}
        isBusy={false}
        saveStateIndicator={null}
        onRequestGuidance={vi.fn()}
        onAnswerChange={vi.fn()}
        onAnswerLater={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /Other/ })).toBeInTheDocument();
  });

  it("keeps boolean questions strict unless they explicitly allow a custom answer", () => {
    render(
      <RefinementSection
        activeSpecStep="brief"
        activeRefinement={{
          ...activeRefinement,
          questions: [
            {
              id: "brief-sync",
              label: "Should the product include optional cloud sync in the initial design?",
              type: "boolean",
              whyThisBlocks: "This changes the architecture and scope of the first release.",
              affectedArtifact: "brief",
              decisionType: "constraint",
              assumptionIfUnanswered: "Keep the first release local-first.",
              allowCustomAnswer: false,
            },
          ],
        }}
        refinementAnswers={{}}
        defaultAnswerQuestionIds={[]}
        refinementAssumptions={[]}
        refinementSaveState="idle"
        unresolvedQuestionCount={1}
        guidanceQuestionId={null}
        guidanceText={null}
        busyAction={null}
        isBusy={false}
        saveStateIndicator={null}
        variant="survey"
        onRequestGuidance={vi.fn()}
        onAnswerChange={vi.fn()}
        onAnswerLater={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Other" })).not.toBeInTheDocument();
  });

  it("shows earlier-question context when a blocker reopens a prior decision", () => {
    render(
      <RefinementSection
        activeSpecStep="prd"
        activeRefinement={{
          ...activeRefinement,
          questions: [
            {
              id: "prd-compatibility",
              label: "What compatibility promise should v1 keep for existing imports?",
              type: "select",
              whyThisBlocks: "The PRD needs to say what existing data must still work after launch.",
              affectedArtifact: "prd",
              decisionType: "compatibility",
              assumptionIfUnanswered: "Keep existing imports readable in v1.",
              options: ["Support current import files", "Require a one-time migration"],
              reopensQuestionIds: ["brief-problem"],
            },
          ],
          answers: {},
        }}
        reopenedQuestionContext={{
          "brief-problem": {
            questionId: "brief-problem",
            stepLabel: "Brief",
            questionLabel: "What primary problem should v1 solve?",
            resolutionLabel: "Earlier answer: Capture something quickly",
          },
        }}
        refinementAnswers={{}}
        defaultAnswerQuestionIds={[]}
        refinementAssumptions={[]}
        refinementSaveState="idle"
        unresolvedQuestionCount={1}
        guidanceQuestionId={null}
        guidanceText={null}
        busyAction={null}
        isBusy={false}
        saveStateIndicator={null}
        variant="survey"
        onRequestGuidance={vi.fn()}
        onAnswerChange={vi.fn()}
        onAnswerLater={vi.fn()}
      />
    );

    const earlierDecisionContext = screen.getByLabelText("Earlier decision context");

    expect(screen.queryByText("Reopening an earlier decision")).not.toBeInTheDocument();
    expect(earlierDecisionContext).toHaveTextContent("Brief");
    expect(earlierDecisionContext).toHaveTextContent("Earlier answer: Capture something quickly");
  });

  it("shows reopened follow-up blockers as one survey step with earlier-answer context", () => {
    const onBackToPreviousStep = vi.fn();

    render(
      <RefinementSection
        activeSpecStep="core-flows"
        activeRefinement={{
          ...activeRefinement,
          questions: [
            {
              id: "core-flows-empty-note",
              label: "How should the app handle notes that are created but left empty?",
              type: "select",
              whyThisBlocks: "Empty-note handling changes the flow when the user leaves a draft behind.",
              affectedArtifact: "core-flows",
              decisionType: "branch",
              assumptionIfUnanswered: "Move empty notes to Trash automatically.",
              options: ["Keep empty notes", "Move empty notes to Trash automatically"],
              optionHelp: {
                "Keep empty notes": "Keep empty drafts visible in the library.",
                "Move empty notes to Trash automatically": "Treat empty drafts as recoverable clutter.",
              },
              reopensQuestionIds: ["brief-problem"],
            },
          ],
          history: [
            activeRefinement.questions[0],
            {
              id: "core-flows-empty-note",
              label: "How should the app handle notes that are created but left empty?",
              type: "select",
              whyThisBlocks: "Empty-note handling changes the flow when the user leaves a draft behind.",
              affectedArtifact: "core-flows",
              decisionType: "branch",
              assumptionIfUnanswered: "Move empty notes to Trash automatically.",
              options: ["Keep empty notes", "Move empty notes to Trash automatically"],
              optionHelp: {
                "Keep empty notes": "Keep empty drafts visible in the library.",
                "Move empty notes to Trash automatically": "Treat empty drafts as recoverable clutter.",
              },
              reopensQuestionIds: ["brief-problem"],
            },
          ],
          answers: {
            "brief-problem": "Capture something quickly",
          },
        }}
        reopenedQuestionContext={{
          "brief-problem": {
            questionId: "brief-problem",
            stepLabel: "Brief",
            questionLabel: "What primary problem should v1 solve?",
            resolutionLabel: "Earlier answer: Capture something quickly",
          },
        }}
        refinementAnswers={{ "brief-problem": "Capture something quickly" }}
        defaultAnswerQuestionIds={[]}
        refinementAssumptions={[]}
        refinementSaveState="saved"
        unresolvedQuestionCount={1}
        guidanceQuestionId={null}
        guidanceText={null}
        busyAction={null}
        isBusy={false}
        saveStateIndicator={null}
        variant="survey"
        onBackToPreviousStep={onBackToPreviousStep}
        onRequestGuidance={vi.fn()}
        onAnswerChange={vi.fn()}
        onAnswerLater={vi.fn()}
      />
    );

    expect(screen.getByText("Step 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How should the app handle notes that are created but left empty?" })).toBeInTheDocument();
    const earlierDecisionContext = screen.getByLabelText("Earlier decision context");

    expect(screen.queryByText("Reopening an earlier decision")).not.toBeInTheDocument();
    expect(earlierDecisionContext).toHaveTextContent("Brief");
    expect(earlierDecisionContext).toHaveTextContent("Earlier answer: Capture something quickly");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(onBackToPreviousStep).toHaveBeenCalledTimes(1);
  });

  it("keeps Back for the previous stage and uses a separate button for the previous question", () => {
    const onBackToPreviousStep = vi.fn();

    render(
      <RefinementSection
        activeSpecStep="prd"
        activeRefinement={{
          ...activeRefinement,
          questions: [
            activeRefinement.questions[0],
            {
              id: "brief-user",
              label: "Who is this for first?",
              type: "select",
              whyThisBlocks: "The brief needs a clear primary user before it can define scope.",
              affectedArtifact: "brief",
              decisionType: "user",
              assumptionIfUnanswered: "Start with one primary user group.",
              options: ["Just me", "A small team I know"],
            },
          ],
          answers: {},
        }}
        refinementAnswers={{ "brief-problem": "Capture something quickly" }}
        defaultAnswerQuestionIds={[]}
        refinementAssumptions={[]}
        refinementSaveState="idle"
        unresolvedQuestionCount={2}
        guidanceQuestionId={null}
        guidanceText={null}
        busyAction={null}
        isBusy={false}
        saveStateIndicator={null}
        variant="survey"
        onBackToPreviousStep={onBackToPreviousStep}
        onRequestGuidance={vi.fn()}
        onAnswerChange={vi.fn()}
        onAnswerLater={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("heading", { name: "Who is this for first?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous question" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous question" }));

    expect(screen.getByRole("heading", { name: "What primary problem should v1 solve?" })).toBeInTheDocument();
    expect(onBackToPreviousStep).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(onBackToPreviousStep).toHaveBeenCalledTimes(1);
  });

  it("skips already answered questions when continuing through the survey deck", () => {
    const multiQuestionRefinement: InitiativeRefinementState = {
      ...activeRefinement,
      questions: [
        {
          id: "core-launch-view",
          label: "On launch, should the app open ready to write or show the notes browser first?",
          type: "select",
          whyThisBlocks: "Launch posture changes the primary user flow.",
          affectedArtifact: "core-flows",
          decisionType: "journey",
          assumptionIfUnanswered: "Open ready to write.",
          options: ["Open ready to write", "Show notes browser first"],
        },
        {
          id: "core-inline-editing",
          label: "Should cards support inline editing in the grid?",
          type: "boolean",
          whyThisBlocks: "Inline editing changes how the grid and editor relate.",
          affectedArtifact: "core-flows",
          decisionType: "behavior",
          assumptionIfUnanswered: "Keep editing in the full editor.",
          allowCustomAnswer: false,
        },
        {
          id: "core-delete-timing",
          label: "When should notes move to trash?",
          type: "select",
          whyThisBlocks: "Delete timing changes recovery and cleanup behavior.",
          affectedArtifact: "core-flows",
          decisionType: "journey",
          assumptionIfUnanswered: "Move them on explicit delete only.",
          options: ["Move on explicit delete", "Auto-trash empty drafts"],
        },
      ],
      answers: {},
      checkedAt: null,
    };
    const SurveyHarness = () => {
      const [answers, setAnswers] = useState<Record<string, string | string[] | boolean>>({
        "core-inline-editing": true,
      });

      return (
        <RefinementSection
          activeSpecStep="core-flows"
          activeRefinement={multiQuestionRefinement}
          refinementAnswers={answers}
          defaultAnswerQuestionIds={[]}
          refinementAssumptions={[]}
          refinementSaveState="saved"
          unresolvedQuestionCount={2}
          guidanceQuestionId={null}
          guidanceText={null}
          busyAction={null}
          isBusy={false}
          saveStateIndicator={null}
          variant="survey"
          onRequestGuidance={vi.fn()}
          onAnswerChange={(questionId, nextValue) => {
            setAnswers((current) => ({
              ...current,
              [questionId]: nextValue,
            }));
          }}
          onAnswerLater={vi.fn()}
        />
      );
    };

    render(<SurveyHarness />);

    expect(
      screen.getByRole("heading", {
        name: "On launch, should the app open ready to write or show the notes browser first?",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Open ready to write\b/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("heading", { name: "When should notes move to trash?" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Should cards support inline editing in the grid?" })).not.toBeInTheDocument();
  });

  it("shows completion instead of reopening the same question when local answers are ahead of the unresolved count", () => {
    const singleQuestionRefinement: InitiativeRefinementState = {
      ...activeRefinement,
      questions: [
        {
          id: "core-inline-editing",
          label: "Should cards support inline editing in the grid?",
          type: "boolean",
          whyThisBlocks: "Inline editing changes how the grid and editor relate.",
          affectedArtifact: "core-flows",
          decisionType: "behavior",
          assumptionIfUnanswered: "Keep editing in the full editor.",
          allowCustomAnswer: false,
        },
      ],
      answers: {},
      checkedAt: null,
    };

    const SurveyHarness = () => {
      const [answers, setAnswers] = useState<Record<string, string | string[] | boolean>>({});

      return (
        <RefinementSection
          activeSpecStep="core-flows"
          activeRefinement={singleQuestionRefinement}
          refinementAnswers={answers}
          defaultAnswerQuestionIds={[]}
          refinementAssumptions={[]}
          refinementSaveState="saved"
          unresolvedQuestionCount={1}
          guidanceQuestionId={null}
          guidanceText={null}
          busyAction={null}
          isBusy={false}
          saveStateIndicator={null}
          variant="survey"
          onRequestGuidance={vi.fn()}
          onAnswerChange={(questionId, nextValue) => {
            setAnswers((current) => ({
              ...current,
              [questionId]: nextValue,
            }));
          }}
          onAnswerLater={vi.fn()}
        />
      );
    };

    render(<SurveyHarness />);

    fireEvent.click(screen.getByRole("button", { name: /^Yes\b/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("heading", { name: "All questions are answered" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Should cards support inline editing in the grid?" })).not.toBeInTheDocument();
  });
});
