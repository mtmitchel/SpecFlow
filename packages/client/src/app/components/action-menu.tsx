import { useEffect, useRef } from "react";

interface ActionMenuItem {
  disabled?: boolean;
  intent?: "default" | "danger";
  label: string;
  onSelect: () => void | Promise<void>;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  label?: string;
}

export const ActionMenu = ({ items, label = "More" }: ActionMenuProps) => {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!detailsRef.current?.contains(event.target as Node)) {
        detailsRef.current?.removeAttribute("open");
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        detailsRef.current?.removeAttribute("open");
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <details ref={detailsRef} className="action-menu">
      <summary>{label}</summary>
      <div className="action-menu-panel" role="menu">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={item.intent === "danger" ? "action-menu-item action-menu-item-danger" : "action-menu-item"}
            disabled={item.disabled}
            onClick={() => {
              detailsRef.current?.removeAttribute("open");
              void item.onSelect();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
};
