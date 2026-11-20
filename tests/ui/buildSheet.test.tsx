import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createInitialState, dispatch, getActiveBean } from '../../src/sim/engine';
import { BottomDock } from '../../src/ui/BottomDock';
import { BuildSheet } from '../../src/ui/BuildSheet';
import { TopHud } from '../../src/ui/TopHud';

describe('PR-09 Dual Economy HUD & BuildSheet Catalog UI', () => {
  it('renders TopHud with both Jelly Coins and Bean Bucks using Blender PNG icons', () => {
    const state = createInitialState({ beanName: 'Mochi', onboarded: true });
    const html = renderToStaticMarkup(
      createElement(TopHud, {
        bean: getActiveBean(state),
        jellyCoins: 145,
        beanBucks: 14,
        onResetView: () => {},
      }),
    );

    expect(html).toContain('assets/icons/jelly_coin.png');
    expect(html).toContain('assets/icons/bean_buck.png');
    expect(html).toContain('aria-label="145 Jelly Coins"');
    expect(html).toContain('aria-label="14 Bean Bucks"');
  });

  it('renders BuildSheet showing Jelly Coin vs. Bean Buck costs, built badges, and placement banner', () => {
    const funded = {
      ...createInitialState({ onboarded: true }),
      currencies: { jellyCoins: 200, beanBucks: 14, bonusBeans: 0 },
    };

    const catalogHtml = renderToStaticMarkup(
      createElement(BuildSheet, {
        state: funded,
        selectedPad: 'plot_pad_2',
        placementBuilding: null,
        onStartPlacement: () => {},
        onBuildOnSelectedPad: () => {},
        onCancelPlacement: () => {},
        onUpgradeHouse: () => {},
      }),
    );

    expect(catalogHtml).toContain('Village Build');
    expect(catalogHtml).toContain('assets/icons/toilet.png');
    expect(catalogHtml).toContain('assets/icons/hamburger_stand.png');
    expect(catalogHtml).toContain('60 JC');
    expect(catalogHtml).toContain('140 JC');
    expect(catalogHtml).toContain('14 BB');
    expect(catalogHtml).toContain('20 BB');
    expect(catalogHtml).toContain('Build (Pad 2)');
    expect(catalogHtml).toContain('House Tier 2: Cozy Cottage');

    // After building Toilet, catalog marks it Built ✓
    const withToilet = dispatch(
      funded,
      { type: 'PLACE_BUILDING', buildingType: 'toilet', tileId: 'plot_pad_2' },
      2_000,
    ).state;
    const builtHtml = renderToStaticMarkup(
      createElement(BuildSheet, {
        state: withToilet,
        selectedPad: null,
        placementBuilding: null,
        onStartPlacement: () => {},
        onBuildOnSelectedPad: () => {},
        onCancelPlacement: () => {},
        onUpgradeHouse: () => {},
      }),
    );
    expect(builtHtml).toContain('Built ✓');

    // Active placement mode collapses catalog into a clean tap-a-pad banner
    const placementHtml = renderToStaticMarkup(
      createElement(BuildSheet, {
        state: funded,
        selectedPad: null,
        placementBuilding: 'hamburger_stand',
        onStartPlacement: () => {},
        onBuildOnSelectedPad: () => {},
        onCancelPlacement: () => {},
        onUpgradeHouse: () => {},
      }),
    );
    expect(placementHtml).toContain('Place Hamburger Stand');
    expect(placementHtml).toContain('Tap any glowing green plot pad');
    expect(placementHtml).toContain('Cancel');
  });

  it('upgrades BottomDock Hygiene button from Wash to Toilet when Toilet is built', () => {
    const state = createInitialState({ onboarded: true });
    const bean = getActiveBean(state);

    const withToiletHtml = renderToStaticMarkup(
      createElement(BottomDock, {
        activeTab: 'care',
        bean,
        apples: 5,
        blankets: 0,
        jellyCoins: 60,
        hasToilet: true,
        onSelectTab: () => {},
        onFeedApple: () => {},
        onBuyApple: () => {},
        onToggleSleep: () => {},
        onWarmUp: () => {},
        onWash: () => {},
        onUseToilet: () => {},
        onPet: () => {},
      }),
    );

    expect(withToiletHtml).toContain('assets/icons/toilet.png');
    expect(withToiletHtml).toContain('>Toilet<');
    expect(withToiletHtml).toContain('+5 JC');
  });
});
