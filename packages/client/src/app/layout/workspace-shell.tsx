import type { ReactNode } from "react";

interface WorkspaceShellProps {
  navigator: ReactNode;
  children: ReactNode;
  statusBar?: ReactNode;
  commandPalette?: ReactNode;
}

export const WorkspaceShell = ({ navigator, children, statusBar, commandPalette }: WorkspaceShellProps) => (
  <div className="workspace-shell">
    <aside className="workspace-navigator">{navigator}</aside>
    <main className="workspace-detail">{children}</main>
    {statusBar && <div className="workspace-status-bar">{statusBar}</div>}
    {commandPalette}
  </div>
);
