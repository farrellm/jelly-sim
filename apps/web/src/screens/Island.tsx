import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { STATE_QUERY_KEY } from '../game/useGame.js';
import { useSession } from '../session.js';
import styles from './Island.module.css';

/**
 * The home screen (§10.2). In Phase 3 this becomes the isometric island: tiles,
 * buildings, weather, Dr. Bubblegum's door.
 *
 * For now it proves the thing Phase 0 exists to prove — that a save is on the server,
 * belongs to this player, and is still there when the app comes back.
 */
export function Island() {
  const session = useSession();
  const player = session.data?.players[0];
  const state = useQuery({ queryKey: STATE_QUERY_KEY, queryFn: () => api.state() });

  return (
    <div className={styles.island}>
      <div className={styles.plot}>
        <div className={styles.bean} aria-label={`${player?.beanName ?? 'Your Jelly Bean'}`} />
        <p className={styles.caption}>
          {player?.beanName ?? 'Your Jelly Bean'} has a plot of land and nothing on it yet.
        </p>
      </div>

      <dl className={styles.facts}>
        <div>
          <dt>Stage</dt>
          <dd>{player?.stage ?? '—'}</dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd>{player?.level ?? '—'}</dd>
        </div>
        <div>
          <dt>Save version</dt>
          <dd>{state.data ? `v${state.data.stateVersion}` : '…'}</dd>
        </div>
      </dl>

      <p className={styles.note}>
        Needs, farming, building, and everything else arrive in later phases. The island is empty on
        purpose.
      </p>
    </div>
  );
}
