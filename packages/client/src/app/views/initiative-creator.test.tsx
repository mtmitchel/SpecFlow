import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InitiativeCreator } from "./initiative-creator.js";

const createInitiativeMock = vi.fn();
const pickProjectRootMock = vi.fn();

vi.mock("../../api/initiatives.js", () => ({
  createInitiative: (...args: unknown[]) => createInitiativeMock(...args)
}));

vi.mock("../../api/transport.js", () => ({
  pickProjectRoot: (...args: unknown[]) => pickProjectRootMock(...args),
}));

vi.mock("../context/toast.js", () => ({
  useToast: () => ({ showError: vi.fn() })
}));

const LocationEcho = () => {
  const location = useLocation();
  return <div>{location.search || "(no search)"}</div>;
};

describe("InitiativeCreator", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses the approved desktop project-root flow before starting the brief", async () => {
    pickProjectRootMock.mockResolvedValueOnce({
      token: "project-root-0000000000000001",
      displayPath: "/home/mason/projects/desktop-app"
    });
    createInitiativeMock.mockResolvedValueOnce({ initiative: { id: "initiative-12345678" } });

    render(
      <MemoryRouter initialEntries={["/new-initiative"]}>
        <Routes>
          <Route
            path="/new-initiative"
            element={
              <InitiativeCreator
                onApplySnapshotUpdate={vi.fn()}
                defaultBrowseRoot="/home/mason/projects"
              />
            }
          />
          <Route path="/initiative/:id" element={<LocationEcho />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose folder" }));
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Project folder" })).toHaveValue(
        "/home/mason/projects/desktop-app"
      );
    });

    fireEvent.change(screen.getByRole("textbox", { name: "Project idea" }), {
      target: { value: "Plan a desktop app with local-first workflows and strict security." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Start brief intake" }));

    await waitFor(() => {
      expect(createInitiativeMock).toHaveBeenCalledWith(
        "Plan a desktop app with local-first workflows and strict security.",
        "project-root-0000000000000001"
      );
    });
  });

  it("keeps creation inside the same planning spectrum and hands off to brief intake", async () => {
    pickProjectRootMock.mockResolvedValueOnce({
      token: "project-root-0000000000000002",
      displayPath: "/home/mason/projects/note-app"
    });
    createInitiativeMock.mockResolvedValueOnce({ initiative: { id: "initiative-12345678" } });

    render(
      <MemoryRouter initialEntries={["/new-initiative"]}>
        <Routes>
          <Route
            path="/new-initiative"
            element={
              <InitiativeCreator
                onApplySnapshotUpdate={vi.fn()}
                defaultBrowseRoot="/home/mason/projects"
              />
            }
          />
          <Route path="/initiative/:id" element={<LocationEcho />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("New project")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What are you planning?" })).toBeInTheDocument();
    expect(screen.getByText("Validation")).toBeInTheDocument();
    expect(screen.getByText("Project folder")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start brief intake" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Choose folder" }));
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Project folder" })).toHaveValue(
        "/home/mason/projects/note-app"
      );
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Project idea" }), {
      target: { value: "Plan a Linux note app with fast capture and richer note editing." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Start brief intake" }));

    await waitFor(() => {
      expect(createInitiativeMock).toHaveBeenCalledWith(
        "Plan a Linux note app with fast capture and richer note editing.",
        "project-root-0000000000000002"
      );
      expect(screen.getByText("?step=brief")).toBeInTheDocument();
    });
  });
});
