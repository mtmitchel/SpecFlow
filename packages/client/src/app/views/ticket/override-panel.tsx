import { useState } from "react";
import { overrideDone } from "../../../api.js";
import { useToast } from "../../context/toast.js";

interface OverridePanelProps {
  ticketId: string;
  onRefresh: () => Promise<void>;
}

export const OverridePanel = ({ ticketId, onRefresh }: OverridePanelProps) => {
  const { showError, showSuccess } = useToast();
  const [overrideReason, setOverrideReason] = useState("");
  const [showPanel, setShowPanel] = useState(false);
  const [overrideReasonError, setOverrideReasonError] = useState(false);

  return (
    <details className="ticket-secondary-disclosure">
      <summary>Mark done with risk</summary>
      <div className="ticket-secondary-content">
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0 }}>
          Use this only when you want to close the ticket even though verification found issues.
          SpecFlow will save your reason with the run.
        </p>
        <textarea
          className="multiline"
          style={{ minHeight: 80 }}
          value={overrideReason}
          onChange={(event) => {
            setOverrideReason(event.target.value);
            if (event.target.value.trim()) setOverrideReasonError(false);
          }}
          placeholder="Example: The remaining issue is low risk and tracked in follow-up work."
        />
        {overrideReasonError && (
          <p style={{ color: "var(--danger)", fontSize: "0.82rem", margin: "0.2rem 0 0" }}>
            Add a reason before marking the ticket done.
          </p>
        )}
        {!showPanel ? (
          <div className="button-row">
            <button
              type="button"
              className="btn-destructive"
              onClick={() => {
                if (overrideReason.trim().length === 0) {
                  setOverrideReasonError(true);
                  return;
                }
                setShowPanel(true);
              }}
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="override-panel">
            <p>
              You are marking this ticket done even though verification failed.
              SpecFlow will save this decision and your reason with the run.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="btn-destructive"
                onClick={async () => {
                  try {
                    await overrideDone(ticketId, overrideReason, true);
                    setShowPanel(false);
                    setOverrideReason("");
                    showSuccess("Ticket marked done with accepted risk.");
                    await onRefresh();
                  } catch (err) {
                    showError((err as Error).message ?? "We couldn't mark the ticket done.");
                  }
                }}
              >
                Accept risk and mark done
              </button>
              <button
                type="button"
                onClick={() => setShowPanel(false)}
              >
                Keep ticket open
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
};
