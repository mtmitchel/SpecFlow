import { useEffect, useRef, type ReactNode } from "react";

interface SideDrawerProps {
  title: string;
  description?: string | null;
  headerActions?: ReactNode;
  onClose: () => void;
  open: boolean;
  children: ReactNode;
}

export const SideDrawer = ({
  title,
  description = null,
  headerActions = null,
  onClose,
  open,
  children
}: SideDrawerProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className="side-drawer-overlay"
      onClick={(event) => {
        if (event.target === overlayRef.current) {
          onClose();
        }
      }}
      aria-modal="true"
      role="dialog"
      aria-label={title}
    >
      <div className="side-drawer-panel" onClick={(event) => event.stopPropagation()}>
        <div className="side-drawer-header">
          <div className="side-drawer-heading">
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <div className="side-drawer-header-actions">
            {headerActions}
            <button type="button" className="side-drawer-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>
        <div className="side-drawer-body">{children}</div>
      </div>
    </div>
  );
};
