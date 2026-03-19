import { describe, expect, it } from "vitest";
import { ApiError } from "./http";
import { parseSseResult } from "./sse";

const createSseResponse = (lines: string[]): Response => {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(lines.join("\n")));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    },
  );
};

describe("parseSseResult", () => {
  it("preserves planner-error details in ApiError", async () => {
    const response = createSseResponse([
      "event: planner-error",
      `data: ${JSON.stringify({
        code: "planner_validation_error",
        message: "Missing Brief goal: Preserve local note history.",
        statusCode: 500,
        details: {
          issues: [
            {
              kind: "missing-coverage-item",
              message: "Missing Brief goal: Preserve local note history.",
              coverageItemId: "coverage-brief-goals-1",
            },
          ],
        },
      })}`,
      "",
    ]);

    await expect(parseSseResult(response)).rejects.toEqual(
      expect.objectContaining<ApiError>({
        name: "ApiError",
        statusCode: 500,
        code: "planner_validation_error",
        message: "Missing Brief goal: Preserve local note history.",
        details: expect.objectContaining({
          issues: [
            expect.objectContaining({
              coverageItemId: "coverage-brief-goals-1",
            }),
          ],
        }),
      }),
    );
  });
});
