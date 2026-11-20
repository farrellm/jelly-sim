import type { ReactNode } from 'react';
import { CARE_ACTIONS, LOW_NEED_THRESHOLD } from '../sim/constants';
import type { JellyBeanEntity } from '../sim/types';
import { resolveAssetUrl } from '../utils/assets';

export type DockTab = 'care' | 'farm' | 'build' | 'play' | 'village';

export interface BottomDockProps {
  activeTab: DockTab;
  bean: JellyBeanEntity;
  apples: number;
  blankets: number;
  jellyCoins: number;
  hasToilet?: boolean;
  buildSheet?: ReactNode;
  onSelectTab: (tab: DockTab) => void;
  onFeedApple: () => void;
  onBuyApple: () => void;
  onToggleSleep: () => void;
  onWarmUp: () => void;
  onWash: () => void;
  onUseToilet?: () => void;
  onPet: () => void;
}

const DOCK_TABS: ReadonlyArray<{
  id: DockTab;
  label: string;
  badge: string;
  iconPath?: string;
}> = [
  { id: 'care', label: 'Care', badge: '🍎', iconPath: 'assets/icons/apple.png' },
  { id: 'farm', label: 'Farm', badge: '🌱' },
  { id: 'build', label: 'Build', badge: '🏠' },
  { id: 'play', label: 'Play', badge: '🍬' },
  { id: 'village', label: 'Village', badge: '🏝️' },
];

const UPCOMING_TAB_COPY: Record<Exclude<DockTab, 'care'>, string> = {
  farm: 'Garden plots & Cozy Rain farming unlock next in your adventure!',
  build: 'Build a Toilet & Hamburger Stand with Dr. Bubblegum soon!',
  play: 'Gumdrop Challenge & Candy Castle mini-games unlock soon!',
  village: 'Grow your Larva & welcome more Jelly Beans to the island soon!',
};

export function BottomDock({
  activeTab,
  bean,
  apples,
  blankets,
  jellyCoins,
  hasToilet = false,
  buildSheet,
  onSelectTab,
  onFeedApple,
  onBuyApple,
  onToggleSleep,
  onWarmUp,
  onWash,
  onUseToilet,
  onPet,
}: BottomDockProps) {
  const outOfApples = apples <= 0;
  const canAffordApple = jellyCoins >= CARE_ACTIONS.appleShopCost;
  const hungryUrgent = bean.needs.hunger < LOW_NEED_THRESHOLD;
  const sleepyUrgent = !bean.isSleeping && bean.needs.sleep < LOW_NEED_THRESHOLD;
  const coldUrgent = bean.needs.warmth < LOW_NEED_THRESHOLD;
  const dirtyUrgent = bean.needs.hygiene < LOW_NEED_THRESHOLD;

  const handlePrimaryFeed = () => {
    if (outOfApples) {
      onBuyApple();
    } else {
      onFeedApple();
    }
  };

  return (
    <div className="bottom-dock-stack">
      {activeTab === 'care' ? (
        <div className="care-action-strip" role="group" aria-label="Care actions">
          <button
            type="button"
            className={`care-button${hungryUrgent ? ' care-button--urgent' : ''}${
              outOfApples ? ' care-button--shop' : ''
            }`}
            disabled={outOfApples && !canAffordApple}
            onClick={handlePrimaryFeed}
            aria-label={
              outOfApples
                ? `Buy an apple for ${CARE_ACTIONS.appleShopCost} Jelly Coins`
                : `Feed apple (${apples} left)`
            }
          >
            <span className="care-badge">
              {outOfApples ? `${CARE_ACTIONS.appleShopCost} JC` : `×${apples}`}
            </span>
            <img
              src={resolveAssetUrl('assets/icons/apple.png')}
              alt=""
              aria-hidden="true"
              className="care-icon-img"
              width={32}
              height={32}
            />
            <span className="care-label">{outOfApples ? 'Buy Apple' : 'Feed'}</span>
          </button>

          <button
            type="button"
            className={`care-button${bean.isSleeping ? ' care-button--active-sleep' : ''}${
              sleepyUrgent ? ' care-button--urgent' : ''
            }`}
            onClick={onToggleSleep}
            aria-pressed={bean.isSleeping}
            aria-label={bean.isSleeping ? 'Wake up Jelly Bean' : 'Tuck Jelly Bean into bed'}
          >
            <img
              src={resolveAssetUrl('assets/icons/bed.png')}
              alt=""
              aria-hidden="true"
              className="care-icon-img"
              width={32}
              height={32}
            />
            <span className="care-label">{bean.isSleeping ? 'Wake' : 'Sleep'}</span>
          </button>

          <button
            type="button"
            className={`care-button${coldUrgent ? ' care-button--urgent' : ''}`}
            onClick={onWarmUp}
            aria-label={blankets > 0 ? `Wrap in knitted blanket (${blankets} left)` : 'Warm by hearth'}
          >
            {blankets > 0 && <span className="care-badge">×{blankets}</span>}
            <span className="care-emoji" aria-hidden="true">
              {blankets > 0 ? '🧣' : '🔥'}
            </span>
            <span className="care-label">{blankets > 0 ? 'Blanket' : 'Warm'}</span>
          </button>

          <button
            type="button"
            className={`care-button${dirtyUrgent ? ' care-button--urgent' : ''}${
              hasToilet ? ' care-button--toilet' : ''
            }`}
            onClick={hasToilet && onUseToilet ? onUseToilet : onWash}
            aria-label={hasToilet ? 'Use Toilet (+100% Hygiene, +5 JC)' : 'Give sponge bath'}
          >
            {hasToilet && <span className="care-badge">+5 JC</span>}
            {hasToilet ? (
              <img
                src={resolveAssetUrl('assets/icons/toilet.png')}
                alt=""
                aria-hidden="true"
                className="care-icon-img"
                width={32}
                height={32}
              />
            ) : (
              <span className="care-emoji" aria-hidden="true">
                🫧
              </span>
            )}
            <span className="care-label">{hasToilet ? 'Toilet' : 'Wash'}</span>
          </button>

          <button
            type="button"
            className="care-button"
            onClick={onPet}
            aria-label={`Pet ${bean.name}`}
          >
            <img
              src={resolveAssetUrl('assets/icons/larva.png')}
              alt=""
              aria-hidden="true"
              className="care-icon-img"
              width={32}
              height={32}
            />
            <span className="care-label">Pet</span>
          </button>
        </div>
      ) : activeTab === 'build' && buildSheet ? (
        buildSheet
      ) : (
        <div className="tab-preview-card" role="status" aria-live="polite">
          <span>{UPCOMING_TAB_COPY[activeTab]}</span>
        </div>
      )}

      <nav className="bottom-dock" aria-label="Primary navigation">
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
                onClick={() => onSelectTab(tab.id)}
              >
                {tab.iconPath ? (
                  <img
                    src={resolveAssetUrl(tab.iconPath)}
                    alt=""
                    aria-hidden="true"
                    className="dock-icon-img"
                    width={24}
                    height={24}
                  />
                ) : (
                  <span className="dock-icon" aria-hidden="true">
                    {tab.badge}
                  </span>
                )}
                <span className="dock-label">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
