import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export const useDirtyForm = (isDirty: boolean): void => {
  const navigate = useNavigate();
  const location = useLocation();

  // Block in-app navigation via patching navigate
  const guardedNavigate = useCallback(
    (to: string) => {
      if (isDirty && !window.confirm("You have unsaved changes. Discard them?")) {
        return;
      }
      navigate(to);
    },
    [isDirty, navigate]
  );

  // Intercept link clicks within the app to guard navigation
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("//")) return;
      e.preventDefault();
      if (window.confirm("You have unsaved changes. Discard them?")) {
        navigate(href);
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [isDirty, navigate, location]);

  // Block browser close / hard refresh
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
};
