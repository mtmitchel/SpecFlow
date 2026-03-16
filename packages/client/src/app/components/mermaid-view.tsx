import DOMPurify from "dompurify";
import { useEffect, useId, useRef } from "react";

export const MermaidView = ({ chart }: { chart: string }) => {
  const id = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !chart.trim()) {
      return;
    }

    let cancelled = false;
    const elementId = `mermaid-${id}`;

    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        if (cancelled) {
          return;
        }

        mermaid.initialize({ startOnLoad: false, theme: "neutral" });
        const { svg } = await mermaid.render(elementId, chart);
        if (containerRef.current && !cancelled) {
          containerRef.current.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
        }
      })
      .catch(() => {
        if (containerRef.current && !cancelled) {
          containerRef.current.textContent = chart;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  return <div className="mermaid-view" ref={containerRef} />;
};
