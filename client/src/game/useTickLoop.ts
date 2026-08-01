/**
 * Drives the simulation clock (DESIGN.md §7): ~1 s cadence for logic, animations are CSS.
 *
 * The delta comes from the wall clock rather than the interval period, so a throttled background
 * timer still advances the sim by the right amount.
 */

import { useEffect, useRef } from "react";
import { TICK_INTERVAL_MS } from "@jelly/shared";

import { useGameStore } from "../store/gameStore.js";

export function useTickLoop(active: boolean): void {
  const tick = useGameStore((s) => s.tick);
  const lastRef = useRef(Date.now());

  useEffect(() => {
    if (!active) return;

    lastRef.current = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const dt = now - lastRef.current;
      lastRef.current = now;
      if (dt > 0) tick(dt);
    }, TICK_INTERVAL_MS);

    // Coming back from a backgrounded tab: catch up in one step instead of drifting.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      const dt = now - lastRef.current;
      lastRef.current = now;
      if (dt > 0) tick(dt);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, tick]);
}
