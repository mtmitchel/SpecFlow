import { useLocation, useNavigate } from "react-router-dom";
import type { ArtifactsSnapshot, Initiative } from "../../types.js";

interface IconRailProps {
  onOpenCommandPalette: () => void;
  onToggleNavigator: () => void;
  navigatorOpen: boolean;
  snapshot: ArtifactsSnapshot;
}

const getMonogram = (initiative: Initiative): string => {
  const tokens = initiative.title
    .split(/\s+/)
    .map((token) => token[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2);

  return tokens.join("") || "SF";
};

const RailIcon = ({
  active,
  ariaLabel,
  children,
  onClick,
}: {
  active?: boolean;
  ariaLabel: string;
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
    {children}
  </button>
);

export const IconRail = ({ onOpenCommandPalette, onToggleNavigator, navigatorOpen, snapshot }: IconRailProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const initiatives = [...snapshot.initiatives].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
  const homeActive = location.pathname === "/";

  return (
    <div className="icon-rail">
      <div className="icon-rail-group">
        <button
          type="button"
          className={`icon-rail-logo${homeActive ? " active" : ""}`}
          onClick={() => navigate("/")}
          aria-label="Home"
          title="Home"
        >
          <span>SF</span>
        </button>
        <RailIcon
          active={navigatorOpen}
          ariaLabel={navigatorOpen ? "Close project navigator" : "Open project navigator"}
          onClick={onToggleNavigator}
        >
          <svg viewBox="0 0 16 16">
            <path d="M3 4.5h10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z" />
            <path d="M5.5 4.5v7" />
          </svg>
        </RailIcon>
      </div>

      <div className="icon-rail-divider" />

      <div className="icon-rail-group icon-rail-initiatives" aria-label="Initiative shortcuts">
        {initiatives.map((initiative) => {
          const active = location.pathname.startsWith(`/initiative/${initiative.id}`);

          return (
            <button
              key={initiative.id}
              type="button"
              className={`icon-rail-initiative${active ? " active" : ""}`}
              onClick={() => navigate(`/initiative/${initiative.id}`)}
              aria-label={initiative.title}
              title={initiative.title}
            >
              <span>{getMonogram(initiative)}</span>
            </button>
          );
        })}
      </div>

      <div className="icon-rail-spacer" />

      <div className="icon-rail-group">
        <RailIcon ariaLabel="Search and commands" onClick={onOpenCommandPalette}>
          <svg viewBox="0 0 16 16">
            <path d="M7 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm3.1 7.1L13 13" />
          </svg>
        </RailIcon>
        <RailIcon active={location.pathname === "/settings"} ariaLabel="Settings" onClick={() => navigate("/settings")}>
          <svg viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="2.3" />
            <path d="M6.8 1.7h2.4l.35 1.65a5.4 5.4 0 0 1 1.2.7l1.6-.5.95 1.6-1.25 1.15c.08.43.08.87 0 1.3l1.25 1.15-.95 1.6-1.6-.5a5.4 5.4 0 0 1-1.2.7l-.35 1.65H6.8l-.35-1.65a5.4 5.4 0 0 1-1.2-.7l-1.6.5-.95-1.6 1.25-1.15a4 4 0 0 1 0-1.3L2.7 5.12l.95-1.6 1.6.5a5.4 5.4 0 0 1 1.2-.7z" />
          </svg>
        </RailIcon>
      </div>
    </div>
  );
};
