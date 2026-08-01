import type { ReactNode } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useSession } from '../session.js';
import { TabBar } from './TabBar.js';
import styles from './AppShell.module.css';

/**
 * The frame every game screen sits in: a display-only HUD on top, the screen in the
 * middle, the tab bar in the thumb zone at the bottom (§11.2).
 *
 * The HUD shows level and currencies from Phase 2 onward. For now it shows who you are,
 * which is the only thing there is to know.
 */
export function AppShell({ children }: { children?: ReactNode }) {
  const session = useSession();
  const player = session.data?.players[0];

  return (
    <div className={styles.shell}>
      <header className={styles.hud}>
        <div className={styles.hudRow}>
          <span className={styles.beanName}>{player?.beanName ?? 'Jelly Bean'}</span>
          <span className={styles.hudRight}>
            <span className={styles.stat}>Lv {player?.level ?? 1}</span>
            {/* Settings is not a tab (§10.2) — it pushes from the island. */}
            <Link to="/settings" className={styles.settings} aria-label="Settings">
              ⚙
            </Link>
          </span>
        </div>
        <div className={styles.hudRowMuted}>
          <span>{player?.stage ?? 'larva'} stage</span>
          {player?.mode === 'baby' && <span className={styles.badge}>baby mode</span>}
        </div>
      </header>

      <main className={styles.screen}>{children ?? <Outlet />}</main>

      <TabBar />
    </div>
  );
}
