import type { ProjectedBark } from '@jelly/sim';
import styles from './BarkBubble.module.css';

/**
 * What the Jelly Bean is shouting (§11.2).
 *
 * The barks are the interface — canon says players know what their Jelly Bean needs before
 * they have looked at the screen `[C§5]` — so this is an `aria-live="polite"` region
 * (§11.3): it announces itself when it changes, without interrupting.
 *
 * Tapping it resolves the need, which is the shortest path from "the bubble appeared" to
 * "it went away" and the reason a session can be sixty seconds long.
 */
export interface BarkBubbleProps {
  bark: ProjectedBark | null;
  onResolve: (bark: ProjectedBark) => void;
  /** False when the player has nothing to resolve it with; the bubble stays, the tap does not. */
  canResolve: boolean;
}

export function BarkBubble({ bark, onResolve, canResolve }: BarkBubbleProps) {
  return (
    <div className={styles.slot} aria-live="polite">
      {bark ? (
        <button
          type="button"
          className={styles.bubble}
          onClick={() => onResolve(bark)}
          disabled={!canResolve}
        >
          {bark.text}
        </button>
      ) : null}
    </div>
  );
}
