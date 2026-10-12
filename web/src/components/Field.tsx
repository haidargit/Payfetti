import type { ReactNode } from "react";

export function Field({
  id,
  label,
  aside,
  hint,
  tour,
  children,
}: {
  id: string;
  label: ReactNode;
  aside?: ReactNode;
  hint?: ReactNode;
  /** Anchor for a guided-tour step, see lib/tour.ts. */
  tour?: string;
  children: ReactNode;
}) {
  return (
    <div className="field" data-tour={tour}>
      <label className="field-label" htmlFor={id}>
        <span>{label}</span>
        {aside && <span className="faint tiny">{aside}</span>}
      </label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function Switch({
  id,
  checked,
  onChange,
  title,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div>
      <label className="switch" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="switch-track">
          <span className="switch-knob" />
        </span>
        <span className="switch-title">{title}</span>
      </label>
      {children && <div className="field-hint">{children}</div>}
    </div>
  );
}
