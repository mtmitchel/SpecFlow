import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "./workspace-shell.js";

describe("WorkspaceShell", () => {
  it("renders the rail and navigator inside one navigation aside", () => {
    const onCloseNavigator = vi.fn();

    const { container } = render(
      <WorkspaceShell
        iconRail={<div>Rail</div>}
        navigator={<div>Navigator</div>}
        navigatorOpen
        onCloseNavigator={onCloseNavigator}
      >
        <div>Detail</div>
      </WorkspaceShell>
    );

    const navigationAsides = Array.from(container.querySelectorAll("aside.workspace-navigation"));
    expect(navigationAsides).toHaveLength(1);
    expect(screen.getByText("Rail")).toBeInTheDocument();
    expect(screen.getByText("Navigator")).toBeInTheDocument();

    fireEvent.click(container.querySelector(".workspace-nav-backdrop") as HTMLDivElement);
    expect(onCloseNavigator).toHaveBeenCalledTimes(1);
  });
});
