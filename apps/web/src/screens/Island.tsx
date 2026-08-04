import type { ProjectedBark } from '@jelly/sim';
import { Link } from 'react-router-dom';
import { BarkBubble } from '../components/BarkBubble.js';
import { CareRow } from '../components/CareRow.js';
import { useGameStore, type CareAction } from '../game/store.js';
import { useGame } from '../game/useGame.js';
import styles from './Island.module.css';

/** What each bark asks for. Tapping the bubble does the obvious thing. */
const RESOLUTION: Record<ProjectedBark['id'], CareAction> = {
  hungry: { t: 'feed', item: 'hamburger' },
  cold: { t: 'warm', item: 'blanket' },
  sleepy: { t: 'sleep' },
  angry: { t: 'giveSpace' },
};

/**
 * The home screen (§10.2). Phase 3 turns the plot into the isometric island — tiles,
 * buildings, weather, Dr. Bubblegum's door. Today it is one Jelly Bean on bare ground,
 * which is the honest state of a game with no economy yet.
 *
 * The layout follows §11.2: the top is display only, the bottom third is the care row, and
 * nothing interactive sits in the middle where a thumb cannot reach it.
 */
export function Island() {
  const { view, isPending, isError } = useGame();
  const dispatch = useGameStore((s) => s.dispatch);
  const rejection = useGameStore((s) => s.rejection);
  const dismiss = useGameStore((s) => s.dismissRejection);
  const offline = useGameStore((s) => s.offline);

  if (isPending) return <p className={styles.note}>Waking the island…</p>;
  if (!view) {
    return (
      <p className={styles.note}>
        {isError ? 'The island is not answering. It will be there in a moment.' : 'Loading…'}
      </p>
    );
  }

  const canResolve = (bark: ProjectedBark) => {
    if (bark.id === 'hungry') return view.can.feed;
    if (bark.id === 'cold') return view.can.warm;
    if (bark.id === 'angry') return view.can.giveSpace;
    return true;
  };

  return (
    <div className={styles.island}>
      {offline ? (
        <p className={styles.offline} role="status">
          Jelly Bean is waiting for you…
        </p>
      ) : null}

      <div className={styles.plot}>
        <BarkBubble
          bark={view.bark}
          canResolve={view.bark ? canResolve(view.bark) : false}
          onResolve={(bark) => dispatch(RESOLUTION[bark.id])}
        />

        <Link to="/bean" className={styles.beanLink} aria-label={`${view.name}, view details`}>
          <div className={view.asleep ? `${styles.bean} ${styles.asleep}` : styles.bean} />
        </Link>

        <p className={styles.caption}>
          {view.asleep ? `${view.name} is asleep.` : `${view.name} has a plot of land.`}
        </p>
      </div>

      {rejection ? (
        <button type="button" className={styles.rejection} onClick={dismiss} role="alert">
          {rejection.message}
        </button>
      ) : null}

      <CareRow view={view} onAction={dispatch} />
    </div>
  );
}
