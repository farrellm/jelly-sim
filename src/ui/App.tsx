import { useState } from 'react';
import { REVISION } from 'three';

type DockTab = 'care' | 'farm' | 'build' | 'play' | 'village';

const DOCK_TABS: ReadonlyArray<{ id: DockTab; label: string; badge: string }> = [
  { id: 'care', label: 'Care', badge: '🍎' },
  { id: 'farm', label: 'Farm', badge: '🌱' },
  { id: 'build', label: 'Build', badge: '🏠' },
  { id: 'play', label: 'Play', badge: '🍬' },
  { id: 'village', label: 'Village', badge: '🏝️' },
];

export function App() {
  const [activeTab, setActiveTab] = useState<DockTab>('care');

  return (
    <div className="app-shell">
      <header className="top-hud" aria-label="Status bar">
        <div className="hud-pill hud-title">
          <span className="jelly-dot" aria-hidden="true" />
          <span>Jelly Bean Simulator</span>
        </div>
        <div className="hud-pill hud-meta">
          <span>Three r{REVISION}</span>
        </div>
      </header>

      <main className="diorama-stage" aria-label="Island diorama viewport">
        <div className="stage-card">
          <p className="stage-eyebrow">Starter Island Plot</p>
          <h1 className="stage-heading">Dr. Bubblegum&apos;s Plot Awaits</h1>
          <p className="stage-copy">
            3D candy-diorama scene mounting in PR-03. Active thumb-zone tab:{' '}
            <strong>{activeTab}</strong>.
          </p>
        </div>
      </main>

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
