import { DECAYING_NEEDS } from '@jelly/sim';
import { Link } from 'react-router-dom';
import { NeedMeter } from '../components/NeedMeter.js';
import { useGame } from '../game/useGame.js';
import styles from './Bean.module.css';

/**
 * The bean sheet (§10.2): needs, stage, flavor, and the counters.
 *
 * Note what is *not* here. The hole count is a stat like any other, sitting in a grid next
 * to the harvest count, with no tooltip and no adjacency to the mood meter above it. A
 * player reading this page learns how many holes they have dug and nothing whatsoever
 * about what that did `[C§5]`. That is the design (§5.1, §16) — see CLAUDE.md.
 */
export function Bean() {
  const { view, isPending } = useGame();

  if (isPending || !view) return <p className={styles.loading}>Loading…</p>;

  return (
    <div className={styles.sheet}>
      <Link to="/" className={styles.back}>
        ← Island
      </Link>

      <header className={styles.header}>
        <h1 className={styles.name}>{view.name}</h1>
        <p className={styles.sub}>
          {view.stage} · {view.flavor.replace(/_/g, ' ')} · level {view.level}
        </p>
      </header>

      <section className={styles.needs} aria-label="Needs">
        {DECAYING_NEEDS.map((need) => (
          <NeedMeter key={need} need={need} value={view.needs[need]} />
        ))}
        <NeedMeter need="mood" value={view.needs.mood} />
      </section>

      {view.asleep ? (
        <p className={styles.asleep} role="status">
          {view.name} is asleep.
        </p>
      ) : null}

      <dl className={styles.stats}>
        <div>
          <dt>Jelly coins</dt>
          <dd>{view.wallet.jellyCoins}</dd>
        </div>
        <div>
          <dt>Bean bucks</dt>
          <dd>{view.wallet.beanBucks}</dd>
        </div>
        <div>
          <dt>Holes</dt>
          <dd>{view.holes}</dd>
        </div>
      </dl>

      <p className={styles.note}>
        Farming, building, college, and adventures arrive in later phases. For now there is a Jelly
        Bean and there are four things it needs.
      </p>
    </div>
  );
}
