import { useCallback, useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { TOUR_KEY, TOUR_STEPS } from "../lib/tour";

/**
 * driver.js handles overlay, focus and keyboard; styling is ours. Offered once,
 * and a blocked localStorage only means the offer returns, never an error.
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
      // The exit stays on every step, not just the first.
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

  // Late enough that the targets have laid out.
  useEffect(() => {
    if (!enabled || alreadySeen()) return;
    const t = window.setTimeout(start, 900);
    return () => window.clearTimeout(t);
  }, [enabled, start]);

  // Leaving the composer closes it: the steps point at fields that are gone.
  useEffect(() => {
    if (!enabled) ref.current?.destroy();
  }, [enabled]);

  useEffect(() => () => ref.current?.destroy(), []);

  return start;
}
