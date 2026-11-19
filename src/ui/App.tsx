import { useCallback, useRef, useState } from 'react';
import type { SceneManager } from '../render/SceneManager';
import { CanvasViewport } from './CanvasViewport';

type DockTab = 'care' | 'farm' | 'build' | 'play' | 'village';

const DOCK_TABS: ReadonlyArray<{ id: DockTab; label: string; badge: string }> = [
  { id: 'care', label: 'Care', badge: '🍎' },
  { id: 'farm', label: 'Farm', badge: '🌱' },
  { id: 'build', label: 'Build', badge: '🏠' },
  { id: 'play', label: 'Play', badge: '🍬' },
  { id: 'village', label: 'Village', badge: '🏝️' },
];

function formatPadLabel(padName: string): string {
  if (padName === 'plot_pad_0') {
    return 'Center Starter Plot';
  }
  const match = /^plot_pad_(\d+)$/.exec(padName);
  return match ? `Plot Pad ${match[1]}` : padName;
}

export function App() {
  const [activeTab, setActiveTab] = useState<DockTab>('care');
  const [selectedPad, setSelectedPad] = useState<string | null>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);

  const handleSceneReady = useCallback((manager: SceneManager | null) => {
    sceneManagerRef.current = manager;
  }, []);

  const handleResetView = useCallback(() => {
    sceneManagerRef.current?.resetCamera();
  }, []);

  return (
    <div className="app-shell">
      <CanvasViewport onPadSelect={setSelectedPad} onSceneReady={handleSceneReady} />

      <header className="top-hud" aria-label="Status bar">
        <div className="hud-pill hud-title">
          <span className="jelly-dot" aria-hidden="true" />
          <span>Jelly Bean Simulator</span>
        </div>
        <button
          type="button"
          className="hud-pill hud-action"
          onClick={handleResetView}
          aria-label="Reset camera view"
        >
          <span>Reset View</span>
        </button>
      </header>

      <div className="hud-spacer" aria-hidden="true" />

      {selectedPad && (
        <div className="selection-banner" role="status" aria-live="polite">
          <span className="hud-pill selection-pill">
            {formatPadLabel(selectedPad)} • Ready to build
          </span>
        </div>
      )}

      <nav className="bottom-dock" aria-label="Primary actions">
        <div className="dock-bar" role="tablist">
          {DOCK_TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`dock-button${isActive ? ' dock-button--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="dock-icon" aria-hidden="true">
                  {tab.badge}
                </span>
                <span className="dock-label">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
