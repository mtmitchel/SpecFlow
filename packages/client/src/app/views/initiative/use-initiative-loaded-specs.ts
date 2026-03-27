import { useEffect, useMemo, useState } from "react";
import { fetchSpecDetail } from "../../../api.js";
import type { SpecDocumentSummary } from "../../../types.js";
import type { SpecStep } from "./shared.js";

export const EMPTY_SPEC_DRAFTS: Record<SpecStep, string> = {
  brief: "",
  "core-flows": "",
  prd: "",
  "tech-spec": "",
};

export const useInitiativeLoadedSpecs = (
  initiativeId: string | null,
  specSummaries: SpecDocumentSummary[],
): Record<SpecStep, string> => {
  const [loadedSpecs, setLoadedSpecs] = useState<Record<SpecStep, string>>(EMPTY_SPEC_DRAFTS);

  const specLoadSignature = useMemo(() => {
    if (!initiativeId) {
      return "";
    }

    return specSummaries
      .filter((spec) => spec.initiativeId === initiativeId)
      .map((spec) => `${spec.id}:${spec.updatedAt}`)
      .sort()
      .join("|");
  }, [initiativeId, specSummaries]);

  useEffect(() => {
    if (!initiativeId) {
      setLoadedSpecs(EMPTY_SPEC_DRAFTS);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const initiativeSpecs = specSummaries.filter((spec) => spec.initiativeId === initiativeId);
    const nextSpecs: Record<SpecStep, string> = { ...EMPTY_SPEC_DRAFTS };

    void Promise.all(
      initiativeSpecs.map(async (summary) => fetchSpecDetail(summary.id, { signal: controller.signal })),
    )
      .then((specs) => {
        if (cancelled) {
          return;
        }

        for (const spec of specs) {
          if (spec.type === "brief" || spec.type === "core-flows" || spec.type === "prd" || spec.type === "tech-spec") {
            nextSpecs[spec.type] = spec.content;
          }
        }

        setLoadedSpecs(nextSpecs);
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[specs] failed to load spec documents:", err);
          setLoadedSpecs(EMPTY_SPEC_DRAFTS);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [initiativeId, specLoadSignature, specSummaries]);

  return loadedSpecs;
};
