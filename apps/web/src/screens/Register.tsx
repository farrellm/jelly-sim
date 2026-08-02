import { useState, type FormEvent } from 'react';
import { PASSWORD_MIN } from '@jelly/shared';
import { Link, useNavigate } from 'react-router-dom';
import { ApiRequestError, api } from '../api/client.js';
import { useSetSession } from '../session.js';
import styles from './Auth.module.css';

export function Register() {
  const navigate = useNavigate();
  const setSession = useSetSession();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [beanName, setBeanName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSession(await api.register({ username, password, beanName }));
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
      <h1 className={styles.title}>A plot of your own</h1>
      <p className={styles.blurb}>
        Dr. Bubblegum has land to spare and a Jelly Bean that needs looking after.
      </p>

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
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          required
        />
        <small className={styles.hint}>At least {PASSWORD_MIN} characters.</small>
      </label>

      <label className={styles.field}>
        <span>Name your Jelly Bean</span>
        <input
          value={beanName}
          onChange={(e) => setBeanName(e.target.value)}
          maxLength={24}
          required
        />
      </label>

      {/*
        DESIGN.md §9.1: we ask for no email, so we cannot send a reset link. Saying so
        here, before anyone has anything to lose, is the whole mitigation.
      */}
      <p className={styles.warning}>
        We never ask for your email — which means there is no password reset. Write your password
        down somewhere safe.
      </p>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <button className="primary" type="submit" disabled={busy}>
        {busy ? 'Planting…' : 'Start'}
      </button>

      <p className={styles.footer}>
        Already have a Jelly Bean? <Link to="/login">Sign in</Link>
      </p>
    </form>
  );
}
