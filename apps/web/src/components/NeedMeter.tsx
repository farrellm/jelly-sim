import type { NeedId } from '@jelly/sim';
import styles from './NeedMeter.module.css';

/**
 * One need, drawn (§11.3).
 *
 * Colour is never the only signal: each meter carries an icon and a written label, and the
 * whole thing is a `role="meter"` with a text value, so it reads correctly to a screen
 * reader and to anyone who cannot tell the pink bar from the green one.
 */
export interface NeedMeterProps {
  need: NeedId;
  value: number;
}

const NEEDS: Record<NeedId, { label: string; icon: string; className: string }> = {
  hunger: { label: 'Fed', icon: '🍎', className: 'hunger' },
  warmth: { label: 'Warm', icon: '🧣', className: 'warmth' },
  rest: { label: 'Rested', icon: '😴', className: 'rest' },
  mood: { label: 'Happy', icon: '🫧', className: 'mood' },
};

export function NeedMeter({ need, value }: NeedMeterProps) {
  const { label, icon, className } = NEEDS[need];
  const low = value < 30;

  return (
    <div className={styles.meter}>
      <span className={styles.head}>
        <span aria-hidden="true">{icon}</span>
        <span className={styles.label}>{label}</span>
        <span className={low ? `${styles.value} ${styles.low}` : styles.value}>{value}</span>
      </span>
      <span
        className={styles.track}
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${label}: ${value} out of 100`}
      >
        <span
          className={`${styles.fill} ${styles[className]}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </span>
    </div>
  );
}
