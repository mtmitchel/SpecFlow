import { useState } from "react";

export const WorkflowSection = ({
  title,
  badge,
  defaultOpen,
  children
}: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="workflow-section">
      <button type="button" className="workflow-section-header" onClick={() => setOpen((v) => !v)}>
        <span className={`workflow-section-chevron${open ? " open" : ""}`}>▸</span>
        {title}
        {badge ? <span className="workflow-section-badge">{badge}</span> : null}
      </button>
      {open && <div className="workflow-section-body">{children}</div>}
    </div>
  );
};
