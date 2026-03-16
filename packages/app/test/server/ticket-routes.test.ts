import { describe, expect, it } from "vitest";
import { createServerFixture } from "../helpers/server-fixture.js";

describe("ticket routes", () => {
  it("exports bundle, updates operation status, and patches ticket", async () => {
    const fixture = await createServerFixture();

    try {
      const exportResponse = await fixture.server.app.inject({
        method: "POST",
        url: "/api/tickets/ticket-aabbccdd/export-bundle",
        payload: { agent: "generic", operationId: "op-deadbeef" }
      });
      expect(exportResponse.statusCode).toBe(201);
      expect(exportResponse.json().flatString).toContain("SpecFlow Task Bundle");

      const operationResponse = await fixture.server.app.inject({
        method: "GET",
        url: "/api/operations/op-deadbeef"
      });
      expect(operationResponse.statusCode).toBe(200);
      expect(operationResponse.json().state).toBe("committed");

      const patchResponse = await fixture.server.app.inject({
        method: "PATCH",
        url: "/api/tickets/ticket-aabbccdd",
        payload: { status: "in-progress" }
      });
      expect(patchResponse.statusCode).toBe(200);
      expect(patchResponse.json().ticket.status).toBe("in-progress");
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects export-bundle with path-traversal operationId", async () => {
    const fixture = await createServerFixture();

    try {
      const response = await fixture.server.app.inject({
        method: "POST",
        url: "/api/tickets/ticket-aabbccdd/export-bundle",
        payload: { agent: "generic", operationId: "../../etc/passwd" }
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("Invalid operationId format");
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects export-fix-bundle with invalid findingId", async () => {
    const fixture = await createServerFixture();

    try {
      const response = await fixture.server.app.inject({
        method: "POST",
        url: "/api/runs/run-aabb1122/findings/bad-id/export-fix-bundle",
        payload: { agent: "generic" }
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("Invalid finding ID format");
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks execution when the coverage check is unresolved", async () => {
    const fixture = await createServerFixture();

    try {
      const review = fixture.store.planningReviews.get("initiative-11223344:ticket-coverage-review");
      if (!review) {
        throw new Error("Expected coverage review fixture");
      }

      await fixture.store.upsertPlanningReview({
        ...review,
        status: "blocked",
        summary: "Coverage gaps remain.",
        updatedAt: new Date().toISOString()
      });

      const exportResponse = await fixture.server.app.inject({
        method: "POST",
        url: "/api/tickets/ticket-aabbccdd/export-bundle",
        payload: { agent: "generic" }
      });
      expect(exportResponse.statusCode).toBe(409);
      expect(exportResponse.json().message).toContain("coverage check");

      const patchResponse = await fixture.server.app.inject({
        method: "PATCH",
        url: "/api/tickets/ticket-aabbccdd",
        payload: { status: "in-progress" }
      });
      expect(patchResponse.statusCode).toBe(409);
      expect(patchResponse.json().message).toContain("coverage check");
    } finally {
      await fixture.cleanup();
    }
  });

  it("allows execution when the coverage check is overridden", async () => {
    const fixture = await createServerFixture();

    try {
      const review = fixture.store.planningReviews.get("initiative-11223344:ticket-coverage-review");
      if (!review) {
        throw new Error("Expected coverage review fixture");
      }

      await fixture.store.upsertPlanningReview({
        ...review,
        status: "overridden",
        overrideReason: "Coverage gaps accepted for a manual follow-up.",
        updatedAt: new Date().toISOString()
      });

      const exportResponse = await fixture.server.app.inject({
        method: "POST",
        url: "/api/tickets/ticket-aabbccdd/export-bundle",
        payload: { agent: "generic" }
      });
      expect(exportResponse.statusCode).toBe(201);
      expect(exportResponse.json().runId).toBeTypeOf("string");
    } finally {
      await fixture.cleanup();
    }
  });

  it("allows quick tasks to start without a coverage review", async () => {
    const fixture = await createServerFixture();

    try {
      await fixture.store.upsertTicket({
        ...fixture.ticket,
        id: "ticket-deadbeef",
        initiativeId: null,
        phaseId: null,
        title: "Quick fix auth copy",
        description: "Update the auth empty state",
        coverageItemIds: [],
        runId: null,
        updatedAt: new Date().toISOString()
      });

      const response = await fixture.server.app.inject({
        method: "POST",
        url: "/api/tickets/ticket-deadbeef/export-bundle",
        payload: { agent: "generic" }
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().runId).toBeTypeOf("string");
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks fix-bundle export when the coverage check is unresolved", async () => {
    const fixture = await createServerFixture();

    try {
      const review = fixture.store.planningReviews.get("initiative-11223344:ticket-coverage-review");
      if (!review) {
        throw new Error("Expected coverage review fixture");
      }

      await fixture.store.upsertPlanningReview({
        ...review,
        status: "blocked",
        summary: "Coverage gaps remain.",
        updatedAt: new Date().toISOString()
      });
      await fixture.store.upsertRun({
        ...fixture.run,
        ticketId: fixture.ticket.id
      });

      const response = await fixture.server.app.inject({
        method: "POST",
        url: "/api/runs/run-aabb1122/findings/finding-1/export-fix-bundle",
        payload: { agent: "generic" }
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().message).toContain("coverage check");
    } finally {
      await fixture.cleanup();
    }
  });
});
