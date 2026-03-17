import type { ReactNode } from "react";

interface WorkspaceShellProps {
  iconRail: ReactNode;
  navigator: ReactNode;
  navigatorOpen: boolean;
  onCloseNavigator: () => void;
  children: ReactNode;
  commandPalette?: ReactNode;
}

export const WorkspaceShell = ({
  iconRail,
  navigator,
  navigatorOpen,
  onCloseNavigator,
  children,
  commandPalette,
}: WorkspaceShellProps) => {
  return (
    <div className={`workspace-shell${navigatorOpen ? " navigator-open" : ""}`}>
      <aside className={`workspace-navigation${navigatorOpen ? " open" : ""}`}>
        <div className="workspace-icon-rail">{iconRail}</div>
        <div className={`workspace-navigator${navigatorOpen ? " open" : ""}`}>{navigator}</div>
      </aside>
      {navigatorOpen ? <div className="workspace-nav-backdrop" onClick={onCloseNavigator} /> : null}
      <main className="workspace-detail">{children}</main>
      {commandPalette}
    </div>
  );
};
