import { NavLink } from 'react-router-dom';
import styles from './TabBar.module.css';

/**
 * DESIGN.md §10.2: Island · Farm · Games · Quests · Friends. Island is home and every
 * other screen is one tap from it — a sixty-second session does not survive nested
 * navigation.
 */
const TABS = [
  { to: '/', label: 'Island', icon: '🏝', end: true },
  { to: '/farm', label: 'Farm', icon: '🌱' },
  { to: '/games', label: 'Games', icon: '🎮' },
  { to: '/quests', label: 'Quests', icon: '📜' },
  { to: '/friends', label: 'Friends', icon: '👥' },
];

export function TabBar() {
  return (
    <nav className={styles.bar} aria-label="Main">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => (isActive ? `${styles.tab} ${styles.active}` : styles.tab)}
        >
          <span className={styles.icon} aria-hidden="true">
            {tab.icon}
          </span>
          <span className={styles.label}>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
