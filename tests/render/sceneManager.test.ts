import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { findCanonicalPlotPad } from '../../src/render/SceneManager';

describe('findCanonicalPlotPad', () => {
  it('resolves multi-material glTF primitive child meshes to their canonical plot_pad_<n> parent', () => {
    const islandRoot = new THREE.Group();
    islandRoot.name = 'island_ring0';

    const padGroup = new THREE.Group();
    padGroup.name = 'plot_pad_0';

    const trimMesh = new THREE.Mesh();
    trimMesh.name = 'plot_pad_0_1';
    const soilMesh = new THREE.Mesh();
    soilMesh.name = 'plot_pad_0_2';

    padGroup.add(trimMesh, soilMesh);
    islandRoot.add(padGroup);

    expect(findCanonicalPlotPad(trimMesh)).toBe(padGroup);
    expect(findCanonicalPlotPad(soilMesh)).toBe(padGroup);
    expect(findCanonicalPlotPad(padGroup)).toBe(padGroup);
    expect(findCanonicalPlotPad(islandRoot)).toBeNull();
    expect(findCanonicalPlotPad(null)).toBeNull();
  });
});
