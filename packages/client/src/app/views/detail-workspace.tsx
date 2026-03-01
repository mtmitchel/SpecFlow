import { useParams } from "react-router-dom";
import { Navigate, Route, Routes } from "react-router-dom";
import type { ArtifactsSnapshot, TicketStatus } from "../../types.js";
import { OverviewPanel } from "./overview-panel.js";
import { InitiativeCreator } from "./initiative-creator.js";
import { InitiativeView } from "./initiative-view.js";
import { SpecView } from "./spec-view.js";
import { TicketView } from "./ticket-view.js";
import { RunView } from "./run-view.js";

interface DetailWorkspaceProps {
  snapshot: ArtifactsSnapshot;
  onRefresh: () => Promise<void>;
  onMoveTicket: (ticketId: string, status: TicketStatus) => Promise<void>;
}

// Inline redirect helper for :id patterns
const RedirectParam = ({ base }: { base: string }) => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`${base}/${id ?? ""}`} replace />;
};

export const DetailWorkspace = ({ snapshot, onRefresh, onMoveTicket }: DetailWorkspaceProps) => (
  <Routes>
    {/* Canonical views */}
    <Route path="/initiative/:id" element={<InitiativeView snapshot={snapshot} onRefresh={onRefresh} />} />
    <Route path="/initiative/:id/spec/:type" element={<SpecView snapshot={snapshot} onRefresh={onRefresh} />} />
    <Route
      path="/ticket/:id"
      element={
        <TicketView
          tickets={snapshot.tickets}
          runs={snapshot.runs}
          runAttempts={snapshot.runAttempts}
          initiatives={snapshot.initiatives}
          onRefresh={onRefresh}
          onMoveTicket={onMoveTicket}
        />
      }
    />
    <Route path="/run/:id" element={<RunView />} />
    <Route path="/new-initiative" element={<InitiativeCreator onRefresh={onRefresh} />} />

    {/* Backward-compat redirects */}
    <Route path="/initiatives/:id" element={<RedirectParam base="/initiative" />} />
    <Route path="/tickets/:id" element={<RedirectParam base="/ticket" />} />
    <Route path="/runs/:id" element={<RedirectParam base="/run" />} />

    {/* Everything else — overview */}
    <Route path="*" element={<OverviewPanel snapshot={snapshot} />} />
  </Routes>
);
