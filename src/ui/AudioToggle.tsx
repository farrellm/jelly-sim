export interface AudioToggleProps {
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Tactile iPhone-friendly sound mute/unmute toggle (>= 44x44px tap target).
 */
export function AudioToggle({ enabled, onToggle, className }: AudioToggleProps) {
  const extraClass = className ? ` ${className}` : '';

  return (
    <button
      type="button"
      className={`hud-pill hud-icon-button audio-toggle${
        enabled ? ' audio-toggle--on' : ' audio-toggle--muted'
      }${extraClass}`}
      onClick={onToggle}
      aria-pressed={enabled}
      aria-label={enabled ? 'Mute sound' : 'Unmute sound'}
      title={enabled ? 'Sound on — tap to mute' : 'Sound muted — tap to unmute'}
    >
      {enabled ? (
        <svg
          className="audio-toggle-icon"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      ) : (
        <svg
          className="audio-toggle-icon"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </svg>
      )}
    </button>
  );
}
