import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { MobileShell } from '../../src/ui/MobileShell';

afterEach(() => {
  cleanup();
});

describe('MobileShell', () => {
  it('renders topHud, viewport, bottomDock, and optional overlay slots', () => {
    render(
      createElement(MobileShell, {
        topHud: createElement('div', null, 'HUD Slot'),
        viewport: createElement('div', null, 'Viewport Slot'),
        bottomDock: createElement('div', null, 'Dock Slot'),
        overlay: createElement('div', null, 'Overlay Slot'),
      }),
    );

    expect(screen.getByText('HUD Slot')).toBeTruthy();
    expect(screen.getByText('Viewport Slot')).toBeTruthy();
    expect(screen.getByText('Dock Slot')).toBeTruthy();
    expect(screen.getByText('Overlay Slot')).toBeTruthy();
  });

  it('omits the overlay layer when overlay prop is not provided', () => {
    const { container } = render(
      createElement(MobileShell, {
        topHud: createElement('div', null, 'HUD'),
        viewport: createElement('div', null, 'Viewport'),
        bottomDock: createElement('div', null, 'Dock'),
      }),
    );

    expect(container.querySelector('.mobile-shell__overlay')).toBeNull();
  });

  it('switches between the 5 thumb-dock tabs in App', () => {
    render(createElement(App));

    const tabNames = ['Island', 'Farm', 'Village', 'Play', 'Bean'];
    for (const name of tabNames) {
      expect(screen.getByRole('tab', { name })).toBeTruthy();
    }

    const islandTab = screen.getByRole('tab', { name: 'Island' });
    expect(islandTab.getAttribute('aria-selected')).toBe('true');

    const farmTab = screen.getByRole('tab', { name: 'Farm' });
    fireEvent.click(farmTab);
    expect(farmTab.getAttribute('aria-selected')).toBe('true');
    expect(islandTab.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByText('Farm View')).toBeTruthy();
  });
});
