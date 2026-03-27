import { describe, expect, it } from "vitest";
import type { InitiativePlanningQuestion } from "../src/types/entities.js";
import type { PhaseCheckInput, PhaseCheckResult, RefinementHistoryEntry } from "../src/planner/types.js";
import { validatePhaseCheckResult } from "../src/planner/internal/validators.js";

const makeSelectQuestion = (
  input: Partial<InitiativePlanningQuestion> & Pick<InitiativePlanningQuestion, "id" | "label" | "decisionType">
): InitiativePlanningQuestion => ({
  id: input.id,
  label: input.label,
  type: input.type ?? "select",
  whyThisBlocks: input.whyThisBlocks ?? "This blocks the current artifact until the decision is explicit.",
  affectedArtifact: input.affectedArtifact ?? "prd",
  decisionType: input.decisionType,
  assumptionIfUnanswered: input.assumptionIfUnanswered ?? "Assume the narrowest default.",
  options: input.options ?? ["Option A", "Option B"],
  optionHelp:
    input.optionHelp ?? {
      "Option A": "Keeps the first draft narrow.",
      "Option B": "Expands the first draft in a material way."
    },
  recommendedOption: input.recommendedOption ?? (input.options ?? ["Option A"])[0] ?? null,
  allowCustomAnswer: input.allowCustomAnswer ?? false,
  reopensQuestionIds: input.reopensQuestionIds
});

const makeInput = (overrides: Partial<PhaseCheckInput> = {}): PhaseCheckInput => ({
  initiativeDescription: "Build an internal planning tool",
  phase: "prd",
  briefMarkdown: "# Brief",
  coreFlowsMarkdown: "# Core flows",
  savedContext: {},
  refinementHistory: [],
  ...overrides
});

const makeResult = (questions: InitiativePlanningQuestion[]): PhaseCheckResult => ({
  decision: "ask",
  questions,
  assumptions: []
});

describe("planner validator boundaries", () => {
  it("accepts the legacy verification alias for tech-spec questions", () => {
    const input = makeInput({
      phase: "tech-spec",
      prdMarkdown: "# PRD",
      requiredStarterQuestionCount: 1
    });

    const result = makeResult([
      makeSelectQuestion({
        id: "tech-architecture",
        label: "Which architecture direction should v1 use?",
        affectedArtifact: "tech-spec",
        decisionType: "architecture"
      }),
      makeSelectQuestion({
        id: "tech-quality",
        label: "Which verification approach should define quality first?",
        affectedArtifact: "tech-spec",
        decisionType: "verification",
        options: ["Automated tests first", "Observability first"],
        optionHelp: {
          "Automated tests first": "Pushes the spec toward test-heavy verification hooks.",
          "Observability first": "Pushes the spec toward runtime health signals and diagnostics."
        }
      })
    ]);

    expect(() => validatePhaseCheckResult(result, input)).not.toThrow();
  });

  it("rejects ampersands in refinement questions", () => {
    const result = makeResult([
      makeSelectQuestion({
        id: "prd-scope-and-users",
        label: "Which users & scope boundary matter most?",
        decisionType: "scope",
      }),
    ]);

    expect(() => validatePhaseCheckResult(result, makeInput())).toThrow(
      'Refinement question prd-scope-and-users label must not use ampersands. Write "and" instead.'
    );
  });

  it("rejects select questions that restate multiple options in the label", () => {
    const result = makeResult([
      makeSelectQuestion({
        id: "brief-problem",
        affectedArtifact: "brief",
        decisionType: "problem",
        label:
          "Which problem should the note app be centered on first: quick capture, simple organization with tags, or switching between clean writing and visual browsing?",
        options: [
          "Quick capture",
          "Simple organization with tags",
          "Switching between clean writing and visual browsing",
        ],
        optionHelp: {
          "Quick capture": "Keep the first release centered on getting notes down quickly.",
          "Simple organization with tags": "Keep the first release centered on lightweight organization.",
          "Switching between clean writing and visual browsing":
            "Keep the first release centered on moving between writing and browsing.",
        },
      }),
    ]);

    expect(() => validatePhaseCheckResult(result, makeInput({ phase: "brief" }))).toThrow(
      "restates answer options in the label",
    );
  });

  it("allows a same-stage narrower follow-up when the decision boundary changes", () => {
    const priorQuestion = makeSelectQuestion({
      id: "prd-scope-1",
      label: "Which v1 scope boundary matters most?",
      whyThisBlocks: "The PRD cannot commit to a product contract without a primary scope boundary.",
      decisionType: "scope",
      options: ["Single-user only", "No external integrations in v1"],
      optionHelp: {
        "Single-user only": "Keeps the product contract focused on one user's workflow first.",
        "No external integrations in v1": "Keeps the first release narrow and avoids integration promises."
      }
    });

    const result = makeResult([
      makeSelectQuestion({
        id: "prd-scope-2",
        label: "Which user-management boundary matters most in v1?",
        whyThisBlocks: "The user-management model changes roles, permissions, and navigation.",
        decisionType: "scope",
        options: ["Admins only", "Managers and admins"],
        optionHelp: {
          "Admins only": "Keeps the first release limited to administrative workflows.",
          "Managers and admins": "Expands the first release to a second user group."
        }
      })
    ]);

    expect(() => validatePhaseCheckResult(result, makeInput(), [priorQuestion])).not.toThrow();
  });

  it("rejects cross-stage duplicates that do not explicitly reopen the earlier concern", () => {
    const refinementHistory: RefinementHistoryEntry[] = [
      {
        step: "brief",
        questionId: "brief-existing-system",
        label: "Which existing system must v1 stay compatible with?",
        decisionType: "constraint",
        whyThisBlocks: "The brief needs the existing-system boundary.",
        resolution: "answered",
        answer: "CRM",
        assumption: null
      }
    ];

    const result = makeResult([
      makeSelectQuestion({
        id: "prd-compatibility",
        label: "Which existing system does v1 need to stay compatible with?",
        decisionType: "compatibility",
        options: ["CRM", "ERP"],
        optionHelp: {
          "CRM": "Keeps the PRD compatible with the CRM workflows already in use.",
          "ERP": "Keeps the PRD compatible with ERP workflows."
        }
      })
    ]);

    expect(() => validatePhaseCheckResult(result, makeInput({ refinementHistory }))).toThrow(
      "reopens earlier concern brief-existing-system without reopensQuestionIds"
    );
  });

  it("accepts cross-stage reopen questions when they reference the earlier blocker", () => {
    const refinementHistory: RefinementHistoryEntry[] = [
      {
        step: "brief",
        questionId: "brief-existing-system",
        label: "Which existing system must v1 stay compatible with?",
        decisionType: "constraint",
        whyThisBlocks: "The brief needs the existing-system boundary.",
        resolution: "answered",
        answer: "CRM",
        assumption: null
      }
    ];

    const result = makeResult([
      makeSelectQuestion({
        id: "prd-compatibility",
        label: "Which existing system does v1 need to stay compatible with?",
        decisionType: "compatibility",
        whyThisBlocks: "The PRD needs the explicit compatibility promise before it can define user-visible migration behavior.",
        options: ["CRM", "ERP"],
        optionHelp: {
          "CRM": "Keeps the PRD compatible with the CRM workflows already in use.",
          "ERP": "Keeps the PRD compatible with ERP workflows."
        },
        reopensQuestionIds: ["brief-existing-system"]
      })
    ]);

    expect(() => validatePhaseCheckResult(result, makeInput({ refinementHistory }))).not.toThrow();
  });

  it("rejects same-stage duplicates from history when they do not explicitly reopen the earlier concern", () => {
    const refinementHistory: RefinementHistoryEntry[] = [
      {
        step: "core-flows",
        questionId: "core-flows-empty-note",
        label: "What should happen when a note is empty and the user backs out?",
        decisionType: "branch",
        whyThisBlocks: "Core flows need the empty-note exit path before the draft can stay coherent.",
        resolution: "answered",
        answer: "Discard the draft",
        assumption: null,
      },
    ];

    const input = makeInput({
      phase: "core-flows",
      prdMarkdown: undefined,
      requiredStarterQuestionCount: 0,
      refinementHistory,
    });

    const result = makeResult([
      makeSelectQuestion({
        id: "core-flows-empty-note-follow-up",
        affectedArtifact: "core-flows",
        label: "What should happen when a note is empty and the user backs out?",
        decisionType: "failure-mode",
        options: ["Discard the draft", "Keep an empty draft"],
        optionHelp: {
          "Discard the draft": "Treat background close as a silent exit from the empty-note path.",
          "Keep an empty draft": "Keep the empty note available when the user comes back.",
        },
      }),
    ]);

    expect(() => validatePhaseCheckResult(result, input)).toThrow(
      "reopens earlier concern core-flows-empty-note without reopensQuestionIds"
    );
  });

  it("accepts same-stage reopen questions when they reference the earlier blocker", () => {
    const refinementHistory: RefinementHistoryEntry[] = [
      {
        step: "core-flows",
        questionId: "core-flows-empty-note",
        label: "What should happen when a note is empty and the user backs out?",
        decisionType: "branch",
        whyThisBlocks: "Core flows need the empty-note exit path before the draft can stay coherent.",
        resolution: "answered",
        answer: "Discard the draft",
        assumption: null,
      },
    ];

    const input = makeInput({
      phase: "core-flows",
      prdMarkdown: undefined,
      requiredStarterQuestionCount: 0,
      refinementHistory,
    });

    const result = makeResult([
      makeSelectQuestion({
        id: "core-flows-empty-note-follow-up",
        affectedArtifact: "core-flows",
        label: "What should happen when a note is empty and the user backs out?",
        decisionType: "failure-mode",
        options: ["Discard the draft", "Keep an empty draft"],
        optionHelp: {
          "Discard the draft": "Treat background close as a silent exit from the empty-note path.",
          "Keep an empty draft": "Keep the empty note available when the user comes back.",
        },
        reopensQuestionIds: ["core-flows-empty-note"],
      }),
    ]);

    expect(() => validatePhaseCheckResult(result, input)).not.toThrow();
  });

  it("accepts versioned reopen ids for the same concern", () => {
    const refinementHistory: RefinementHistoryEntry[] = [
      {
        step: "core-flows",
        questionId: "empty-note-behavior",
        label: "What should happen when a user clears a note after capture starts?",
        decisionType: "branch",
        whyThisBlocks: "Core flows need the empty-note path before the draft can stay coherent.",
        resolution: "answered",
        answer: "Move the note to Trash",
        assumption: null,
      },
    ];

    const input = makeInput({
      phase: "core-flows",
      prdMarkdown: undefined,
      requiredStarterQuestionCount: 0,
      refinementHistory,
    });

    const result = makeResult([
      makeSelectQuestion({
        id: "empty-note-behavior-v1",
        affectedArtifact: "core-flows",
        label: "What should happen if a draft note is cleared after capture starts?",
        decisionType: "failure-mode",
        options: ["Remove the note", "Keep a blank draft"],
        optionHelp: {
          "Remove the note": "Treat a fully emptied note as a delete outcome in the v1 flow.",
          "Keep a blank draft": "Keep an empty note available after the content is removed."
        },
        reopensQuestionIds: ["empty-note-behavior"],
      }),
    ]);

    expect(() => validatePhaseCheckResult(result, input)).not.toThrow();
  });

  it("accepts explicit reopen references when the regenerated concern id keeps the same semantic tokens", () => {
    const refinementHistory: RefinementHistoryEntry[] = [
      {
        step: "prd",
        questionId: "grid-capture-v1",
        label: "Should the grid support creating notes directly from the board?",
        decisionType: "behavior",
        whyThisBlocks: "The PRD needs the grid-entry behavior before the product contract is stable.",
        resolution: "answered",
        answer: "No inline capture in grid view",
        assumption: null,
      },
    ];

    const input = makeInput({
      phase: "prd",
      refinementHistory,
    });

    const result = makeResult([
      makeSelectQuestion({
        id: "grid-quick-capture-prd",
        affectedArtifact: "prd",
        label: "Should users be able to start typing from a grid card without opening the full editor?",
        decisionType: "behavior",
        options: ["Yes, from each grid card", "No, open the full editor first"],
        optionHelp: {
          "Yes, from each grid card": "Makes quick grid capture part of the product contract.",
          "No, open the full editor first": "Keeps grid cards read-only and routes capture through the editor."
        },
        reopensQuestionIds: ["grid-capture-v1"],
      }),
    ]);

    expect(() => validatePhaseCheckResult(result, input)).not.toThrow();
  });

  it("still rejects explicit reopen references for genuinely unrelated concerns", () => {
    const refinementHistory: RefinementHistoryEntry[] = [
      {
        step: "prd",
        questionId: "grid-capture-v1",
        label: "Should the grid support creating notes directly from the board?",
        decisionType: "behavior",
        whyThisBlocks: "The PRD needs the grid-entry behavior before the product contract is stable.",
        resolution: "answered",
        answer: "No inline capture in grid view",
        assumption: null,
      },
    ];

    const input = makeInput({
      phase: "prd",
      refinementHistory,
    });

    const result = makeResult([
      makeSelectQuestion({
        id: "offline-retention-prd",
        affectedArtifact: "prd",
        label: "How long should offline edits stay queued before the app asks the user to resolve sync issues?",
        decisionType: "behavior",
        options: ["Queue indefinitely", "Prompt after 24 hours"],
        optionHelp: {
          "Queue indefinitely": "Keeps offline work silent until the user explicitly checks sync state.",
          "Prompt after 24 hours": "Adds a user-visible escalation threshold to the sync contract."
        },
        reopensQuestionIds: ["grid-capture-v1"],
      }),
    ]);

    expect(() => validatePhaseCheckResult(result, input)).toThrow(
      "reopens unrelated prior concern grid-capture-v1"
    );
  });

  it("allows conditional forbidden terms when the initiative already uses that domain language", () => {
    const result = makeResult([
      makeSelectQuestion({
        id: "prd-api-behavior",
        label: "Which API behavior matters most in v1?",
        decisionType: "behavior",
        options: ["Synchronous responses", "Async job handoff"],
        optionHelp: {
          "Synchronous responses": "Keeps the user-visible contract focused on immediate responses.",
          "Async job handoff": "Keeps the user-visible contract focused on background work."
        }
      })
    ]);

    expect(() =>
      validatePhaseCheckResult(
        result,
        makeInput({ initiativeDescription: "Build a REST API for internal user management" })
      )
    ).not.toThrow();
  });

  it("allows a core-flows question about remembered view state when it changes the next path", () => {
    const input = makeInput({
      phase: "core-flows",
      prdMarkdown: undefined,
      requiredStarterQuestionCount: 3
    });

    const result = makeResult([
      makeSelectQuestion({
        id: "core-flows-view-toggle",
        affectedArtifact: "core-flows",
        label: "Should the app reopen in the last view the user picked?",
        decisionType: "state",
        options: ["Always reopen in the last view", "Always reopen in the default capture view"],
        optionHelp: {
          "Always reopen in the last view": "Treat the remembered view as part of the return path into the app.",
          "Always reopen in the default capture view": "Treat the first screen as a fixed entry path every time."
        }
      }),
      makeSelectQuestion({
        id: "core-flows-branch",
        affectedArtifact: "core-flows",
        label: "What should happen when a note is empty and the user backs out?",
        decisionType: "branch",
        options: ["Discard the draft", "Keep an empty draft"],
        optionHelp: {
          "Discard the draft": "Treat leaving early as an explicit exit branch.",
          "Keep an empty draft": "Treat the saved draft list as part of the flow."
        }
      }),
      makeSelectQuestion({
        id: "core-flows-journey",
        affectedArtifact: "core-flows",
        label: "Which primary path matters most first?",
        decisionType: "journey",
        options: ["Create and edit a note", "Search an existing note"],
        optionHelp: {
          "Create and edit a note": "Center the first draft on authoring.",
          "Search an existing note": "Center the first draft on retrieval."
        }
      })
    ]);

    expect(() => validatePhaseCheckResult(result, input)).not.toThrow();
  });

  it("rejects a core-flows question that turns remembered state into a storage implementation question", () => {
    const input = makeInput({
      phase: "core-flows",
      prdMarkdown: undefined,
      requiredStarterQuestionCount: 3
    });

    const result = makeResult([
      makeSelectQuestion({
        id: "core-flows-view-storage",
        affectedArtifact: "core-flows",
        label: "Should the selected view persist to disk between launches?",
        decisionType: "state",
        options: ["Yes", "No"],
        optionHelp: {
          "Yes": "Make the implementation store the chosen view on disk.",
          "No": "Do not store the chosen view on disk."
        }
      }),
      makeSelectQuestion({
        id: "core-flows-branch",
        affectedArtifact: "core-flows",
        label: "What should happen when a note is empty and the user backs out?",
        decisionType: "branch",
        options: ["Discard the draft", "Keep an empty draft"],
        optionHelp: {
          "Discard the draft": "Treat leaving early as an explicit exit branch.",
          "Keep an empty draft": "Treat the saved draft list as part of the flow."
        }
      }),
      makeSelectQuestion({
        id: "core-flows-journey",
        affectedArtifact: "core-flows",
        label: "Which primary path matters most first?",
        decisionType: "journey",
        options: ["Create and edit a note", "Search an existing note"],
        optionHelp: {
          "Create and edit a note": "Center the first draft on authoring.",
          "Search an existing note": "Center the first draft on retrieval."
        }
      })
    ]);

    expect(() => validatePhaseCheckResult(result, input)).toThrow(
      'Refinement question core-flows-view-storage includes forbidden core-flows theme "persist to disk"'
    );
  });

  it("rejects a core-flows question that turns platform targeting into a flow blocker", () => {
    const input = makeInput({
      phase: "core-flows",
      prdMarkdown: undefined,
      requiredStarterQuestionCount: 3
    });

    const result = makeResult([
      makeSelectQuestion({
        id: "core-flows-platform-target",
        affectedArtifact: "core-flows",
        label: "Which platform(s) should v1 target?",
        decisionType: "state",
        whyThisBlocks:
          "Platform choice changes storage APIs and offline persistence approach, packaging and payload constraints, and the minimum supported environments.",
        options: [
          "Web-first PWA",
          "Desktop-native",
          "Mobile-native"
        ],
        optionHelp: {
          "Web-first PWA": "Treat installable web delivery as the first platform target.",
          "Desktop-native": "Treat desktop packaging as the first platform target.",
          "Mobile-native": "Treat native mobile delivery as the first platform target."
        }
      }),
      makeSelectQuestion({
        id: "core-flows-branch",
        affectedArtifact: "core-flows",
        label: "What should happen when a note is empty and the user backs out?",
        decisionType: "branch",
        options: ["Discard the draft", "Keep an empty draft"],
        optionHelp: {
          "Discard the draft": "Treat leaving early as an explicit exit branch.",
          "Keep an empty draft": "Treat the saved draft list as part of the flow."
        }
      }),
      makeSelectQuestion({
        id: "core-flows-journey",
        affectedArtifact: "core-flows",
        label: "Which primary path matters most first?",
        decisionType: "journey",
        options: ["Create and edit a note", "Search an existing note"],
        optionHelp: {
          "Create and edit a note": "Center the first draft on authoring.",
          "Search an existing note": "Center the first draft on retrieval."
        }
      })
    ]);

    expect(() => validatePhaseCheckResult(result, input)).toThrow(
      'Refinement question core-flows-platform-target includes forbidden core-flows theme "which platform"'
    );
  });

  it("accepts a failure-mode question as the required core-flows edge-path starter question", () => {
    const input = makeInput({
      phase: "core-flows",
      prdMarkdown: undefined,
      requiredStarterQuestionCount: 3
    });

    const result = makeResult([
      makeSelectQuestion({
        id: "core-flows-journey",
        affectedArtifact: "core-flows",
        label: "Which primary path matters most first?",
        decisionType: "journey",
        options: ["Create and edit a note", "Search an existing note"],
        optionHelp: {
          "Create and edit a note": "Center the first draft on authoring.",
          "Search an existing note": "Center the first draft on retrieval."
        }
      }),
      makeSelectQuestion({
        id: "core-flows-recovery",
        affectedArtifact: "core-flows",
        label: "What should happen if the app reopens after an interrupted edit?",
        decisionType: "failure-mode",
        options: ["Restore the draft", "Show the notes list first"],
        optionHelp: {
          "Restore the draft": "Treat interrupted work as a degraded-path recovery flow.",
          "Show the notes list first": "Treat recovery as a manual return path."
        }
      }),
      makeSelectQuestion({
        id: "core-flows-state",
        affectedArtifact: "core-flows",
        label: "Should the app reopen in the last view the user picked?",
        decisionType: "state",
        options: ["Always reopen in the last view", "Always reopen in the default capture view"],
        optionHelp: {
          "Always reopen in the last view": "Treat the remembered view as part of the return path into the app.",
          "Always reopen in the default capture view": "Treat the first screen as a fixed entry path every time."
        }
      })
    ]);

    expect(() => validatePhaseCheckResult(result, input)).not.toThrow();
  });
});
