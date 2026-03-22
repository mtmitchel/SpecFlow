import { describe, expect, it } from "vitest";
import { createInitiativeWorkflow, normalizeInitiativeWorkflow } from "../src/planner/workflow-state.js";

const NO_ARTIFACTS = {
  hasBrief: false,
  hasCoreFlows: false,
  hasPrd: false,
  hasTechSpec: false,
  hasValidation: false,
  hasTickets: false,
};

describe("normalizeInitiativeWorkflow", () => {
  it("promotes a locked downstream step when its prerequisite artifact exists", () => {
    const persisted = createInitiativeWorkflow();
    persisted.steps.brief.status = "complete";
    persisted.steps["core-flows"].status = "locked";

    const result = normalizeInitiativeWorkflow(persisted, {
      ...NO_ARTIFACTS,
      hasBrief: true,
    });

    expect(result.steps.brief.status).toBe("complete");
    expect(result.steps["core-flows"].status).toBe("ready");
  });

  it("keeps a locked step when its prerequisite artifact does not exist", () => {
    const persisted = createInitiativeWorkflow();
    persisted.steps.brief.status = "ready";
    persisted.steps["core-flows"].status = "locked";

    const result = normalizeInitiativeWorkflow(persisted, NO_ARTIFACTS);

    expect(result.steps["core-flows"].status).toBe("locked");
  });

  it("keeps a locked downstream step when its prerequisite is stale from invalidation", () => {
    const persisted = createInitiativeWorkflow();
    persisted.steps.brief.status = "stale";
    persisted.steps["core-flows"].status = "locked";

    const result = normalizeInitiativeWorkflow(persisted, {
      ...NO_ARTIFACTS,
      hasBrief: true,
    });

    expect(result.steps.brief.status).toBe("stale");
    expect(result.steps["core-flows"].status).toBe("locked");
  });

  it("does not override a persisted ready or complete status", () => {
    const persisted = createInitiativeWorkflow();
    persisted.steps.brief.status = "complete";
    persisted.steps["core-flows"].status = "ready";

    const result = normalizeInitiativeWorkflow(persisted, {
      ...NO_ARTIFACTS,
      hasBrief: true,
    });

    expect(result.steps["core-flows"].status).toBe("ready");
  });
});
