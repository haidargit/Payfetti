const LABELS = ["Compose", "Sign once", "Receipts"] as const;

export function Steps({ at }: { at: 0 | 1 | 2 }) {
  return (
    <nav className="steps" aria-label="progress">
      {LABELS.map((label, i) => (
        <span key={label} className={`step${i === at ? " is-now" : i < at ? " is-done" : ""}`}>
          <span className="step-n">{i + 1}</span>
          {label}
        </span>
      ))}
    </nav>
  );
}
