import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useSession, useSetSession } from '../session.js';
import styles from './Settings.module.css';

export function Settings() {
  const session = useSession();
  const setSession = useSetSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await api.logout();
    } finally {
      setSession(null);
      void navigate('/login', { replace: true });
    }
  }

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Settings</h1>

      <dl className={styles.rows}>
        <div>
          <dt>Signed in as</dt>
          <dd>{session.data?.user.username ?? '—'}</dd>
        </div>
        <div>
          <dt>Jelly Bean</dt>
          <dd>{session.data?.players[0]?.beanName ?? '—'}</dd>
        </div>
      </dl>

      <p className={styles.note}>
        Audio, notifications, session management, and idle mode land alongside the systems they
        control.
      </p>

      <button onClick={() => void signOut()} disabled={busy}>
        Sign out
      </button>
    </div>
  );
}
