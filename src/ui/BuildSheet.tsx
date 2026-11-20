import type { BuildingType, GameState } from '../sim/types';
import {
  BUILDING_CATALOG,
  canAfford,
  countBuildings,
  findBuildingTiles,
  getEmptyBuildTileIds,
  getHouseUpgradeTier,
  type BuildingDefinition,
} from '../sim/village';
import { resolveAssetUrl } from '../utils/assets';

export interface BuildSheetProps {
  state: GameState;
  selectedPad: string | null;
  placementBuilding: BuildingType | null;
  onStartPlacement: (buildingType: BuildingType) => void;
  onBuildOnSelectedPad: (buildingType: BuildingType, tileId: string) => void;
  onCancelPlacement: () => void;
  onUpgradeHouse: () => void;
  onClose?: () => void;
}

const FALLBACK_BUILDING_EMOJI: Record<BuildingType, string> = {
  starter_house: '🏠',
  toilet: '🚽',
  garden_plot: '🌱',
  hamburger_stand: '🍔',
  quiet_space_corner: '🌴',
  kitchen_annex: '🍳',
  feather_loom: '🧶',
  jelly_college: '🎓',
  villager_cottage: '🏡',
  blacksmith_forge: '⚒️',
  apple_tree: '🌳',
};

function formatPadShort(padId: string): string {
  const match = /^plot_pad_(\d+)$/.exec(padId);
  return match ? `Pad ${match[1]}` : padId;
}

function renderCostBadges(costJellyCoins: number, costBeanBucks: number) {
  return (
    <span className="build-cost-group">
      {costJellyCoins > 0 && (
        <span className="build-cost-tag build-cost-tag--jc" aria-label={`${costJellyCoins} Jelly Coins`}>
          <img
            src={resolveAssetUrl('assets/icons/jelly_coin.png')}
            alt=""
            aria-hidden="true"
            className="cost-mini-icon"
            width={16}
            height={16}
          />
          <span>{costJellyCoins} JC</span>
        </span>
      )}
      {costBeanBucks > 0 && (
        <span className="build-cost-tag build-cost-tag--bb" aria-label={`${costBeanBucks} Bean Bucks`}>
          <img
            src={resolveAssetUrl('assets/icons/bean_buck.png')}
            alt=""
            aria-hidden="true"
            className="cost-mini-icon"
            width={16}
            height={16}
          />
          <span>{costBeanBucks} BB</span>
        </span>
      )}
    </span>
  );
}

/**
 * iPhone bottom-sheet Build catalog showing Jelly Coin vs. Bean Buck costs,
 * Starter House upgrades, and one-thumb plot placement mode.
 */
export function BuildSheet({
  state,
  selectedPad,
  placementBuilding,
  onStartPlacement,
  onBuildOnSelectedPad,
  onCancelPlacement,
  onUpgradeHouse,
  onClose,
}: BuildSheetProps) {
  const emptyTiles = getEmptyBuildTileIds(state);
  const selectedIsValidEmpty = selectedPad !== null && emptyTiles.includes(selectedPad);

  const houseTile = findBuildingTiles(state, 'starter_house')[0];
  const houseTier = houseTile?.buildingTier ?? 1;
  const nextHouseUpgrade = getHouseUpgradeTier(houseTier);
  const canAffordHouseUpgrade =
    nextHouseUpgrade !== null &&
    canAfford(state, nextHouseUpgrade.costJellyCoins, nextHouseUpgrade.costBeanBucks);

  // Compact banner while actively tapping a glowing 3D plot pad so the island stays clear
  if (placementBuilding) {
    const activeDef = BUILDING_CATALOG.find((item) => item.type === placementBuilding);
    return (
      <section className="placement-banner-card" aria-label="Placement mode">
        <div className="placement-banner-info">
          {activeDef?.iconPath ? (
            <img
              src={resolveAssetUrl(activeDef.iconPath)}
              alt=""
              aria-hidden="true"
              className="placement-banner-icon"
              width={36}
              height={36}
            />
          ) : (
            <span className="placement-banner-emoji" aria-hidden="true">
              {FALLBACK_BUILDING_EMOJI[placementBuilding]}
            </span>
          )}
          <div className="placement-banner-copy">
            <strong>Place {activeDef?.name ?? placementBuilding}</strong>
            <span>Tap any glowing green plot pad on the island!</span>
          </div>
        </div>
        <button
          type="button"
          className="placement-cancel-btn"
          onClick={onCancelPlacement}
          aria-label="Cancel placement"
        >
          Cancel
        </button>
      </section>
    );
  }

  const handleBuildingAction = (def: BuildingDefinition) => {
    if (selectedIsValidEmpty && selectedPad) {
      onBuildOnSelectedPad(def.type, selectedPad);
    } else {
      onStartPlacement(def.type);
    }
  };

  return (
    <section className="build-sheet" aria-label="Build catalog">
      <div className="build-sheet-handle" aria-hidden="true" />
      <header className="build-sheet-header">
        <div className="build-sheet-title-wrap">
          <h2 className="build-sheet-title">Village Build</h2>
          <span className="build-sheet-sub">
            {selectedIsValidEmpty && selectedPad
              ? `Building on ${formatPadShort(selectedPad)}`
              : `${emptyTiles.length} open Ring ${state.island.unlockedRing} plots`}
          </span>
        </div>

        <div className="build-sheet-balances">
          <span className="sheet-balance-pill sheet-balance-pill--jc" aria-label={`${state.currencies.jellyCoins} Jelly Coins`}>
            <img
              src={resolveAssetUrl('assets/icons/jelly_coin.png')}
              alt=""
              aria-hidden="true"
              className="cost-mini-icon"
              width={16}
              height={16}
            />
            <span>{state.currencies.jellyCoins}</span>
          </span>
          <span className="sheet-balance-pill sheet-balance-pill--bb" aria-label={`${state.currencies.beanBucks} Bean Bucks`}>
            <img
              src={resolveAssetUrl('assets/icons/bean_buck.png')}
              alt=""
              aria-hidden="true"
              className="cost-mini-icon"
              width={16}
              height={16}
            />
            <span>{state.currencies.beanBucks}</span>
          </span>
          {onClose && (
            <button
              type="button"
              className="build-sheet-close"
              onClick={onClose}
              aria-label="Close build catalog"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      <div className="build-sheet-list" role="list">
        {BUILDING_CATALOG.map((def) => {
          const builtCount = countBuildings(state, def.type);
          const isMaxed = builtCount >= def.maxCount;
          const ringLocked = def.requiredRing > state.island.unlockedRing;
          const affordable = canAfford(state, def.costJellyCoins, def.costBeanBucks);
          const canPlaceNow =
            def.buildable && !ringLocked && !isMaxed && affordable && emptyTiles.length > 0;

          let actionLabel = selectedIsValidEmpty && selectedPad ? `Build (${formatPadShort(selectedPad)})` : 'Place';
          if (isMaxed) {
            actionLabel = 'Built ✓';
          } else if (!def.buildable || ringLocked) {
            actionLabel = def.unlockHint ?? `Ring ${def.requiredRing}`;
          } else if (emptyTiles.length === 0) {
            actionLabel = 'Island Full';
          } else if (!affordable) {
            actionLabel = def.costBeanBucks > state.currencies.beanBucks ? 'Need BB' : 'Need JC';
          }

          return (
            <article
              key={def.type}
              role="listitem"
              className={`build-card${!def.buildable || ringLocked ? ' build-card--locked' : ''}${
                isMaxed ? ' build-card--built' : ''
              }`}
            >
              <div className="build-card-art">
                {def.iconPath ? (
                  <img
                    src={resolveAssetUrl(def.iconPath)}
                    alt=""
                    aria-hidden="true"
                    className="build-card-icon"
                    width={46}
                    height={46}
                  />
                ) : (
                  <span className="build-card-emoji" aria-hidden="true">
                    {FALLBACK_BUILDING_EMOJI[def.type]}
                  </span>
                )}
              </div>

              <div className="build-card-body">
                <div className="build-card-head">
                  <strong className="build-card-name">{def.name}</strong>
                  {renderCostBadges(def.costJellyCoins, def.costBeanBucks)}
                </div>
                <p className="build-card-desc">{def.shortDesc}</p>
              </div>

              <button
                type="button"
                className={`build-action-btn${isMaxed ? ' build-action-btn--done' : ''}${
                  !def.buildable || ringLocked ? ' build-action-btn--locked' : ''
                }`}
                disabled={!canPlaceNow}
                onClick={() => handleBuildingAction(def)}
                aria-label={`${actionLabel} ${def.name}`}
              >
                {actionLabel}
              </button>
            </article>
          );
        })}

        {/* Starter House Tier Upgrade Card */}
        <article
          role="listitem"
          className={`build-card${!nextHouseUpgrade ? ' build-card--built' : ''}`}
        >
          <div className="build-card-art">
            <span className="build-card-emoji" aria-hidden="true">
              🏠
            </span>
          </div>
          <div className="build-card-body">
            <div className="build-card-head">
              <strong className="build-card-name">
                {nextHouseUpgrade
                  ? `House Tier ${nextHouseUpgrade.tier}: ${nextHouseUpgrade.name}`
                  : 'Starter House (Max Tier)'}
              </strong>
              {nextHouseUpgrade &&
                renderCostBadges(nextHouseUpgrade.costJellyCoins, nextHouseUpgrade.costBeanBucks)}
            </div>
            <p className="build-card-desc">
              {nextHouseUpgrade
                ? `Upgrade from Tier ${houseTier} for +${nextHouseUpgrade.hearthWarmthBonus} Hearth Warmth & grander cottage!`
                : 'Your Gingerbread Manor is fully upgraded!'}
            </p>
          </div>
          <button
            type="button"
            className={`build-action-btn${!nextHouseUpgrade ? ' build-action-btn--done' : ''}`}
            disabled={!canAffordHouseUpgrade}
            onClick={onUpgradeHouse}
            aria-label={
              nextHouseUpgrade
                ? `Upgrade Starter House to Tier ${nextHouseUpgrade.tier}`
                : 'Starter House max tier reached'
            }
          >
            {!nextHouseUpgrade ? 'Max ✓' : canAffordHouseUpgrade ? 'Upgrade' : 'Need JC'}
          </button>
        </article>
      </div>
    </section>
  );
}
