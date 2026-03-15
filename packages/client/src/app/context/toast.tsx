import { createContext, useCallback, useContext, useRef, useState } from "react";

export type ToastLevel = "error" | "success" | "info";

interface Toast {
  id: number;
  message: string;
  level: ToastLevel;
}

interface ToastContextValue {
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  showInfo: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
};

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, level: ToastLevel) => {
      const id = ++counter.current;
      setToasts((current) => [...current, { id, message, level }]);
      setTimeout(() => {
        dismiss(id);
      }, level === "error" ? 8000 : 4000);
    },
    [dismiss]
  );

  const showError = useCallback((message: string) => push(message, "error"), [push]);
  const showSuccess = useCallback((message: string) => push(message, "success"), [push]);
  const showInfo = useCallback((message: string) => push(message, "info"), [push]);

  return (
    <ToastContext.Provider value={{ showError, showSuccess, showInfo }}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-container" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast-${toast.level}`}>
              <span>{toast.message}</span>
              <button type="button" className="toast-dismiss" onClick={() => dismiss(toast.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
};
