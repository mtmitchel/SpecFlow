import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useConfirm } from "../context/confirm.js";

export const useDirtyForm = (isDirty: boolean): void => {
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();

  // Intercept link clicks within the app to guard navigation
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("//")) return;
      e.preventDefault();
      void confirm({
        message: "You have unsaved changes. Discard them?",
        confirmLabel: "Discard",
        destructive: true,
      }).then((confirmed) => {
        if (confirmed) navigate(href);
      });
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [isDirty, navigate, location, confirm]);

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
