import { useCallback, useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { TOUR_KEY, TOUR_STEPS } from "../lib/tour";

/**
 * The guided tour. driver.js handles the overlay, focus and keyboard; the
 * styling is ours (see styles/tour.css) so a popover reads as part of the app
 * rather than as a third-party widget.
 *
 * It offers itself once. Finishing or skipping writes a flag, and a blocked or
 * cleared localStorage only means the offer comes back, never an error.
 */

function remember(value: "done" | "skipped") {
  try {
    localStorage.setItem(TOUR_KEY, value);
  } catch {
    /* private window, or site data blocked */
  }
}

function alreadySeen(): boolean {
  try {
    return Boolean(localStorage.getItem(TOUR_KEY));
  } catch {
    return false;
  }
}

export function useTour({ enabled }: { enabled: boolean }) {
  const ref = useRef<Driver | null>(null);

  const start = useCallback(() => {
    ref.current?.destroy();
    const d = driver({
      showProgress: true,
      progressText: "{{current}} of {{total}}",
      overlayColor: "#040217",
      overlayOpacity: 0.55,
      stagePadding: 8,
      stageRadius: 18,
      popoverClass: "pf-tour",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Start a run",
      // The close control is the "I'll explore on my own" exit, so it stays
      // available on every step rather than only the first.
      showButtons: ["next", "previous", "close"],
      steps: TOUR_STEPS.map((s) => ({
        element: s.target,
        popover: {
          title: s.title,
          description: s.body,
          side: s.side,
          align: s.align,
        },
      })),
      onDestroyed: () => {
        remember(ref.current?.isLastStep() ? "done" : "skipped");
      },
    });
    ref.current = d;
    d.drive();
  }, []);

  // Offered once, and late enough that the wallet button and the quote panel
  // have laid out, since a step pointing at nothing is worse than no step.
  useEffect(() => {
    if (!enabled || alreadySeen()) return;
    const t = window.setTimeout(start, 900);
    return () => window.clearTimeout(t);
  }, [enabled, start]);

  // Leaving the composer has to close it too. The steps point at fields that no
  // longer exist, so an overlay left running would highlight nothing on a page
  // it was never about.
  useEffect(() => {
    if (!enabled) ref.current?.destroy();
  }, [enabled]);

  useEffect(() => () => ref.current?.destroy(), []);

  return start;
}
