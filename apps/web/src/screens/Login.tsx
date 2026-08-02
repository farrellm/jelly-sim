import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiRequestError, api } from '../api/client.js';
import { useSetSession } from '../session.js';
import styles from './Auth.module.css';

export function Login() {
  const navigate = useNavigate();
  const setSession = useSetSession();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSession(await api.login({ username, password }));
      void navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Could not reach the island. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.screen} onSubmit={(e) => void onSubmit(e)}>
      <h1 className={styles.title}>Jelly Bean Simulator</h1>

      <label className={styles.field}>
        <span>Username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
        />
      </label>

      <label className={styles.field}>
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <button className="primary" type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <p className={styles.footer}>
        No account yet? <Link to="/register">Start a Jelly Bean</Link>
      </p>
    </form>
  );
}
