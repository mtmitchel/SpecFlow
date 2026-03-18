import type { ArtifactsSnapshot } from "../../types.js";
import { InitiativeView } from "./initiative-view.js";

export const InitiativeRouteView = ({
  snapshot,
  onRefresh,
}: {
  snapshot: ArtifactsSnapshot;
  onRefresh: () => Promise<void>;
}) => <InitiativeView snapshot={snapshot} onRefresh={onRefresh} />;
