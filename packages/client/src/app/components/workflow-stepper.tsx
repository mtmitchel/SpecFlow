export type WorkflowPhase = "export" | "agent" | "verify" | "done";

export const WorkflowStepper = ({ currentPhase }: { currentPhase: WorkflowPhase }) => {
  const steps = [
    { key: "export", label: "Export" },
    { key: "agent", label: "Agent Work" },
    { key: "verify", label: "Verify" },
    { key: "done", label: "Done" }
  ];
  const currentIndex = steps.findIndex((s) => s.key === currentPhase);
  return (
    <div className="workflow-stepper">
      {steps.map((step, i) => (
        <span key={step.key} style={{ display: "contents" }}>
          {i > 0 && <span className="workflow-step-arrow">&rarr;</span>}
          <span className={`workflow-step${i === currentIndex ? " active" : i < currentIndex ? " done" : ""}`}>
            {step.label}
          </span>
        </span>
      ))}
    </div>
  );
};
