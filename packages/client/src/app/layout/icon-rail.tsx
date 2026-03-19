import { useLocation, useNavigate } from "react-router-dom";

interface IconRailProps {
  onOpenCommandPalette: () => void;
  navigatorOpen: boolean;
  navigatorContent?: React.ReactNode;
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

export const IconRail = ({ onOpenCommandPalette, navigatorOpen, navigatorContent }: IconRailProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const homeActive = location.pathname === "/";

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
