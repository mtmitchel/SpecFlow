import { useLocation, useNavigate } from "react-router-dom";
import type { ArtifactsSnapshot, Initiative } from "../../types.js";

interface IconRailProps {
  onOpenCommandPalette: () => void;
  onToggleNavigator: () => void;
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

export const IconRail = ({ onOpenCommandPalette, onToggleNavigator, snapshot }: IconRailProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const initiatives = [...snapshot.initiatives].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );

  return (
    <div className="icon-rail">
      <button
        type="button"
        className="icon-rail-logo"
        onClick={onToggleNavigator}
        aria-label="Open navigation drawer"
        title="Open navigation drawer"
      >
        <span>SF</span>
      </button>

      <div className="icon-rail-group">
        <RailIcon active={location.pathname === "/"} ariaLabel="Home" onClick={() => navigate("/")}>
          <svg viewBox="0 0 16 16">
            <path d="M3 8.8 8 4.3l5 4.5V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
          </svg>
        </RailIcon>
        <RailIcon
          active={location.pathname.startsWith("/tickets") || location.pathname.startsWith("/ticket/")}
          ariaLabel="All tickets"
          onClick={() => navigate("/tickets")}
        >
          <svg viewBox="0 0 16 16">
            <path d="M3 5h10a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 0v6" />
          </svg>
        </RailIcon>
        <RailIcon
          active={location.pathname.startsWith("/runs") || location.pathname.startsWith("/run/")}
          ariaLabel="All runs"
          onClick={() => navigate("/runs")}
        >
          <svg viewBox="0 0 16 16">
            <path d="m5.5 3.5 6 4.5-6 4.5Z" />
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

