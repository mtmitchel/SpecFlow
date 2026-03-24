import type {
  InitiativePlanningStep,
  PlanningReviewFinding,
} from "../types/entities.js";

const matchesReviewStepKeyword = (message: string, keywords: string[]): boolean =>
  keywords.some((keyword) => message.includes(keyword));

export const getReviewResolutionStep = (
  finding: Pick<PlanningReviewFinding, "message" | "type">,
): InitiativePlanningStep => {
  const message = finding.message.toLowerCase();

  if (
    matchesReviewStepKeyword(message, [
      "brief",
      "audience",
      "persona",
      "target user",
      "who is this for",
      "goal",
      "success criteria",
      "scope",
      "v1",
    ])
  ) {
    return "brief";
  }

  if (
    matchesReviewStepKeyword(message, [
      "core flows",
      "flow",
      "journey",
      "behavior",
      "empty note",
      "trash",
      "toggle",
      "capture",
      "autosave",
      "conflict",
      "grid",
      "list view",
    ])
  ) {
    return "core-flows";
  }

  if (
    matchesReviewStepKeyword(message, [
      "prd",
      "accessibility",
      "keyboard",
      "aria",
      "ux",
      "validation",
      "error message",
      "copy",
      "policy",
      "allowed characters",
      "tag canonicalization",
      "user-facing",
    ])
  ) {
    return "prd";
  }

  if (
    matchesReviewStepKeyword(message, [
      "tech spec",
      "sqlite",
      "db",
      "schema",
      "migration",
      "backup",
      "diagnostics",
      "adapter",
      "worker",
      "persistence",
      "timestamp",
      "authority",
      "ownership",
      "engineering foundations",
      "ipc",
      "thumbnail",
      "webp",
      "resolution",
      "file size",
      "performance",
      "latency",
      "debounce",
      "packaging",
      "rpm",
      "flatpak",
      "fedora",
      "test suite",
      "acceptance tests",
    ])
  ) {
    return "tech-spec";
  }

  if (
    finding.type === "traceability-gap" ||
    matchesReviewStepKeyword(message, [
      "ticket",
      "tickets",
      "covered by any ticket",
      "not traced into",
      "not represented in the generated tickets",
      "missing link",
    ])
  ) {
    return "tickets";
  }

  return finding.type === "blocker" ? "tech-spec" : "prd";
};
