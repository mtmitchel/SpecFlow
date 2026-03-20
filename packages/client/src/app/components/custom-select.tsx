import { useEffect, useRef, useState } from "react";

interface CustomSelectOption {
  value: string;
  label: string;
  detail?: string;
}

interface CustomSelectProps {
  options: CustomSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export const CustomSelect = ({
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  "aria-label": ariaLabel,
}: CustomSelectProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? placeholder ?? "Select";

  return (
    <div className="custom-select-wrap" ref={ref}>
      <button
        type="button"
        className="custom-select-trigger"
        onClick={() => { if (!disabled) setOpen((prev) => !prev); }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span>{displayLabel}</span>
        <span className="custom-select-chevron" aria-hidden="true">{open ? "\u25B4" : "\u25BE"}</span>
      </button>
      {open ? (
        <ul className="custom-select-panel" role="listbox">
          {options.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`custom-select-item${opt.value === value ? " custom-select-item-selected" : ""}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              <span>{opt.label}</span>
              {opt.detail ? <span className="custom-select-item-detail">{opt.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
