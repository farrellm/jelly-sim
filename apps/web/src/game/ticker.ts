import { useEffect } from 'react';
import { flushOutbox, useGameStore } from './store.js';

/** One local step a second. The meters move slowly; anything faster is battery for nothing. */
const TICK_MS = 1_000;

/**
 * Run the simulation locally between syncs (§10.3).
 *
 * The single biggest battery win available is that this **stops entirely when the tab is
 * hidden** (§10.4). It costs nothing to skip: `advance` is a pure function of elapsed time,
 * so coming back and calling it once catches up on the whole gap in one step. A game people
 * leave open for the ambience `[C§14]` cannot afford a permanent timer.
 */
export function useGameTicker(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => useGameStore.getState().tick(), TICK_MS);
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
        return;
      }

      // Catch up on everything that happened while we were not looking, then ask the
      // server what it thinks — the client's own clock is not the one that counts, and a
      // long absence is exactly when the two are most likely to have drifted apart.
      useGameStore.getState().tick();
      void useGameStore.getState().refetch();
      void flushOutbox();
      start();
    };

    const onOnline = () => void flushOutbox();

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, []);
}
