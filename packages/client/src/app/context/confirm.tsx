import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface ConfirmOptions {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx;
};

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export const ConfirmProvider = ({ children }: { children: React.ReactNode }) => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  const handleResolve = useCallback((value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleResolve(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pending, handleResolve]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <div
          ref={overlayRef}
          className="confirm-overlay"
          onClick={(e) => { if (e.target === overlayRef.current) handleResolve(false); }}
          aria-modal="true"
          role="alertdialog"
          aria-label="Confirmation"
        >
          <div className="confirm-panel">
            <p className="confirm-message">{pending.options.message}</p>
            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-cancel"
                onClick={() => handleResolve(false)}
              >
                {pending.options.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                className={pending.options.destructive ? "confirm-destructive" : "btn-primary"}
                onClick={() => handleResolve(true)}
                autoFocus
              >
                {pending.options.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
};
