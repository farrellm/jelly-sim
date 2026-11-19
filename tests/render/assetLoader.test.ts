import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { AssetLoader, type GltfLoaderLike } from '../../src/render/AssetLoader';

function createFakeGltf(name = 'island_ring0'): GLTF {
  const scene = new THREE.Group();
  scene.name = name;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: '#79dc97' });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'plot_pad_0';
  scene.add(mesh);

  return {
    animations: [],
    scene,
    scenes: [scene],
    cameras: [],
    asset: { version: '2.0' },
    parser: {} as GLTF['parser'],
    userData: {},
  };
}

describe('AssetLoader', () => {
  it('resolves relative paths against baseUrl and caches repeated loads', async () => {
    const fakeGltf = createFakeGltf();
    const loadAsync = vi.fn(async () => fakeGltf);
    const loader: GltfLoaderLike = { loadAsync };

    const assets = new AssetLoader({ baseUrl: '/jelly-sim/', loader });

    const first = await assets.loadModel('assets/models/island_ring0.glb', {
      castShadow: true,
      receiveShadow: true,
    });
    const second = await assets.loadModel('assets/models/island_ring0.glb');

    expect(loadAsync).toHaveBeenCalledTimes(1);
    expect(loadAsync).toHaveBeenCalledWith('/jelly-sim/assets/models/island_ring0.glb');
    expect(assets.hasCached('assets/models/island_ring0.glb')).toBe(true);
    expect(assets.cacheSize).toBe(1);

    // Returns distinct scene-graph clones
    expect(first).not.toBe(second);
    expect(first).not.toBe(fakeGltf.scene);
    first.position.set(10, 0, 0);
    expect(second.position.x).toBe(0);

    // Shadow flags applied only to requested clone, not cached template
    const firstMesh = first.getObjectByName('plot_pad_0') as THREE.Mesh;
    const secondMesh = second.getObjectByName('plot_pad_0') as THREE.Mesh;
    expect(firstMesh.castShadow).toBe(true);
    expect(firstMesh.receiveShadow).toBe(true);
    expect(secondMesh.castShadow).toBe(false);
    expect(secondMesh.receiveShadow).toBe(false);
  });

  it('deduplicates concurrent in-flight requests for the same asset', async () => {
    const fakeGltf = createFakeGltf();
    let resolveLoad!: (gltf: GLTF) => void;
    const loadAsync = vi.fn(
      () =>
        new Promise<GLTF>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const assets = new AssetLoader({ baseUrl: '/jelly-sim/', loader: { loadAsync } });

    const p1 = assets.loadModel('assets/models/island_ring0.glb');
    const p2 = assets.loadModel('assets/models/island_ring0.glb');
    expect(loadAsync).toHaveBeenCalledTimes(1);

    resolveLoad(fakeGltf);
    const [m1, m2] = await Promise.all([p1, p2]);
    expect(m1).not.toBe(m2);
    expect(assets.cacheSize).toBe(1);
  });

  it('evicts failed loads so subsequent retries can succeed', async () => {
    const fakeGltf = createFakeGltf();
    const loadAsync = vi
      .fn<GltfLoaderLike['loadAsync']>()
      .mockRejectedValueOnce(new Error('network hiccup'))
      .mockResolvedValueOnce(fakeGltf);

    const assets = new AssetLoader({ baseUrl: '/', loader: { loadAsync } });

    await expect(assets.loadModel('assets/models/island_ring0.glb')).rejects.toThrow(
      'network hiccup',
    );
    expect(assets.hasCached('assets/models/island_ring0.glb')).toBe(false);

    const recovered = await assets.loadModel('assets/models/island_ring0.glb');
    expect(recovered.name).toBe('island_ring0');
    expect(loadAsync).toHaveBeenCalledTimes(2);
  });

  it('disposes cached geometries and materials on clearCache', async () => {
    const fakeGltf = createFakeGltf();
    const mesh = fakeGltf.scene.getObjectByName('plot_pad_0') as THREE.Mesh;
    const geoDispose = vi.spyOn(mesh.geometry, 'dispose');
    const matDispose = vi.spyOn(mesh.material as THREE.Material, 'dispose');

    const assets = new AssetLoader({
      baseUrl: '/jelly-sim/',
      loader: { loadAsync: async () => fakeGltf },
    });

    await assets.loadModel('assets/models/island_ring0.glb');
    expect(assets.cacheSize).toBe(1);

    assets.clearCache();
    expect(assets.cacheSize).toBe(0);
    expect(geoDispose).toHaveBeenCalledTimes(1);
    expect(matDispose).toHaveBeenCalledTimes(1);
  });
});
