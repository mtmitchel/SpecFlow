import type { ReactNode } from "react";

interface PlanningSurveyCardProps {
  children: ReactNode;
  compact?: boolean;
  retryOnly?: boolean;
  transient?: boolean;
}

export const PlanningSurveyCard = ({
  children,
  compact = false,
  retryOnly = false,
  transient = false,
}: PlanningSurveyCardProps) => (
  <div
    className={[
      "planning-survey-card",
      "planning-survey-card-active",
      compact ? "planning-survey-card-compact" : "",
      retryOnly ? "planning-survey-card-retry" : "",
      transient ? "planning-survey-card-transient" : "",
    ]
      .filter(Boolean)
      .join(" ")}
  >
    {children}
  </div>
);
