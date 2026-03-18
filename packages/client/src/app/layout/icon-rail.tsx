import { useLocation, useNavigate } from "react-router-dom";
import type { ArtifactsSnapshot } from "../../types.js";
import { getInitiativeProgressModel, getInitiativeResumeHref } from "../utils/initiative-progress.js";
import { getInitiativeDisplayTitle } from "../utils/initiative-titles.js";

interface IconRailProps {
  onOpenCommandPalette: () => void;
  navigatorOpen: boolean;
  navigatorContent?: React.ReactNode;
  snapshot: ArtifactsSnapshot;
}

const getMonogram = (title: string): string => {
  const tokens = title
    .split(/\s+/)
    .map((token) => token[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2);

  return tokens.join("") || "SF";
};

const getActiveInitiativeId = (snapshot: ArtifactsSnapshot, pathname: string): string | null => {
  if (pathname.startsWith("/initiative/")) {
    return pathname.split("/")[2] ?? null;
  }

  if (pathname.startsWith("/ticket/")) {
    const ticketId = pathname.split("/")[2];
    return snapshot.tickets.find((ticket) => ticket.id === ticketId)?.initiativeId ?? null;
  }

  if (pathname.startsWith("/run/")) {
    const runId = pathname.split("/")[2];
    const run = snapshot.runs.find((candidate) => candidate.id === runId);
    return snapshot.tickets.find((ticket) => ticket.id === run?.ticketId)?.initiativeId ?? null;
  }

  return null;
};

const RailButton = ({
  active,
  ariaLabel,
  icon,
  label,
  children,
  onClick,
}: {
  active?: boolean;
  ariaLabel: string;
  icon?: React.ReactNode;
  label?: string;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    className={`icon-rail-button${active ? " active" : ""}`}
    onClick={onClick}
    aria-label={ariaLabel}
    title={ariaLabel}
  >
    <span className="icon-rail-button-icon" aria-hidden="true">
      {icon ?? children}
    </span>
    {label ? <span className="icon-rail-button-label">{label}</span> : null}
  </button>
);

export const IconRail = ({ onOpenCommandPalette, navigatorOpen, navigatorContent, snapshot }: IconRailProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const initiatives = [...snapshot.initiatives].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
  const homeActive = location.pathname === "/";
  const activeInitiativeId = getActiveInitiativeId(snapshot, location.pathname);

  return (
    <div className={`icon-rail${navigatorOpen ? " open" : ""}`}>
      <div className="icon-rail-group">
        <button
          type="button"
          className={`icon-rail-logo${homeActive ? " active" : ""}`}
          onClick={() => navigate("/")}
          aria-label="Home"
          title="Home"
        >
          <span className="icon-rail-logo-mark">SF</span>
          <span className="icon-rail-logo-label">SpecFlow</span>
        </button>
        <RailButton ariaLabel="Search and commands" label="Search" onClick={onOpenCommandPalette}>
          <svg viewBox="0 0 16 16">
            <path d="M7 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm3.1 7.1L13 13" />
          </svg>
        </RailButton>
        <RailButton ariaLabel="New initiative" label="New Initiative" onClick={() => navigate("/new")}>
          <svg viewBox="0 0 16 16">
            <path d="M8 3v10" />
            <path d="M3 8h10" />
          </svg>
        </RailButton>
      </div>

      <div className="icon-rail-divider" />

      <div className="icon-rail-group icon-rail-initiatives" aria-label="Initiative shortcuts">
        {initiatives.map((initiative) => {
          const active = activeInitiativeId === initiative.id;
          const displayTitle = getInitiativeDisplayTitle(initiative.title, initiative.description);
          const progress = getInitiativeProgressModel(initiative, snapshot);

          return (
            <button
              key={initiative.id}
              type="button"
              className={`icon-rail-initiative${active ? " active" : ""}`}
              onClick={() => navigate(getInitiativeResumeHref(initiative, progress, snapshot))}
              aria-label={displayTitle}
              title={displayTitle}
            >
              <span className="icon-rail-initiative-mark">{getMonogram(displayTitle)}</span>
              <span className="icon-rail-initiative-label">{displayTitle}</span>
            </button>
          );
        })}
      </div>

      {navigatorContent ? (
        <div className={`icon-rail-navigator${navigatorOpen ? " open" : ""}`}>
          <div className="icon-rail-navigator-inner">{navigatorContent}</div>
        </div>
      ) : null}

      <div className="icon-rail-spacer" />

      <div className="icon-rail-group">
        <RailButton
          active={location.pathname === "/settings"}
          ariaLabel="Settings"
          label="Settings"
          onClick={() => navigate("/settings")}
        >
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3.1" />
            <path d="M19.4 14.5c.05-.4.1-.82.1-1.25s-.05-.85-.1-1.25l2.02-1.58-1.92-3.32-2.45.82a7.86 7.86 0 0 0-2.17-1.25L14.5 4h-5l-.4 2.67c-.78.3-1.51.72-2.17 1.25l-2.45-.82-1.92 3.32 2.02 1.58c-.05.4-.1.82-.1 1.25s.05.85.1 1.25L2.56 16.1l1.92 3.32 2.45-.82c.66.53 1.39.95 2.17 1.25L9.5 22h5l.4-2.67c.78-.3 1.51-.72 2.17-1.25l2.45.82 1.92-3.32-2.04-1.08Z" />
          </svg>
        </RailButton>
      </div>
    </div>
  );
};
