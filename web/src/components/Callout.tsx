import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type Tone = "info" | "warn" | "err" | "ok";

const glyph: Record<Tone, IconName> = {
  info: "info",
  warn: "alert",
  err: "alert",
  ok: "check",
};

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`note note-${tone}`} role={tone === "err" ? "alert" : undefined}>
      <span className="note-glyph">
        <Icon name={glyph[tone]} size={15} />
      </span>
      <div className="note-body">
        {title && <div className="note-title">{title}</div>}
        {children}
      </div>
    </div>
  );
}
