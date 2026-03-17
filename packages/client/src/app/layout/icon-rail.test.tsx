import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ArtifactsSnapshot, Initiative } from "../../types.js";
import { IconRail } from "./icon-rail.js";

const initiative: Initiative = {
  id: "initiative-12345678",
  title: "Local Notes",
  description: "A local-first notes app",
  status: "draft",
  phases: [],
  specIds: [],
  ticketIds: [],
  workflow: {
    activeStep: "brief",
    steps: {
      brief: { status: "ready", updatedAt: null },
      "core-flows": { status: "locked", updatedAt: null },
      prd: { status: "locked", updatedAt: null },
      "tech-spec": { status: "locked", updatedAt: null },
      tickets: { status: "locked", updatedAt: null }
    },
    refinements: {
      brief: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "core-flows": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null }
    }
  },
  createdAt: "2026-03-16T12:00:00.000Z",
  updatedAt: "2026-03-16T12:00:00.000Z"
};

const snapshot: ArtifactsSnapshot = {
  config: null,
  initiatives: [initiative],
  tickets: [],
  runs: [],
  runAttempts: [],
  specs: [],
  planningReviews: [],
  ticketCoverageArtifacts: []
};

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

describe("IconRail", () => {
  it("uses the SF logo as home and exposes search, browse, and new initiative actions", () => {
    const onOpenCommandPalette = vi.fn();

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}`]}>
        <LocationProbe />
        <IconRail
          snapshot={snapshot}
          navigatorOpen={false}
          onOpenCommandPalette={onOpenCommandPalette}
          navigatorContent={<div>Navigator</div>}
        />
      </MemoryRouter>
    );

    const homeButton = screen.getByRole("button", { name: "Home" });
    expect(homeButton).toHaveTextContent("SF");

    fireEvent.click(homeButton);
    expect(screen.getByTestId("location")).toHaveTextContent("/");

    fireEvent.click(screen.getByRole("button", { name: "Search and commands" }));
    expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "New initiative" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/new");
  });

  it("reveals text labels when the sidebar is expanded", () => {
    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}`]}>
        <IconRail
          snapshot={snapshot}
          navigatorOpen
          onOpenCommandPalette={vi.fn()}
          navigatorContent={<div>Navigator</div>}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("SpecFlow")).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("New Initiative")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Local Notes")).toBeInTheDocument();
    expect(screen.getByText("Navigator")).toBeInTheDocument();
  });
});
