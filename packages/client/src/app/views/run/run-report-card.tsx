import type { ReactNode } from "react";

interface RunReportCardProps {
  title: string;
  badge?: string;
  children: ReactNode;
}

export const RunReportCard = ({
  title,
  badge,
  children,
}: RunReportCardProps) => (
  <section className="run-report-card">
    <div className="run-report-card-header">
      <h3>{title}</h3>
      {badge ? <span className="run-report-badge">{badge}</span> : null}
    </div>
    <div className="run-report-card-body">{children}</div>
  </section>
);
