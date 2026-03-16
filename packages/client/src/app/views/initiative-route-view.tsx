import { useLocation } from "react-router-dom";
import type { ArtifactsSnapshot } from "../../types.js";
import { InitiativeHandoffView } from "./initiative-handoff-view.js";
import { InitiativeView } from "./initiative-view.js";

export const InitiativeRouteView = ({
  snapshot,
  onRefresh,
}: {
  snapshot: ArtifactsSnapshot;
  onRefresh: () => Promise<void>;
}) => {
  const location = useLocation();
  const handoff = new URLSearchParams(location.search).get("handoff");

  if (handoff === "created" || handoff === "quick-task") {
    return <InitiativeHandoffView snapshot={snapshot} onRefresh={onRefresh} />;
  }

  return <InitiativeView snapshot={snapshot} onRefresh={onRefresh} />;
};

