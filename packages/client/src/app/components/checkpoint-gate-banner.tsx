interface CheckpointGateBannerProps {
  title?: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}

export const CheckpointGateBanner = ({
  title,
  body,
  actionLabel,
  onAction,
  disabled = false,
}: CheckpointGateBannerProps) => (
  <div className="checkpoint-gate-banner">
    <div className="checkpoint-gate-copy">
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
