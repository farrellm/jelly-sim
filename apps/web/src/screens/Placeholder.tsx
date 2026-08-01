import styles from './Placeholder.module.css';

/**
 * A routed screen that does not exist yet. Every tab is reachable from day one — the
 * navigation shape is part of what Phase 0 delivers — and each says plainly which phase
 * fills it in, rather than pretending to be under construction.
 */
export function Placeholder({
  title,
  phase,
  blurb,
}: {
  title: string;
  phase: string;
  blurb: string;
}) {
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.blurb}>{blurb}</p>
      <p className={styles.phase}>Arrives in {phase}.</p>
    </div>
  );
}
