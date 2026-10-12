import { Icon } from "./Icon";

export type Verdict = "paid" | "checking" | "unverified";

/**
 * The receipt's verdict, stamped. It is the first thing a payee looks for and
 * the only element on the sheet allowed to be large, so a glance answers "was I
 * paid" before any of the proof detail is read.
 */
export function Seal({ verdict }: { verdict: Verdict }) {
  const look =
    verdict === "paid"
      ? { cls: "", icon: "seal" as const }
      : verdict === "unverified"
        ? { cls: " is-bad", icon: "cross" as const }
        : { cls: " is-wait", icon: "spinner" as const };

  return (
    <span className={`seal${look.cls}`} aria-hidden="true">
      <Icon name={look.icon} size={verdict === "paid" ? 28 : 22} />
    </span>
  );
}
