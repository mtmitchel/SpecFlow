import { useCallback, useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { fetchArtifacts, saveConfig, updateTicketStatus } from "./api";
import type { ArtifactsSnapshot } from "./types";
import { ErrorBoundary } from "./app/components/error-boundary";
import { useSseReconnect } from "./app/hooks/use-sse-reconnect";
import { AppShell } from "./app/layout/app-shell";
import { ToastProvider, useToast } from "./app/context/toast";
import { InitiativeDetailPage } from "./app/pages/initiative-detail-page";
import { InitiativesPage } from "./app/pages/initiatives-page";
import { RunDetailPage } from "./app/pages/run-detail-page";
import { RunsPage } from "./app/pages/runs-page";
import { SettingsPage } from "./app/pages/settings-page";
import { SpecsPage } from "./app/pages/specs-page";
import { TicketDetailPage } from "./app/pages/ticket-detail-page";
import { TicketsPage } from "./app/pages/tickets-page";
import { NavigateToTickets } from "./app/routing/navigate-to-tickets";

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

  if (loading) {
    return <div className="loading">Loading SpecFlow board...</div>;
  }

  return (
    <AppShell>
      <Routes>
        <Route
          path="/initiatives"
          element={<InitiativesPage initiatives={snapshot.initiatives} onRefresh={refreshArtifacts} />}
        />
        <Route
          path="/initiatives/:id"
          element={<InitiativeDetailPage snapshot={snapshot} onRefresh={refreshArtifacts} />}
        />
        <Route
          path="/tickets"
          element={
            <TicketsPage
              tickets={snapshot.tickets}
              initiatives={snapshot.initiatives}
              onRefresh={refreshArtifacts}
              onMoveTicket={async (ticketId, status) => {
                try {
                  const updatedTicket = await updateTicketStatus(ticketId, status);
                  setSnapshot((prev) => ({
                    ...prev,
                    tickets: prev.tickets.map((t) => (t.id === ticketId ? updatedTicket : t))
                  }));
                } catch (err) {
                  showError((err as Error).message ?? "Failed to update ticket status");
                }
              }}
            />
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <TicketDetailPage
              tickets={snapshot.tickets}
              runs={snapshot.runs}
              runAttempts={snapshot.runAttempts}
              initiatives={snapshot.initiatives}
              onRefresh={refreshArtifacts}
            />
          }
        />
        <Route path="/specs" element={<SpecsPage snapshot={snapshot} />} />
        <Route path="/runs" element={<RunsPage tickets={snapshot.tickets} />} />
        <Route path="/runs/:id" element={<RunDetailPage />} />
        <Route
          path="/settings"
          element={
            <SettingsPage
              config={snapshot.config}
              onSave={async (next) => {
                try {
                  const updatedConfig = await saveConfig(next);
                  setSnapshot((prev) => ({ ...prev, config: updatedConfig }));
                } catch (err) {
                  showError((err as Error).message ?? "Failed to save settings");
                }
              }}
            />
          }
        />
        <Route path="*" element={<NavigateToTickets />} />
      </Routes>
    </AppShell>
  );
};

export const App = () => (
  <ErrorBoundary>
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  </ErrorBoundary>
);
