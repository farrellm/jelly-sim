import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { getVolume, playBark, setVolume, type Channel } from '../audio/barks.js';
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

      <section className={styles.section} aria-label="Sound">
        <h2 className={styles.heading}>Sound</h2>
        <VolumeSlider channel="barks" label="Barks" />
        <VolumeSlider
          channel="ambience"
          label="Ambience"
          hint="Weather and the day, from Phase 3."
        />
        <VolumeSlider channel="sfx" label="Effects" hint="Digging, harvests, and the rest." />
      </section>

      <p className={styles.note}>
        Notifications, session management, and idle mode land alongside the systems they control.
      </p>

      <button onClick={() => void signOut()} disabled={busy}>
        Sign out
      </button>
    </div>
  );
}

/**
 * §10.6 wants barks, ambience, and effects on separate sliders, because the ambience track
 * is a legitimate reason to leave the app open and turning it down should not silence the
 * Jelly Bean. Ambience and effects are wired now and land with the systems that use them.
 */
function VolumeSlider({
  channel,
  label,
  hint,
}: {
  channel: Channel;
  label: string;
  hint?: string;
}) {
  const [value, setValue] = useState(() => getVolume(channel));

  return (
    <label className={styles.slider}>
      <span className={styles.sliderLabel}>
        {label}
        {hint ? <span className={styles.sliderHint}>{hint}</span> : null}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => {
          const next = Number(e.target.value) / 100;
          setValue(next);
          setVolume(channel, next);
          // Play the change, once audio is awake — a volume slider you cannot hear is a
          // guess.
          if (channel === 'barks') playBark('hungry', { preview: true });
        }}
      />
    </label>
  );
}
