import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownView } from "./markdown-view";

const openExternalUrlMock = vi.fn();

vi.mock("../../api/transport", () => ({
  openExternalUrl: (...args: unknown[]) => openExternalUrlMock(...args)
}));

describe("MarkdownView", () => {
  it("opens external links through the desktop-safe transport helper", () => {
    render(<MarkdownView content="[SpecFlow](https://example.com)" />);

    fireEvent.click(screen.getByRole("link", { name: "SpecFlow" }));

    expect(openExternalUrlMock).toHaveBeenCalledWith("https://example.com");
  });

  it("strips unsafe javascript links from rendered markdown", () => {
    render(<MarkdownView content="[Unsafe](javascript:alert(1))" />);

    expect(screen.queryByRole("link", { name: "Unsafe" })).not.toBeInTheDocument();
    expect(screen.getByText("Unsafe")).toBeInTheDocument();
  });
});
