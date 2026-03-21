import { describe, expect, it, vi } from "vitest";
import { getTicketExecutionGate } from "../src/planner/execution-gates.js";
import { updateTicket } from "../src/runtime/handlers/ticket-handlers.js";
import type { PlanningReviewArtifact, Ticket } from "../src/types/entities.js";

const baseTicket: Ticket = {
  id: "ticket-12345678",
  initiativeId: "initiative-12345678",
  phaseId: "phase-1",
  title: "Implement gated execution",
  description: "Keep execution entry aligned with the documented workflow.",
  status: "ready",
  acceptanceCriteria: [{ id: "criterion-1", text: "Execution only starts when gates are clear." }],
  implementationPlan: "Check shared gates before moving into execution states.",
  fileTargets: ["packages/app/src/runtime/handlers/ticket-handlers.ts"],
  coverageItemIds: ["coverage-brief-goals-1"],
  blockedBy: [],
  blocks: [],
  runId: null,
  createdAt: "2026-03-16T10:00:00.000Z",
  updatedAt: "2026-03-16T10:00:00.000Z"
};

const passedCoverageReview: PlanningReviewArtifact = {
  id: "initiative-12345678:ticket-coverage-review",
  initiativeId: "initiative-12345678",
  kind: "ticket-coverage-review",
  status: "passed",
  summary: "Coverage is clear.",
  findings: [],
  sourceUpdatedAts: { tickets: "2026-03-16T10:10:00.000Z" },
  overrideReason: null,
  reviewedAt: "2026-03-16T10:10:00.000Z",
  updatedAt: "2026-03-16T10:10:00.000Z"
};

describe("ticket execution gates", () => {
  it("blocks execution when the coverage review is unresolved", async () => {
    const runtime = {
      store: {
        tickets: new Map([[baseTicket.id, baseTicket]]),
        planningReviews: new Map<string, Pick<PlanningReviewArtifact, "status">>(),
        upsertTicket: vi.fn()
      }
    } as const;

    await expect(
      updateTicket(runtime as never, baseTicket.id, { status: "in-progress" })
    ).rejects.toThrow("Resolve the coverage check for this project before starting execution");
    expect(runtime.store.upsertTicket).not.toHaveBeenCalled();
  });

  it("blocks execution when a dependency ticket is not done", () => {
    const blockedTicket: Ticket = {
      ...baseTicket,
      blockedBy: ["ticket-blocker"]
    };
    const tickets = new Map<string, Pick<Ticket, "status">>([
      [blockedTicket.id, blockedTicket],
      ["ticket-blocker", { status: "verify" }]
    ]);
    const reviews = new Map<string, Pick<PlanningReviewArtifact, "status">>([
      [passedCoverageReview.id, passedCoverageReview]
    ]);

    expect(getTicketExecutionGate(blockedTicket, reviews, tickets)).toEqual({
      allowed: false,
      code: "blocked-by-open-ticket",
      message: "Finish blocked tickets before you start this ticket.",
      blockingTicketIds: ["ticket-blocker"]
    });
  });

  it("allows backward management moves even when execution is currently blocked", async () => {
    const activeTicket: Ticket = {
      ...baseTicket,
      status: "verify",
      blockedBy: ["ticket-blocker"]
    };
    const runtime = {
      store: {
        tickets: new Map<string, Ticket>([
          [activeTicket.id, activeTicket],
          ["ticket-blocker", { ...baseTicket, id: "ticket-blocker", status: "ready" }]
        ]),
        planningReviews: new Map<string, Pick<PlanningReviewArtifact, "status">>(),
        upsertTicket: vi.fn(async () => undefined)
      }
    } as const;

    const result = await updateTicket(runtime as never, activeTicket.id, { status: "backlog" });

    expect(runtime.store.upsertTicket).toHaveBeenCalledWith(
      expect.objectContaining({ id: activeTicket.id, status: "backlog" })
    );
    expect(result.ticket.status).toBe("backlog");
  });
});
