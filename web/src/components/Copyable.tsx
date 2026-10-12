import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { shortHex } from "../lib/format";

/**
 * Addresses, hashes and receipt links all have to leave this page by hand, so
 * copying is a first-class control rather than a hover affordance. The full
 * value stays in `title` and in the clipboard; only the display is shortened.
 */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard is blocked outside a secure context, so fall back to a
      // selection the user can copy with the keyboard.
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    timer.current = window.setTimeout(() => setDone(false), 1400);
  }

  return (
    <button
      type="button"
      className={`copy-btn${done ? " is-done" : ""}`}
      onClick={copy}
      aria-label={done ? "Copied" : `Copy ${label ?? "value"}`}
      title={done ? "Copied" : `Copy ${label ?? "value"}`}
    >
      <Icon name={done ? "check" : "copy"} size={13} />
    </button>
  );
}

export function Copyable({
  value,
  display,
  short,
  mono = true,
  label,
}: {
  value: string;
  display?: string;
  /** Shorten a hex value to head/tail form. */
  short?: boolean;
  mono?: boolean;
  label?: string;
}) {
  return (
    <span className="copy">
      <span
        className="copy-val"
        style={mono ? undefined : { fontFamily: "inherit", fontSize: "inherit" }}
        title={value}
      >
        {display ?? (short ? shortHex(value) : value)}
      </span>
      <CopyButton value={value} label={label} />
    </span>
  );
}
