import type { ReactNode } from "react";

interface WorkspaceShellProps {
  iconRail: ReactNode;
  navigatorOpen: boolean;
  onToggleNavigator: () => void;
  onCloseNavigator: () => void;
  children: ReactNode;
  commandPalette?: ReactNode;
}

export const WorkspaceShell = ({
  iconRail,
  navigatorOpen,
  onToggleNavigator,
  onCloseNavigator,
  children,
  commandPalette,
}: WorkspaceShellProps) => {
  return (
    <div className={`workspace-shell${navigatorOpen ? " navigator-open" : ""}`}>
      <aside className={`workspace-navigation${navigatorOpen ? " open" : ""}`}>
        <button
          type="button"
          className={`workspace-nav-handle${navigatorOpen ? " open" : ""}`}
          onClick={onToggleNavigator}
          aria-label={navigatorOpen ? "Collapse sidebar" : "Expand sidebar"}
          title={navigatorOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <span aria-hidden="true">{navigatorOpen ? "‹" : "›"}</span>
        </button>
        <div className="workspace-icon-rail">{iconRail}</div>
      </aside>
      {navigatorOpen ? <div className="workspace-nav-backdrop" onClick={onCloseNavigator} /> : null}
      <main className="workspace-detail">{children}</main>
      {commandPalette}
    </div>
  );
};
