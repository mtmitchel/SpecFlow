import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { InitiativeCreator } from "./initiative-creator.js";

const createInitiativeMock = vi.fn();

vi.mock("../../api/initiatives.js", () => ({
  createInitiative: (...args: unknown[]) => createInitiativeMock(...args)
}));

vi.mock("../context/toast.js", () => ({
  useToast: () => ({ showError: vi.fn() })
}));

const LocationEcho = () => {
  const location = useLocation();
  return <div>{location.search || "(no search)"}</div>;
};

describe("InitiativeCreator", () => {
  it("keeps creation inside the same planning spectrum and hands off to brief intake", async () => {
    createInitiativeMock.mockResolvedValueOnce({ initiativeId: "initiative-12345678" });

    render(
      <MemoryRouter initialEntries={["/new-initiative"]}>
        <Routes>
          <Route path="/new-initiative" element={<InitiativeCreator onRefresh={vi.fn(async () => undefined)} />} />
          <Route path="/initiative/:id" element={<LocationEcho />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: "Start on the same planning spectrum you will finish on" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to brief intake" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Plan a Linux note app with fast capture and richer note editing." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to brief intake" }));

    await waitFor(() => {
      expect(createInitiativeMock).toHaveBeenCalledWith(
        "Plan a Linux note app with fast capture and richer note editing."
      );
      expect(screen.getByText("?step=brief&handoff=created")).toBeInTheDocument();
    });
  });
});
