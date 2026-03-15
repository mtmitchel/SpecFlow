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
    <>
      <h4>Override to Done</h4>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
        Mark this ticket as done despite verification results. This override and your reason will be recorded.
      </p>
      <textarea
        className="multiline"
        style={{ minHeight: 80 }}
        value={overrideReason}
        onChange={(event) => {
          setOverrideReason(event.target.value);
          if (event.target.value.trim()) setOverrideReasonError(false);
        }}
        placeholder="Required reason for override"
      />
      {overrideReasonError && (
        <p style={{ color: "var(--danger)", fontSize: "0.82rem", margin: "0.2rem 0 0" }}>
          Please provide a reason for the override.
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
            Override to Done
          </button>
        </div>
      ) : (
        <div className="override-panel">
          <p>
            You are marking this ticket as done despite failing verification.
            This override and your reason will be recorded.
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
                  showSuccess("Ticket overridden to done");
                  await onRefresh();
                } catch (err) {
                  showError((err as Error).message ?? "Override failed");
                }
              }}
            >
              Confirm Override
            </button>
            <button
              type="button"
              onClick={() => setShowPanel(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
};
