import { SPACE_COST_BB, type ProjectedView } from '@jelly/sim';
import type { CareAction } from '../game/store.js';
import styles from './CareRow.module.css';

/**
 * The thumb zone (§11.2).
 *
 * Portrait, one hand: the bottom third holds everything interactive and the top is display
 * only. Every button clears 44 pt, and each is badged when the need it answers is low so a
 * player can act without reading anything.
 *
 * **⛏ Dig is styled identically to the others and says nothing.** It is free, it feels
 * productive, and it is quietly making things worse `[C§5]`. It gets no tooltip, no badge,
 * no cost, no confirmation, and no hint. If you are here to add the obviously missing
 * explanation of what digging does to your Jelly Bean's mood: don't. Read CLAUDE.md.
 */
export interface CareRowProps {
  view: ProjectedView;
  onAction: (action: CareAction) => void;
}

export function CareRow({ view, onAction }: CareRowProps) {
  const { needs, can, asleep } = view;

  return (
    <div className={styles.row}>
      <CareButton
        icon="🍎"
        label="Feed"
        badge={needs.hunger < 30}
        disabled={!can.feed}
        onClick={() => onAction({ t: 'feed', item: 'hamburger' })}
      />
      <CareButton
        icon="🧣"
        label="Warm"
        badge={needs.warmth < 30}
        disabled={!can.warm}
        onClick={() => onAction({ t: 'warm', item: 'blanket' })}
      />
      <CareButton
        icon={asleep ? '⏰' : '😴'}
        label={asleep ? 'Wake' : 'Sleep'}
        badge={!asleep && needs.rest < 30}
        onClick={() => onAction({ t: 'sleep' })}
      />
      <CareButton
        icon="🫧"
        label="Space"
        note={`${SPACE_COST_BB}💵`}
        badge={needs.mood < 30}
        disabled={!can.giveSpace}
        onClick={() => onAction({ t: 'giveSpace' })}
      />
      <CareButton icon="⛏" label="Dig" onClick={() => onAction({ t: 'digHole' })} />
    </div>
  );
}

interface CareButtonProps {
  icon: string;
  label: string;
  note?: string;
  badge?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function CareButton({ icon, label, note, badge, disabled, onClick }: CareButtonProps) {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={onClick}
      disabled={disabled}
      aria-label={note ? `${label}, ${note}` : label}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.label}>{label}</span>
      {note ? <span className={styles.note}>{note}</span> : null}
      {badge ? <span className={styles.badge} aria-hidden="true" /> : null}
    </button>
  );
}
