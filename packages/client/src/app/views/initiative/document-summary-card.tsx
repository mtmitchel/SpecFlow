import { useEffect, useMemo, useState } from "react";
import type { InitiativeArtifactStep } from "../../../types.js";
import { MarkdownView, slugifyHeading } from "../../components/markdown-view.js";
import { useToast } from "../../context/toast.js";
import { extractDocumentHeading } from "../../utils/document-heading.js";
import { INITIATIVE_WORKFLOW_LABELS } from "../../utils/initiative-workflow.js";

interface SpecHeading {
  level: number;
  text: string;
  id: string;
}

function extractHeadings(markdown: string): SpecHeading[] {
  const headings: SpecHeading[] = [];
  const lines = markdown.split("\n");
  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = slugifyHeading(text);
      headings.push({ level, text, id });
    }
  }
  return headings;
}

interface DocumentSummaryCardProps {
  step: InitiativeArtifactStep;
  content: string;
  initiativeTitle: string;
  isBusy: boolean;
  onEdit: () => void;
}

const getDocumentSurfaceClass = (step: InitiativeArtifactStep): string =>
  step === "tech-spec" ? "planning-document-body-terminal" : "planning-document-body-editorial";

export const DocumentSummaryCard = ({
  step,
  content,
  initiativeTitle,
  isBusy,
  onEdit
}: DocumentSummaryCardProps) => {
  const { showError, showSuccess } = useToast();
  const [copying, setCopying] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const trimmedContent = content.trim();
  const stepLabel = INITIATIVE_WORKFLOW_LABELS[step];
  const lowerStepLabel = stepLabel.toLowerCase();

  const { title, body } = trimmedContent
    ? extractDocumentHeading(
        trimmedContent,
        step,
        INITIATIVE_WORKFLOW_LABELS[step],
        initiativeTitle,
      )
    : { title: "", body: "" };
  const headings = useMemo(() => extractHeadings(body), [body]);
  const showNav = headings.length >= 3;
  const documentSurfaceClass = getDocumentSurfaceClass(step);

  useEffect(() => {
    setActiveHeadingId(headings[0]?.id ?? null);
  }, [headings]);

  useEffect(() => {
    if (!showNav || typeof window === "undefined") {
      return;
    }

    const updateActiveHeading = () => {
      let nextActiveHeadingId = headings[0]?.id ?? null;
      const headingElements = headings
        .map((heading) => document.getElementById(heading.id))
        .filter((element): element is HTMLElement => Boolean(element));

      const visibleHeading = headingElements.find((element) => {
        const { top } = element.getBoundingClientRect();
        return top >= 0 && top <= 200;
      });

      if (visibleHeading) {
        nextActiveHeadingId = visibleHeading.id;
      } else {
        for (const element of headingElements) {
          if (element.getBoundingClientRect().top <= 160) {
            nextActiveHeadingId = element.id;
            continue;
          }

          break;
        }
      }

      setActiveHeadingId((current) => (current === nextActiveHeadingId ? current : nextActiveHeadingId));
    };

    updateActiveHeading();
    window.addEventListener("scroll", updateActiveHeading, { passive: true });
    window.addEventListener("resize", updateActiveHeading);
    return () => {
      window.removeEventListener("scroll", updateActiveHeading);
      window.removeEventListener("resize", updateActiveHeading);
    };
  }, [headings, showNav]);

  if (!trimmedContent) {
    return (
      <div className="planning-summary-card">
        <h4>Document</h4>
        <p className="text-muted-sm" style={{ margin: 0 }}>
          The document is empty.
        </p>
      </div>
    );
  }

  const handleCopy = async () => {
    if (!navigator.clipboard?.writeText || copying) {
      if (!navigator.clipboard?.writeText) {
        showError("Clipboard is not available");
      }
      return;
    }

    setCopying(true);
    try {
      await navigator.clipboard.writeText(trimmedContent);
      showSuccess(`${stepLabel} copied.`);
    } catch (error) {
      showError((error as Error).message || `We couldn't copy the ${lowerStepLabel}.`);
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="planning-section-card">
      <div className="planning-document-card-header">
        <h3 className="planning-document-card-title">{title}</h3>
        <div className="planning-document-card-actions">
          <button
            type="button"
            className="planning-icon-button"
            aria-label={`Copy ${lowerStepLabel}`}
            onClick={() => void handleCopy()}
            disabled={isBusy || copying}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="5" y="3" width="8" height="10" rx="1.2" />
              <path d="M3.6 10.8h-.4A1.2 1.2 0 0 1 2 9.6V3.2A1.2 1.2 0 0 1 3.2 2h6.4a1.2 1.2 0 0 1 1.2 1.2v.4" />
            </svg>
          </button>
          <button
            type="button"
            className="planning-icon-button"
            aria-label="Edit text"
            onClick={onEdit}
            disabled={isBusy}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M11.8 2.2a1.2 1.2 0 0 1 1.7 1.7L6 11.4 3 12.1l.7-3 8.1-6.9Z" />
              <path d="M9.8 4.1 11.9 6.2" />
            </svg>
          </button>
        </div>
      </div>
      {body ? (
        <div className={showNav ? "planning-document-card-body--with-nav" : undefined}>
          {showNav ? (
            <nav className="spec-section-nav" aria-label="Document sections">
              {headings.map((h) => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  className={`spec-section-nav-item${activeHeadingId === h.id ? " active" : ""}${
                    h.level === 3 ? " spec-section-nav-item--nested" : ""
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveHeadingId(h.id);
                    const el = document.getElementById(h.id);
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  }}
                >
                  {h.text}
                </a>
              ))}
            </nav>
          ) : null}
          <div
            className={`${showNav ? "planning-document-card-content " : ""}${documentSurfaceClass}`}
          >
            <MarkdownView content={body} />
          </div>
        </div>
      ) : null}
    </div>
  );
};
