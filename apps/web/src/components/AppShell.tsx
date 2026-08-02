import type { ReactNode } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useGameStore } from '../game/store.js';
import { useSession } from '../session.js';
import { TabBar } from './TabBar.js';
import styles from './AppShell.module.css';

/**
 * The frame every game screen sits in: a display-only HUD on top, the screen in the
 * middle, the tab bar in the thumb zone at the bottom (§11.2).
 *
 * The HUD reads the live view where it can and falls back to the session's copy of the
 * player row before the save has loaded, so the frame is never blank while the island
 * behind it is still waking up.
 */
export function AppShell({ children }: { children?: ReactNode }) {
  const session = useSession();
  const player = session.data?.players[0];
  const view = useGameStore((s) => s.view);

  const name = view?.name ?? player?.beanName ?? 'Jelly Bean';
  const level = view?.level ?? player?.level ?? 1;
  const stage = view?.stage ?? player?.stage ?? 'larva';

  return (
    <div className={styles.shell}>
      <header className={styles.hud}>
        <div className={styles.hudRow}>
          <span className={styles.beanName}>{name}</span>
          <span className={styles.hudRight}>
            <span className={styles.stat}>Lv {level}</span>
            {view ? (
              <span className={styles.stat} aria-label={`${view.wallet.jellyCoins} jelly coins`}>
                ⭐{view.wallet.jellyCoins}
              </span>
            ) : null}
            {view ? (
              <span className={styles.stat} aria-label={`${view.wallet.beanBucks} bean bucks`}>
                💵{view.wallet.beanBucks}
              </span>
            ) : null}
            {/* Settings is not a tab (§10.2) — it pushes from the island. */}
            <Link to="/settings" className={styles.settings} aria-label="Settings">
              ⚙
            </Link>
          </span>
        </div>
        <div className={styles.hudRowMuted}>
          <span>{stage} stage</span>
          {player?.mode === 'baby' && <span className={styles.badge}>baby mode</span>}
        </div>
      </header>

      <main className={styles.screen}>{children ?? <Outlet />}</main>

      <TabBar />
    </div>
  );
}
