import type { ReactNode } from 'react';

export interface MobileShellProps {
  /** Compact HUD rendered in the top ~15% safe-area zone. */
  topHud?: ReactNode;
  /** Interactive middle ~55% viewport slot (e.g., 3D island canvas). */
  viewport?: ReactNode;
  /** Thumb-zone action bar and 5-tab navigation in the bottom ~30%. */
  bottomDock?: ReactNode;
  /** Optional full-screen modal / bottom-sheet overlay layer. */
  overlay?: ReactNode;
}

/**
 * Portrait-first iPhone shell enforcing 100dvh height, safe-area insets,
 * zero horizontal overflow, and a 3-region thumb-ergonomic layout.
 */
export function MobileShell({
  topHud,
  viewport,
  bottomDock,
  overlay,
}: MobileShellProps) {
  return (
    <div className="mobile-shell">
      <header className="mobile-shell__top-hud" aria-label="Status HUD">
        <div className="mobile-shell__slot-inner">{topHud}</div>
      </header>

      <main className="mobile-shell__viewport" aria-label="Island Viewport">
        {viewport}
      </main>

      <nav className="mobile-shell__bottom-dock" aria-label="Thumb Navigation Dock">
        <div className="mobile-shell__slot-inner">{bottomDock}</div>
      </nav>

      {overlay ? (
        <div className="mobile-shell__overlay">{overlay}</div>
      ) : null}
    </div>
  );
}
