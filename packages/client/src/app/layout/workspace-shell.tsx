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
    <div className="workspace-shell">
      <aside className="workspace-icon-rail">{iconRail}</aside>
      {navigatorOpen ? <div className="workspace-nav-backdrop" onClick={onCloseNavigator} /> : null}
      <aside className={`workspace-navigator${navigatorOpen ? " open" : ""}`}>{navigator}</aside>
      <main className="workspace-detail">{children}</main>
      {commandPalette}
    </div>
  );
};
