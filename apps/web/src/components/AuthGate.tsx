import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../session.js';
import { AppShell } from './AppShell.js';
import styles from './AuthGate.module.css';

/**
 * Wraps every signed-in route. Asks the server who we are, waits for the answer, and
 * sends anyone without a session to the sign-in screen.
 *
 * The waiting state matters more than it looks: on a cold app open this is the first
 * paint, and flashing the login screen at a player who *is* signed in — before the /me
 * response lands — is the difference between "it remembered me" and "it logged me out".
 */
export function AuthGate() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) {
    return (
      <div className={styles.waiting}>
        <div className={styles.bean} aria-hidden="true" />
        <p>Waking the island…</p>
      </div>
    );
  }

  if (session.isError) {
    return (
      <div className={styles.waiting}>
        <div className={styles.bean} aria-hidden="true" />
        {/* §10.5: the server is authoritative, so offline is a waiting screen, not a
            degraded game. */}
        <p>Jelly Bean is waiting for you…</p>
        <button onClick={() => void session.refetch()}>Try again</button>
      </div>
    );
  }

  if (!session.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <AppShell />;
}
