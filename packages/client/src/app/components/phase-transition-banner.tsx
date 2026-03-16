interface PhaseTransitionBannerProps {
  title?: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}

export const PhaseTransitionBanner = ({
  title,
  body,
  actionLabel,
  onAction,
  disabled = false,
}: PhaseTransitionBannerProps) => (
  <div className="phase-transition-banner">
    <div className="phase-transition-copy">
      {title ? <strong>{title}</strong> : null}
      {body ? <span>{body}</span> : null}
    </div>
    {actionLabel && onAction ? (
      <button type="button" className="btn-primary" onClick={onAction} disabled={disabled}>
        {actionLabel}
      </button>
    ) : null}
  </div>
);
