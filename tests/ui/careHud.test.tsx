import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createInitialState, getActiveBean } from '../../src/sim/engine';
import { BottomDock } from '../../src/ui/BottomDock';
import { OnboardingModal } from '../../src/ui/OnboardingModal';
import { TopHud } from '../../src/ui/TopHud';

describe('PR-06 Care HUD & Onboarding UI', () => {
  it('renders OnboardingModal with bean name input, Mama/Papa/Captain presets, and Blender larva icon', () => {
    const html = renderToStaticMarkup(
      createElement(OnboardingModal, {
        defaultBeanName: 'Jelly Bean',
        defaultParentTitle: 'Mama',
        onComplete: () => {},
      }),
    );

    expect(html).toContain('assets/icons/larva.png');
    expect(html).toContain('bean-name-input');
    expect(html).toContain('Mama');
    expect(html).toContain('Papa');
    expect(html).toContain('Captain');
    expect(html).toContain('Mama! Feed Jelly Bean!');
  });

  it('renders TopHud with bean name, level badge, XP bar, Jelly Coins, and all 5 needs gauges', () => {
    const state = createInitialState({ beanName: 'Mochi', parentTitle: 'Papa', onboarded: true });
    const bean = { ...getActiveBean(state), level: 3, xp: 24 };

    const html = renderToStaticMarkup(
      createElement(TopHud, {
        bean,
        jellyCoins: 42,
        onResetView: () => {},
      }),
    );

    expect(html).toContain('Mochi');
    expect(html).toContain('Lv.3');
    expect(html).toContain('42');
    expect(html).toContain('aria-label="Hunger"');
    expect(html).toContain('aria-label="Warmth"');
    expect(html).toContain('aria-label="Sleep"');
    expect(html).toContain('aria-label="Hygiene"');
    expect(html).toContain('aria-label="Mood"');
    expect(html).toContain('assets/icons/larva.png');
  });

  it('renders BottomDock with Blender PNG icons and switches Feed -> Buy Apple and Sleep -> Wake', () => {
    const state = createInitialState({ beanName: 'Mochi', onboarded: true });
    const awakeBean = getActiveBean(state);

    const awakeHtml = renderToStaticMarkup(
      createElement(BottomDock, {
        activeTab: 'care',
        bean: awakeBean,
        apples: 5,
        blankets: 0,
        jellyCoins: 25,
        onSelectTab: () => {},
        onFeedApple: () => {},
        onBuyApple: () => {},
        onToggleSleep: () => {},
        onWarmUp: () => {},
        onWash: () => {},
        onPet: () => {},
      }),
    );

    expect(awakeHtml).toContain('assets/icons/apple.png');
    expect(awakeHtml).toContain('assets/icons/bed.png');
    expect(awakeHtml).toContain('assets/icons/larva.png');
    expect(awakeHtml).toContain('×5');
    expect(awakeHtml).toContain('>Feed<');
    expect(awakeHtml).toContain('>Sleep<');

    const sleepingNoApplesHtml = renderToStaticMarkup(
      createElement(BottomDock, {
        activeTab: 'care',
        bean: { ...awakeBean, isSleeping: true },
        apples: 0,
        blankets: 1,
        jellyCoins: 10,
        onSelectTab: () => {},
        onFeedApple: () => {},
        onBuyApple: () => {},
        onToggleSleep: () => {},
        onWarmUp: () => {},
        onWash: () => {},
        onPet: () => {},
      }),
    );

    expect(sleepingNoApplesHtml).toContain('Buy Apple');
    expect(sleepingNoApplesHtml).toContain('5 JC');
    expect(sleepingNoApplesHtml).toContain('>Wake<');
    expect(sleepingNoApplesHtml).toContain('>Blanket<');
  });
});
