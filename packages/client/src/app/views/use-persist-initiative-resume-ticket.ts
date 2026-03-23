import { useEffect } from "react";
import { updateInitiative } from "../../api.js";
import type { Initiative } from "../../types.js";

interface PersistInitiativeResumeTicketConfig {
  currentResumeTicketId: string | null | undefined;
  initiativeId: string | null;
  onInitiativeUpdated?: (initiative: Initiative) => void;
  resumeTicketId: string | null;
  showError: (message: string) => void;
}

export const usePersistInitiativeResumeTicket = ({
  currentResumeTicketId,
  initiativeId,
  onInitiativeUpdated,
  resumeTicketId,
  showError,
}: PersistInitiativeResumeTicketConfig): void => {
  useEffect(() => {
    if (!initiativeId || !resumeTicketId || currentResumeTicketId === resumeTicketId) {
      return;
    }

    let cancelled = false;

    void updateInitiative(initiativeId, { resumeTicketId })
      .then((initiative) => {
        if (cancelled || !onInitiativeUpdated) {
          return;
        }

        onInitiativeUpdated(initiative);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        showError((error as Error).message ?? "We couldn't save where to resume this project.");
      });

    return () => {
      cancelled = true;
    };
  }, [currentResumeTicketId, initiativeId, onInitiativeUpdated, resumeTicketId, showError]);
};
