import { useState } from 'react';
import { MobileShell } from './ui/MobileShell';

const DOCK_TABS = [
  { id: 'island', label: 'Island', icon: '🏝️' },
  { id: 'farm', label: 'Farm', icon: '🌱' },
  { id: 'village', label: 'Village', icon: '🏡' },
  { id: 'play', label: 'Play', icon: '🎮' },
  { id: 'bean', label: 'Bean', icon: '🫘' },
] as const;

type DockTabId = (typeof DOCK_TABS)[number]['id'];

export function App() {
  const [activeTab, setActiveTab] = useState<DockTabId>('island');

  const activeLabel = DOCK_TABS.find((t) => t.id === activeTab)?.label ?? 'Island';

  return (
    <MobileShell
      topHud={
        <div className="hud-preview" aria-label="Jelly Bean Overview">
          <span className="hud-preview__stage">Lv. 1 · Larva</span>
          <div className="hud-preview__currencies">
            <span>🪙 0</span>
            <span>💵 0</span>
          </div>
        </div>
      }
      viewport={
        <section className="starter-card" aria-label="Jelly Bean Simulator">
          <h1>Jelly Bean Simulator</h1>
          <p>
            The only game that truly, realistically simulates what it&apos;s like to be a Jelly Bean.
          </p>
          <span className="starter-card__tab-hint">{activeLabel} View</span>
        </section>
      }
      bottomDock={
        <div className="thumb-dock" role="tablist" aria-label="Primary Tabs">
          {DOCK_TABS.map((tab) => {
            const isSelected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-label={tab.label}
                className="thumb-dock__tab"
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="thumb-dock__icon" aria-hidden="true">
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      }
    />
  );
}

export default App;
