import type { KeyboardEvent } from "react";
import type { PipelineNodeKey, PipelineNodeModel } from "../utils/initiative-progress.js";

const isInteractiveKey = (node: PipelineNodeModel): boolean =>
  node.state !== "future";

interface PipelineProps {
  ariaLabel?: string;
  compact?: boolean;
  nodes: PipelineNodeModel[];
  onNodeClick?: (key: PipelineNodeKey) => void;
  selectedKey?: PipelineNodeKey | null;
}

export const Pipeline = ({
  ariaLabel = "Workflow progress",
  compact = false,
  nodes,
  onNodeClick,
  selectedKey = null,
}: PipelineProps) => {
  const interactiveKeys = nodes.filter(isInteractiveKey).map((node) => node.key);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, key: PipelineNodeKey) => {
    if (!onNodeClick) {
      return;
    }

    const currentIndex = interactiveKeys.indexOf(key);
    if (currentIndex < 0) {
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      const nextKey = interactiveKeys[Math.min(currentIndex + 1, interactiveKeys.length - 1)];
      if (nextKey) {
        onNodeClick(nextKey);
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const previousKey = interactiveKeys[Math.max(currentIndex - 1, 0)];
      if (previousKey) {
        onNodeClick(previousKey);
      }
    }
  };

  return (
    <div className={`pipeline${compact ? " pipeline-compact" : ""}`} role="list" aria-label={ariaLabel}>
      {nodes.map((node, index) => {
        const interactive = Boolean(onNodeClick) && isInteractiveKey(node);
        const selected = selectedKey === node.key;
        const buttonClassName = [
          "pipeline-node",
          `pipeline-node-${node.state}`,
          `pipeline-node-${node.zone}`,
          selected ? "pipeline-node-selected" : "",
          compact ? "pipeline-node-compact" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div key={node.key} className="pipeline-segment" role="listitem">
            {index > 0 ? (
              <div
                className={`pipeline-connector${node.state === "complete" ? " pipeline-connector-complete" : ""}${
                  index === 5 ? " pipeline-connector-boundary" : ""
                }`}
              />
            ) : null}
            <button
              type="button"
              className={buttonClassName}
              disabled={!interactive}
              aria-current={selected ? "step" : undefined}
              onClick={() => onNodeClick?.(node.key)}
              onKeyDown={(event) => handleKeyDown(event, node.key)}
            >
              <span className="pipeline-dot" aria-hidden="true">
                {node.state === "complete" ? (
                  <svg viewBox="0 0 16 16" className="pipeline-checkmark">
                    <path d="M4 8.5 6.6 11 12 5.5" />
                  </svg>
                ) : null}
              </span>
              {!compact ? <span className="pipeline-label">{node.label}</span> : null}
            </button>
          </div>
        );
      })}
    </div>
  );
};
