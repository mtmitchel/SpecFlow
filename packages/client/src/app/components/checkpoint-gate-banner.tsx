interface CheckpointGateBannerProps {
  title: string;
  body: string;
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
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
    {actionLabel && onAction ? (
      <button type="button" onClick={onAction} disabled={disabled}>
        {actionLabel}
      </button>
    ) : null}
  </div>
);
