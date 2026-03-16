import { useParams } from "react-router-dom";
import { Navigate, Route, Routes } from "react-router-dom";
import type { ArtifactsSnapshot, TicketStatus } from "../../types.js";
import { OverviewPanel } from "./overview-panel.js";
import { InitiativeCreator } from "./initiative-creator.js";
import { InitiativeView } from "./initiative-view.js";
import { SpecView } from "./spec-view.js";
import { TicketView } from "./ticket-view.js";
import { RunView } from "./run-view.js";
import { TicketsListView } from "./tickets-list-view.js";
import { RunsListView } from "./runs-list-view.js";
import { SpecsListView } from "./specs-list-view.js";
import { NewChooser } from "./new-chooser.js";
import { QuickTaskPage } from "./quick-task-page.js";

interface DetailWorkspaceProps {
  snapshot: ArtifactsSnapshot;
  onRefresh: () => Promise<void>;
  onMoveTicket: (ticketId: string, status: TicketStatus) => Promise<void>;
  onOpenCommandPalette: () => void;
}

// Inline redirect helper for :id patterns
const RedirectParam = ({ base }: { base: string }) => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`${base}/${id ?? ""}`} replace />;
};

export const DetailWorkspace = ({ snapshot, onRefresh, onMoveTicket, onOpenCommandPalette }: DetailWorkspaceProps) => (
  <Routes>
    {/* Canonical views */}
    <Route path="/initiative/:id" element={<InitiativeView snapshot={snapshot} onRefresh={onRefresh} />} />
    <Route path="/initiative/:id/spec/:type" element={<SpecView />} />
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
    <Route path="/new" element={<NewChooser />} />
    <Route path="/new-initiative" element={<InitiativeCreator onRefresh={onRefresh} />} />
    <Route path="/new-quick-task" element={<QuickTaskPage onRefresh={onRefresh} />} />

    {/* Aggregate views */}
    <Route path="/tickets" element={<TicketsListView snapshot={snapshot} />} />
    <Route path="/runs" element={<RunsListView snapshot={snapshot} />} />
    <Route path="/specs" element={<SpecsListView snapshot={snapshot} />} />

    {/* Backward-compat redirects */}
    <Route path="/initiatives/:id" element={<RedirectParam base="/initiative" />} />
    <Route path="/tickets/:id" element={<RedirectParam base="/ticket" />} />
    <Route path="/runs/:id" element={<RedirectParam base="/run" />} />

    {/* Everything else — overview */}
    <Route path="*" element={<OverviewPanel snapshot={snapshot} onOpenCommandPalette={onOpenCommandPalette} />} />
  </Routes>
);
