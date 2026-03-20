import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModelCombobox } from "./model-combobox.js";

const fetchProviderModelsMock = vi.fn();

vi.mock("../../api.js", () => ({
  fetchProviderModels: (...args: unknown[]) => fetchProviderModelsMock(...args),
}));

describe("ModelCombobox", () => {
  it("opens the model list above the input when there is not enough space below", async () => {
    fetchProviderModelsMock.mockResolvedValue([
      { id: "gpt-5-mini", name: "gpt-5-mini", contextLength: 272000 },
      { id: "gpt-5", name: "gpt-5", contextLength: 400000 },
    ]);

    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 560,
    });

    render(
      <ModelCombobox
        provider="openai"
        hasApiKey
        value="gpt-5-mini"
        onSelect={vi.fn()}
        modelsGeneration={0}
      />,
    );

    const input = screen.getByDisplayValue("gpt-5-mini");
    vi.spyOn(input, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 420,
      width: 300,
      height: 44,
      top: 420,
      right: 300,
      bottom: 464,
      left: 0,
      toJSON: () => ({}),
    });

    fireEvent.focus(input);

    await waitFor(() => {
      expect(document.querySelector(".settings-model-list-above")).not.toBeNull();
    });

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });
});
