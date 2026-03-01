import { useCallback, useEffect, useState } from "react";
import { fetchArtifacts, saveConfig, updateTicketStatus } from "./api";
import type { ArtifactsSnapshot, TicketStatus } from "./types";
import { ErrorBoundary } from "./app/components/error-boundary";
import { useSseReconnect } from "./app/hooks/use-sse-reconnect";
import { Navigator } from "./app/layout/navigator";
import { WorkspaceShell } from "./app/layout/workspace-shell";
import { ToastProvider, useToast } from "./app/context/toast";
import { DetailWorkspace } from "./app/views/detail-workspace";
import { CommandPalette } from "./app/layout/command-palette";
import { SettingsModal } from "./app/layout/settings-modal";
import { StatusBar } from "./app/layout/status-bar";

const AppInner = () => {
  const { showError } = useToast();
  const [snapshot, setSnapshot] = useState<ArtifactsSnapshot>({
    config: null,
    initiatives: [],
    tickets: [],
    runs: [],
    runAttempts: [],
    specs: []
  });
  const [loading, setLoading] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const refreshArtifacts = useCallback(async (): Promise<void> => {
    try {
      const data = await fetchArtifacts();
      setSnapshot(data);
    } catch (err) {
      showError((err as Error).message ?? "Failed to load data");
    }
  }, [showError]);

  useEffect(() => {
    void refreshArtifacts().finally(() => setLoading(false));
  }, []);

  useSseReconnect("/api/planner/stream", refreshArtifacts);

  // Cmd+K / Ctrl+K opens the command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (loading) {
    return <div className="loading">Loading SpecFlow board...</div>;
  }

  const handleMoveTicket = async (ticketId: string, status: TicketStatus): Promise<void> => {
    try {
      const updatedTicket = await updateTicketStatus(ticketId, status);
      setSnapshot((prev) => ({
        ...prev,
        tickets: prev.tickets.map((t) => (t.id === ticketId ? updatedTicket : t))
      }));
    } catch (err) {
      showError((err as Error).message ?? "Failed to update ticket status");
    }
  };

  const handleSaveConfig = async (next: Parameters<typeof saveConfig>[0]): Promise<void> => {
    try {
      const updatedConfig = await saveConfig(next);
      setSnapshot((prev) => ({ ...prev, config: updatedConfig }));
    } catch (err) {
      showError((err as Error).message ?? "Failed to save settings");
    }
  };

  return (
    <>
      <WorkspaceShell
        navigator={
          <Navigator
            snapshot={snapshot}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          />
        }
        statusBar={<StatusBar snapshot={snapshot} />}
        commandPalette={
          <CommandPalette
            open={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            snapshot={snapshot}
            onRefresh={refreshArtifacts}
          />
        }
      >
        <DetailWorkspace
          snapshot={snapshot}
          onRefresh={refreshArtifacts}
          onMoveTicket={handleMoveTicket}
        />
      </WorkspaceShell>
      <SettingsModal config={snapshot.config} onSave={handleSaveConfig} />
    </>
  );
};

export const App = () => (
  <ErrorBoundary>
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  </ErrorBoundary>
);
