import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { AssetLoader } from '../../src/render/AssetLoader';
import { IslandView, resolveTileIdFromHit } from '../../src/render/IslandView';
import { createInitialState, dispatch, tick } from '../../src/sim/engine';

function createMockIslandModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'island_ring0';

  const coords: Array<[string, number, number]> = [
    ['plot_pad_0', 0, 0],
    ['plot_pad_1', 0, -2.45],
    ['plot_pad_2', 2.12, -1.22],
    ['plot_pad_3', 2.12, 1.22],
    ['plot_pad_4', 0, 2.45],
    ['plot_pad_5', -2.12, 1.22],
    ['plot_pad_6', -2.12, -1.22],
  ];

  for (const [name, x, z] of coords) {
    const pad = new THREE.Group();
    pad.name = name;
    pad.position.set(x, 0, z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 1));
    mesh.name = `${name}_1`;
    pad.add(mesh);
    root.add(pad);
  }

  return root;
}

function createFakeAssetLoader(): AssetLoader {
  return new AssetLoader({
    baseUrl: '/',
    loader: {
      async loadAsync(url: string): Promise<GLTF> {
        const scene = new THREE.Group();
        scene.name = url;
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.8));
        scene.add(body);

        if (url.includes('toilet')) {
          const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.05));
          door.name = 'ToiletDoor';
          scene.add(door);
        } else if (url.includes('hamburger_stand')) {
          const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5));
          sign.name = 'BurgerSign';
          sign.position.y = 1.2;
          scene.add(sign);
        }

        return { scene } as unknown as GLTF;
      },
    },
  });
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('PR-09 IslandView 3D building mounting, placement highlights & floating +JC popups', () => {
  it('registers all 7 Ring 0 plot pads and resolves tile IDs from both pads and mounted buildings', async () => {
    const loader = createFakeAssetLoader();
    const houseModel = await loader.loadModel('assets/models/starter_house.glb');
    const islandView = new IslandView({
      islandModel: createMockIslandModel(),
      assetLoader: loader,
      initialHouseModel: houseModel,
    });

    expect(islandView.getPlotPadIds()).toHaveLength(7);
    expect(islandView.getMountedBuildingTypes()).toEqual({ plot_pad_0: 'starter_house' });

    // Resolving a hit on a mounted building mesh maps cleanly back to its owning tileId
    const buildingTarget = islandView.getRaycastTargets().find((o) =>
      o.name.startsWith('Building_starter_house_'),
    );
    expect(buildingTarget).toBeDefined();
    expect(resolveTileIdFromHit(buildingTarget!.children[0] ?? null)).toBe('plot_pad_0');

    islandView.dispose();
  });

  it('mounts Toilet and Hamburger Stand models from GameState and highlights only empty pads in placement mode', async () => {
    const loader = createFakeAssetLoader();
    const houseModel = await loader.loadModel('assets/models/starter_house.glb');
    const islandView = new IslandView({
      islandModel: createMockIslandModel(),
      assetLoader: loader,
      initialHouseModel: houseModel,
    });

    let state = {
      ...createInitialState({ nowMs: 1_000, onboarded: true }),
      currencies: { jellyCoins: 300, beanBucks: 0, bonusBeans: 0 },
    };

    islandView.syncFromState(state);
    islandView.setPlacementMode('toilet');
    await flushPromises();

    // plot_pad_0 has Starter House -> pads 1..6 highlighted as valid build targets
    expect(islandView.getVisiblePlacementPadIds().sort()).toEqual([
      'plot_pad_1',
      'plot_pad_2',
      'plot_pad_3',
      'plot_pad_4',
      'plot_pad_5',
      'plot_pad_6',
    ]);

    // Build Toilet on plot_pad_1 and Hamburger Stand on plot_pad_3
    state = dispatch(
      state,
      { type: 'PLACE_BUILDING', buildingType: 'toilet', tileId: 'plot_pad_1' },
      2_000,
    ).state;
    state = dispatch(
      state,
      { type: 'PLACE_BUILDING', buildingType: 'hamburger_stand', tileId: 'plot_pad_3' },
      3_000,
    ).state;
    state = tick(state, 30, 33_000); // Accrue pending coins on Hamburger Stand

    islandView.syncFromState(state);
    await flushPromises();

    expect(islandView.getMountedBuildingTypes()).toEqual({
      plot_pad_0: 'starter_house',
      plot_pad_1: 'toilet',
      plot_pad_3: 'hamburger_stand',
    });

    // Occupied pads 1 and 3 are no longer highlighted for placement
    const remainingPads = islandView.getVisiblePlacementPadIds();
    expect(remainingPads).not.toContain('plot_pad_0');
    expect(remainingPads).not.toContain('plot_pad_1');
    expect(remainingPads).not.toContain('plot_pad_3');
    expect(remainingPads).toHaveLength(4);

    // Exiting placement mode hides all placement rings
    islandView.setPlacementMode(null);
    expect(islandView.getVisiblePlacementPadIds()).toHaveLength(0);

    // Triggering Toilet flush animation runs smoothly without throwing
    islandView.triggerToiletFlush('plot_pad_1');
    islandView.update(0.05);

    islandView.dispose();
  });

  it('spawns, projects, and expires floating +JC popups cleanly above buildings', async () => {
    const loader = createFakeAssetLoader();
    const islandView = new IslandView({
      islandModel: createMockIslandModel(),
      assetLoader: loader,
    });

    const camera = new THREE.PerspectiveCamera(42, 390 / 844, 0.2, 160);
    camera.position.set(0, 7, 11);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    islandView.spawnFloatingPopup('plot_pad_3', '+45 JC', 'coin');
    expect(islandView.getActivePopupCount()).toBe(1);

    islandView.update(0.2);
    const projected = islandView.projectFloatingPopups(camera, 390, 844);
    expect(projected).toHaveLength(1);
    expect(projected[0]?.text).toBe('+45 JC');
    expect(projected[0]?.visible).toBe(true);
    expect(projected[0]?.opacity).toBeGreaterThan(0);

    // Advance past popup duration (1.35s) in clamped 0.05s steps
    for (let i = 0; i < 35; i += 1) {
      islandView.update(0.05);
    }
    expect(islandView.getActivePopupCount()).toBe(0);

    islandView.dispose();
  });
});
