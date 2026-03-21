import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { fetchArtifacts, saveConfig, saveProviderKey, updateTicketStatus } from "./api";
import type { ArtifactsSnapshot, ConfigSavePayload, TicketStatus } from "./types";
import { ErrorBoundary } from "./app/components/error-boundary";
import { Navigator } from "./app/layout/navigator";
import { IconRail } from "./app/layout/icon-rail";
import { WorkspaceShell } from "./app/layout/workspace-shell";
import { ToastProvider, useToast } from "./app/context/toast";
import { ConfirmProvider } from "./app/context/confirm";
import { DetailWorkspace } from "./app/views/detail-workspace";
import { CommandPalette } from "./app/layout/command-palette";
import { SettingsModal } from "./app/layout/settings-modal";
import {
  getDesktopRuntimeStatus,
  isDesktopRuntime,
  subscribeArtifactsChanged
} from "./api/transport";

const AppInner = () => {
  const { showError } = useToast();
  const location = useLocation();
  const [snapshot, setSnapshot] = useState<ArtifactsSnapshot>({
      config: null,
      meta: {
        revision: 0,
        generatedAt: new Date(0).toISOString(),
        generationTimeMs: 0,
        payloadBytes: 0,
        reloadIssues: []
      },
      workspaceRoot: "",
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
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshQueuedRef = useRef(false);

  const logDesktopRuntime = useCallback(async (reason: string): Promise<void> => {
    if (!import.meta.env.DEV || !isDesktopRuntime()) {
      return;
    }

    try {
      const status = await getDesktopRuntimeStatus();
      if (!status) {
        return;
      }

      console.info("[desktop-runtime]", reason, status);
    } catch (error) {
      console.warn("[desktop-runtime]", reason, error);
    }
  }, []);

  const refreshArtifacts = useCallback(async (): Promise<void> => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      await refreshInFlightRef.current;
      return;
    }

    const runRefresh = async (): Promise<void> => {
      do {
        refreshQueuedRef.current = false;

        try {
          const data = await fetchArtifacts();
          setSnapshot(data);
          if (import.meta.env.DEV) {
            console.debug("[workspace-snapshot]", {
              revision: data.meta?.revision ?? 0,
              payloadBytes: data.meta?.payloadBytes ?? 0,
              generationTimeMs: data.meta?.generationTimeMs ?? 0,
              reloadIssueCount: data.meta?.reloadIssues.length ?? 0
            });
          }
        } catch (err) {
          showError((err as Error).message ?? "We couldn't load the workspace.");
        }
      } while (refreshQueuedRef.current);
    };

    const currentRefresh = runRefresh().finally(() => {
      if (refreshInFlightRef.current === currentRefresh) {
        refreshInFlightRef.current = null;
      }
    });
    refreshInFlightRef.current = currentRefresh;

    await currentRefresh;
  }, [showError]);

  const requestArtifactsRefresh = useCallback((): void => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }

    void refreshArtifacts();
  }, [refreshArtifacts]);

  useEffect(() => {
    void refreshArtifacts().finally(() => setLoading(false));
  }, [refreshArtifacts]);

  useEffect(() => {
    void logDesktopRuntime("app-start");
  }, [logDesktopRuntime]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    void subscribeArtifactsChanged(requestArtifactsRefresh, (payload) => {
      if (payload.reason === "sidecar-restart") {
        void logDesktopRuntime("sidecar-restart");
      }
    }).then((cleanup) => {
      if (cancelled) {
        cleanup();
        return;
      }

      unsubscribe = cleanup;
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [logDesktopRuntime, requestArtifactsRefresh]);

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
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches) {
      setNavigatorOpen(false);
    }
  }, [location.pathname, location.search]);

  const handleMoveTicket = useCallback(async (ticketId: string, status: TicketStatus): Promise<void> => {
    try {
      const updatedTicket = await updateTicketStatus(ticketId, status);
      setSnapshot((prev) => ({
        ...prev,
        tickets: prev.tickets.map((t) => (t.id === ticketId ? updatedTicket : t))
      }));
    } catch (err) {
      showError((err as Error).message ?? "We couldn't update the ticket status.");
    }
  }, [showError]);

  const handleSaveConfig = useCallback(async (next: ConfigSavePayload, apiKey?: string): Promise<void> => {
    try {
      const trimmedApiKey = apiKey?.trim() ?? "";
      if (trimmedApiKey) {
        await saveProviderKey({
          provider: next.provider,
          apiKey: trimmedApiKey
        });
      }

      const updatedConfig = await saveConfig(next);
      setSnapshot((prev) => ({ ...prev, config: updatedConfig }));
    } catch (err) {
      showError((err as Error).message ?? "We couldn't save settings.");
    }
  }, [showError]);

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-brand">SF</div>
        <div className="status-loading-card" role="status" aria-live="polite">
          <span className="status-loading-spinner" aria-hidden="true" />
          <div className="status-loading-copy">
            <strong>Opening SpecFlow...</strong>
            <span>Loading your workspace.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <WorkspaceShell
        iconRail={
          <IconRail
            navigatorOpen={navigatorOpen}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            navigatorContent={<Navigator snapshot={snapshot} />}
          />
        }
        navigatorOpen={navigatorOpen}
        onToggleNavigator={() => setNavigatorOpen((current) => !current)}
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
      <ConfirmProvider>
        <AppInner />
      </ConfirmProvider>
    </ToastProvider>
  </ErrorBoundary>
);
