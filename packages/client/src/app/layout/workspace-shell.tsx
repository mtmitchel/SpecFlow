import { type ReactNode, useState } from "react";

interface WorkspaceShellProps {
  navigator: ReactNode;
  children: ReactNode;
  statusBar?: ReactNode;
  commandPalette?: ReactNode;
}

export const WorkspaceShell = ({ navigator, children, statusBar, commandPalette }: WorkspaceShellProps) => {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="workspace-shell">
      <button
        type="button"
        className="workspace-nav-toggle"
        onClick={() => setNavOpen((v) => !v)}
        aria-label="Toggle navigation"
      >
        &#9776;
      </button>
      {navOpen && (
        <div
          className="workspace-nav-backdrop"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside className={`workspace-navigator${navOpen ? " open" : ""}`}>{navigator}</aside>
      <main className="workspace-detail">{children}</main>
      {statusBar && <div className="workspace-status-bar">{statusBar}</div>}
      {commandPalette}
    </div>
  );
};
