/**
 * Inline, so the app keeps its "no runtime you have to trust" property: a
 * receipt page that fetches an icon font from a CDN is a third party in the
 * middle of a proof. Stroke icons on currentColor, one weight.
 */

import type { ReactElement } from "react";

export type IconName =
  | "check"
  | "cross"
  | "dash"
  | "clock"
  | "copy"
  | "external"
  | "download"
  | "arrow-right"
  | "wallet"
  | "stack"
  | "spinner"
  | "info"
  | "alert"
  | "seal";

const paths: Record<IconName, ReactElement> = {
  check: <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />,
  cross: <path d="M4 4l8 8M12 4l-8 8" />,
  dash: <path d="M3.5 8h9" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3.2l2.2 1.4" />
    </>
  ),
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
      <path d="M10.5 3.5h-6a1 1 0 0 0-1 1v6" />
    </>
  ),
  external: (
    <>
      <path d="M9 3.5h3.5V7" />
      <path d="M12.5 3.5 7 9" />
      <path d="M11 9.5v2a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2" />
    </>
  ),
  download: (
    <>
      <path d="M8 3v7" />
      <polyline points="5 7.5 8 10.5 11 7.5" />
      <path d="M3.5 12.5h9" />
    </>
  ),
  "arrow-right": (
    <>
      <path d="M3 8h9.5" />
      <polyline points="9.5 5 12.5 8 9.5 11" />
    </>
  ),
  wallet: (
    <>
      <rect x="2.5" y="4" width="11" height="8.5" rx="2" />
      <path d="M10.5 8.25h3" />
    </>
  ),
  stack: (
    <>
      <path d="M8 2.5 14 5.5 8 8.5 2 5.5z" />
      <path d="M2 8.5 8 11.5 14 8.5" />
      <path d="M2 11 8 14 14 11" />
    </>
  ),
  spinner: (
    <>
      <circle cx="8" cy="8" r="5.5" opacity=".22" />
      <path d="M13.5 8A5.5 5.5 0 0 0 8 2.5" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 7.2v3.6" />
      <path d="M8 5.1v.1" />
    </>
  ),
  alert: (
    <>
      <path d="M8 2.8 14 13H2z" />
      <path d="M8 6.6v3" />
      <path d="M8 11.3v.1" />
    </>
  ),
  seal: (
    <>
      <path d="M8 1.8 9.9 3l2.2-.2.4 2.2 1.7 1.4-1 2 .5 2.2-2.1.7L10 13l-2-1-2 1-1.6-1.7-2.1-.7.5-2.2-1-2L3.5 5l.4-2.2L6.1 3z" />
      <polyline points="5.8 7.9 7.4 9.5 10.4 6.3" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={name === "spinner" ? `spin ${className ?? ""}` : className}
      style={{ flex: "none", display: "block" }}
    >
      {paths[name]}
    </svg>
  );
}
