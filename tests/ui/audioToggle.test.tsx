import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createInitialState, getActiveBean } from '../../src/sim/engine';
import { AudioToggle } from '../../src/ui/AudioToggle';
import { TopHud } from '../../src/ui/TopHud';

describe('PR-07 AudioToggle & TopHud sound controls', () => {
  it('renders AudioToggle with accessible labels and visual state for enabled vs muted', () => {
    const enabledHtml = renderToStaticMarkup(
      createElement(AudioToggle, {
        enabled: true,
        onToggle: () => {},
      }),
    );

    expect(enabledHtml).toContain('aria-label="Mute sound"');
    expect(enabledHtml).toContain('aria-pressed="true"');
    expect(enabledHtml).toContain('audio-toggle--on');
    expect(enabledHtml).toContain('<svg');

    const mutedHtml = renderToStaticMarkup(
      createElement(AudioToggle, {
        enabled: false,
        onToggle: () => {},
      }),
    );

    expect(mutedHtml).toContain('aria-label="Unmute sound"');
    expect(mutedHtml).toContain('aria-pressed="false"');
    expect(mutedHtml).toContain('audio-toggle--muted');
  });

  it('integrates AudioToggle cleanly into TopHud when onToggleSound is supplied', () => {
    const state = createInitialState({ beanName: 'Mochi', parentTitle: 'Papa', onboarded: true });
    const bean = getActiveBean(state);

    const html = renderToStaticMarkup(
      createElement(TopHud, {
        bean,
        jellyCoins: 30,
        soundEnabled: false,
        onToggleSound: () => {},
        onResetView: () => {},
      }),
    );

    expect(html).toContain('aria-label="Unmute sound"');
    expect(html).toContain('aria-label="Reset camera view"');
    expect(html).toContain('Mochi');
  });
});
