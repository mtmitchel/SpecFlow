import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { IconRail } from "./icon-rail.js";

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
};

describe("IconRail", () => {
  it("uses the SF logo as home and exposes search and new initiative actions", () => {
    const onOpenCommandPalette = vi.fn();

    render(
      <MemoryRouter initialEntries={["/initiative/initiative-12345678"]}>
        <LocationProbe />
        <IconRail
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
      <MemoryRouter initialEntries={["/initiative/initiative-12345678"]}>
        <IconRail
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
    expect(screen.getByText("Navigator")).toBeInTheDocument();
  });

  it("does not render initiative shortcuts in the rail", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <IconRail
          navigatorOpen={false}
          onOpenCommandPalette={vi.fn()}
          navigatorContent={<div>Navigator</div>}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: "Local Notes" })).not.toBeInTheDocument();
  });
});
