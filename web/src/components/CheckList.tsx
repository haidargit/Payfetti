import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type CheckState = "pending" | "pass" | "fail" | "absent";

const glyph: Record<CheckState, IconName> = {
  pending: "spinner",
  pass: "check",
  fail: "cross",
  absent: "dash",
};

const cls: Record<CheckState, string> = {
  pending: "",
  pass: "is-pass",
  fail: "is-fail",
  absent: "",
};

export function CheckList({ children }: { children: ReactNode }) {
  return <ul className="checks">{children}</ul>;
}

export function Check({
  state,
  title,
  children,
}: {
  state: CheckState;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className={`check ${cls[state]}`}>
      <span className="check-mark">
        <Icon name={glyph[state]} size={12} />
      </span>
      <div>
        <div className="check-title">{title}</div>
        {children && <div className="check-body small">{children}</div>}
      </div>
    </li>
  );
}
