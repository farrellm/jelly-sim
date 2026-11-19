import { describe, expect, it } from 'vitest';
import { REVISION } from 'three';
import { resolveAssetUrl } from '../src/utils/assets';

describe('PR-01 scaffold smoke tests', () => {
  it('loads Three.js runtime metadata', () => {
    expect(Number(REVISION)).toBeGreaterThan(0);
  });

  it('resolves static asset URLs against configured GitHub Pages base path', () => {
    expect(resolveAssetUrl('assets/models/island_ring0.glb', '/jelly-sim/')).toBe(
      '/jelly-sim/assets/models/island_ring0.glb',
    );
    expect(resolveAssetUrl('/assets/icons/apple.png', '/jelly-sim')).toBe(
      '/jelly-sim/assets/icons/apple.png',
    );
    expect(resolveAssetUrl('assets/icons/apple.png', './')).toBe('./assets/icons/apple.png');
  });
});
