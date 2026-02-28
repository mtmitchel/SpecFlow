import DOMPurify from "dompurify";
import mermaid from "mermaid";
import { useEffect, useId, useRef } from "react";

mermaid.initialize({ startOnLoad: false, theme: "neutral" });

export const MermaidView = ({ chart }: { chart: string }) => {
  const id = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !chart.trim()) {
      return;
    }

    const elementId = `mermaid-${id}`;
    mermaid
      .render(elementId, chart)
      .then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
        }
      })
      .catch(() => {
        if (containerRef.current) {
          containerRef.current.textContent = chart;
        }
      });
  }, [chart, id]);

  return <div className="mermaid-view" ref={containerRef} />;
};
