import { Icon } from "./Icon";

export type RowStatus = "paid" | "skipped" | "invalid" | "pending" | "queued";

const look: Record<RowStatus, { cls: string; label: string; icon: Parameters<typeof Icon>[0]["name"] }> =
  {
    paid: { cls: "pill-paid", label: "paid", icon: "check" },
    skipped: { cls: "pill-skip", label: "skipped", icon: "dash" },
    invalid: { cls: "pill-bad", label: "invalid", icon: "cross" },
    pending: { cls: "", label: "sending", icon: "spinner" },
    queued: { cls: "", label: "queued", icon: "clock" },
  };

export function StatusPill({ status, label }: { status: RowStatus; label?: string }) {
  const l = look[status];
  return (
    <span className={`pill ${l.cls}`}>
      <Icon name={l.icon} size={12} />
      {label ?? l.label}
    </span>
  );
}

export function Pill({ children, tone }: { children: React.ReactNode; tone?: "ok" | "warn" | "bad" }) {
  const cls = tone === "ok" ? "pill-paid" : tone === "warn" ? "pill-skip" : tone === "bad" ? "pill-bad" : "";
  return <span className={`pill ${cls}`}>{children}</span>;
}
