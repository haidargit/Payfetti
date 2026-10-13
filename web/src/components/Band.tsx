import type { ReactNode } from "react";

/**
 * One full-bleed section of the page. The inner element carries the rails, so
 * the hairlines line up from the top of the site to the bottom of the footer
 * however the content inside each band is laid out.
 */
export function Band({
  dark,
  id,
  children,
}: {
  dark?: boolean;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section className={`band${dark ? " is-dark" : ""}`} id={id}>
      <div className="band-in">{children}</div>
    </section>
  );
}
