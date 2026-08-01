/**
 * Autosave triggers (DESIGN.md §14): every ~30 s while active, on backgrounding, and a
 * best-effort flush on page hide.
 *
 * `navigator.sendBeacon` can't carry the `Authorization` header, so the unload path uses
 * `fetch(..., { keepalive: true })` instead.
 */

import { useEffect } from "react";

import { useGameStore } from "../store/gameStore.js";

const AUTOSAVE_INTERVAL_MS = 30_000;

export function useAutosave(token: string | null): void {
  useEffect(() => {
    if (!token) return;

    const save = (keepalive = false) => {
      void useGameStore.getState().save(token, { keepalive });
    };

    const id = window.setInterval(() => save(), AUTOSAVE_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") save(true);
    };
    const onPageHide = () => save(true);
    // Retry whatever we queued while the connection was down.
    const onOnline = () => save();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("online", onOnline);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("online", onOnline);
      save();
    };
  }, [token]);
}
