import { useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { fetchArtifacts, saveConfig, updateTicketStatus } from "./api";
import type { ArtifactsSnapshot } from "./types";
import { useSseReconnect } from "./app/hooks/use-sse-reconnect";
import { AppShell } from "./app/layout/app-shell";
import { InitiativeDetailPage } from "./app/pages/initiative-detail-page";
import { InitiativesPage } from "./app/pages/initiatives-page";
import { RunDetailPage } from "./app/pages/run-detail-page";
import { RunsPage } from "./app/pages/runs-page";
import { SettingsPage } from "./app/pages/settings-page";
import { SpecsPage } from "./app/pages/specs-page";
import { TicketDetailPage } from "./app/pages/ticket-detail-page";
import { TicketsPage } from "./app/pages/tickets-page";
import { NavigateToTickets } from "./app/routing/navigate-to-tickets";

export const App = (): JSX.Element => {
  const [snapshot, setSnapshot] = useState<ArtifactsSnapshot>({
    config: null,
    initiatives: [],
    tickets: [],
    runs: [],
    runAttempts: [],
    specs: []
  });
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  const refreshArtifacts = async (): Promise<void> => {
    const data = await fetchArtifacts();
    setSnapshot(data);
  };

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
              onMoveTicket={async (ticketId, status) => {
                await updateTicketStatus(ticketId, status);
                await refreshArtifacts();
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
                await saveConfig(next);
                await refreshArtifacts();
              }}
            />
          }
        />
        <Route path="*" element={<NavigateToTickets locationPath={location.pathname} navigate={navigate} />} />
      </Routes>
    </AppShell>
  );
};
