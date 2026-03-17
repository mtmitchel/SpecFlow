import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Config, ConfigSavePayload } from "../../types.js";
import { SettingsModal } from "./settings-modal.js";

vi.mock("../../api.js", () => ({
  fetchProviderModels: vi.fn(async () => [])
}));

vi.mock("../context/toast.js", () => ({
  useToast: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn()
  })
}));

describe("SettingsModal", () => {
  it("resets the model to the selected provider default before save", async () => {
    const config: Config = {
      provider: "openrouter",
      model: "openrouter/auto",
      hasApiKey: false,
      providerKeyStatus: {
        anthropic: false,
        openai: false,
        openrouter: false
      },
      port: 3141,
      host: "127.0.0.1",
      repoInstructionFile: "specflow/AGENTS.md"
    };
    const onSave = vi.fn(async (_next: ConfigSavePayload, _apiKey?: string) => undefined);

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <SettingsModal config={config} onSave={onSave} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Provider" }));
    fireEvent.click(screen.getByRole("option", { name: "OpenAI" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        provider: "openai",
        model: "gpt-5-mini",
        port: 3141,
        host: "127.0.0.1",
        repoInstructionFile: "specflow/AGENTS.md"
      }, undefined);
    });
  });

  it("updates key guidance when the selected provider already has a saved key", () => {
    const config: Config = {
      provider: "openrouter",
      model: "openrouter/auto",
      hasApiKey: false,
      providerKeyStatus: {
        anthropic: false,
        openai: true,
        openrouter: false
      },
      port: 3141,
      host: "127.0.0.1",
      repoInstructionFile: "specflow/AGENTS.md"
    };

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <SettingsModal config={config} onSave={vi.fn(async () => undefined)} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Provider" }));
    fireEvent.click(screen.getByRole("option", { name: "OpenAI" }));

    expect(screen.getByPlaceholderText("(key set -- leave blank to keep)")).toBeInTheDocument();
    expect(screen.getByText("Leave this blank to keep the saved key, or paste a new one.")).toBeInTheDocument();
  });

  it("renders safely when an older config snapshot is missing providerKeyStatus", () => {
    const legacyConfig = {
      provider: "openrouter",
      model: "openrouter/auto",
      hasApiKey: true,
      port: 3141,
      host: "127.0.0.1",
      repoInstructionFile: "specflow/AGENTS.md"
    } as Config;

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <SettingsModal config={legacyConfig} onSave={vi.fn(async () => undefined)} />
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText("(key set -- leave blank to keep)")).toBeInTheDocument();
    expect(screen.getByText("Leave this blank to keep the saved key, or paste a new one.")).toBeInTheDocument();
  });
});
