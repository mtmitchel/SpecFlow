import { useEffect } from "react";
import { updateInitiative } from "../../api.js";

interface PersistInitiativeResumeTicketConfig {
  currentResumeTicketId: string | null | undefined;
  initiativeId: string | null;
  onRefresh?: () => Promise<void>;
  resumeTicketId: string | null;
  showError: (message: string) => void;
}

export const usePersistInitiativeResumeTicket = ({
  currentResumeTicketId,
  initiativeId,
  onRefresh,
  resumeTicketId,
  showError,
}: PersistInitiativeResumeTicketConfig): void => {
  useEffect(() => {
    if (!initiativeId || !resumeTicketId || currentResumeTicketId === resumeTicketId) {
      return;
    }

    let cancelled = false;

    void updateInitiative(initiativeId, { resumeTicketId })
      .then(async () => {
        if (cancelled || !onRefresh) {
          return;
        }

        await onRefresh();
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        showError((error as Error).message ?? "Failed to update initiative resume state");
      });

    return () => {
      cancelled = true;
    };
  }, [currentResumeTicketId, initiativeId, onRefresh, resumeTicketId, showError]);
};
