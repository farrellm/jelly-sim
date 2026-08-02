import { useEffect } from 'react';
import { useGameStore } from '../game/store.js';
import { playBark, unlockAudio } from './barks.js';

/**
 * Drain the sim's event stream into the speaker (§10.6).
 *
 * Bark playback is driven by `SimEvent`s rather than by watching the meters, so the sound
 * fires on the moment a need crossed the line — including the ones that crossed while the
 * app was closed, which is exactly what a returning player wants to hear about.
 *
 * The first pointerdown anywhere unlocks the AudioContext, because iOS requires a gesture
 * (§11.1). It is registered once and removed after it fires.
 */
export function useBarkAudio(): void {
  useEffect(() => {
    const onFirstGesture = () => unlockAudio();
    window.addEventListener('pointerdown', onFirstGesture, { once: true });

    const unsubscribe = useGameStore.subscribe((state, previous) => {
      if (state.pendingEvents === previous.pendingEvents || state.pendingEvents.length === 0)
        return;

      for (const event of useGameStore.getState().drainEvents()) {
        if (event.t === 'bark') playBark(event.id);
      }
    });

    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      unsubscribe();
    };
  }, []);
}
