import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';

describe('Jelly Bean Simulator smoke test', () => {
  it('mounts the root App in a jsdom environment', () => {
    render(createElement(App));

    expect(
      screen.getByRole('heading', { name: /Jelly Bean Simulator/i }),
    ).toBeTruthy();
    expect(
      screen.getByText(/truly, realistically simulates what it's like to be a Jelly Bean/i),
    ).toBeTruthy();
  });
});
