import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { fetchArtifacts, saveConfig, updateTicketStatus } from "./api";
import type { ArtifactsSnapshot, ConfigSavePayload, TicketStatus } from "./types";
import { ErrorBoundary } from "./app/components/error-boundary";
import { useSseReconnect } from "./app/hooks/use-sse-reconnect";
import { Navigator } from "./app/layout/navigator";
import { IconRail } from "./app/layout/icon-rail";
import { WorkspaceShell } from "./app/layout/workspace-shell";
import { ToastProvider, useToast } from "./app/context/toast";
import { DetailWorkspace } from "./app/views/detail-workspace";
import { CommandPalette } from "./app/layout/command-palette";
import { SettingsModal } from "./app/layout/settings-modal";

const AppInner = () => {
  const { showError } = useToast();
  const location = useLocation();
  const [snapshot, setSnapshot] = useState<ArtifactsSnapshot>({
    config: null,
    initiatives: [],
    tickets: [],
    runs: [],
    runAttempts: [],
    specs: [],
    planningReviews: [],
    ticketCoverageArtifacts: []
  });
  const [loading, setLoading] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);

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

  useEffect(() => {
    setNavigatorOpen(false);
  }, [location.pathname, location.search]);

  const handleMoveTicket = useCallback(async (ticketId: string, status: TicketStatus): Promise<void> => {
    try {
      const updatedTicket = await updateTicketStatus(ticketId, status);
      setSnapshot((prev) => ({
        ...prev,
        tickets: prev.tickets.map((t) => (t.id === ticketId ? updatedTicket : t))
      }));
    } catch (err) {
      showError((err as Error).message ?? "Failed to update ticket status");
    }
  }, [showError]);

  const handleSaveConfig = useCallback(async (next: ConfigSavePayload): Promise<void> => {
    try {
      const updatedConfig = await saveConfig(next);
      setSnapshot((prev) => ({ ...prev, config: updatedConfig }));
    } catch (err) {
      showError((err as Error).message ?? "Failed to save settings");
    }
  }, [showError]);

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-brand">SF</div>
        <div className="loading-text">Starting SpecFlow</div>
      </div>
    );
  }

  return (
    <>
      <WorkspaceShell
        iconRail={
          <IconRail
            snapshot={snapshot}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            onToggleNavigator={() => setNavigatorOpen((current) => !current)}
          />
        }
        navigator={
          <Navigator snapshot={snapshot} />
        }
        navigatorOpen={navigatorOpen}
        onCloseNavigator={() => setNavigatorOpen(false)}
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
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
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
