/**
 * Hash navigation that always lands the reader at the top of what they asked
 * for. Clicking a footer link from the bottom of a long page and having the
 * view stay where it was reads as a dead link, so the scroll is part of the
 * navigation rather than an afterthought.
 */

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function scrollToTop(): void {
  window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
}

/** Normalises `""`, `"#"` and `"#/"`, which all mean the composer. */
function sameTarget(href: string): boolean {
  const now = window.location.hash || "#/";
  return (now === "#" ? "#/" : now) === href;
}

export function navigate(href: string): void {
  // A hash that is already current fires no `hashchange`, so the route effect
  // never runs and the click would do nothing at all.
  if (sameTarget(href)) scrollToTop();
  else window.location.hash = href;
}
