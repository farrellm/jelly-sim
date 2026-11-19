import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BeanView,
  LARVA_BED_POSITION,
  LARVA_HOME_POSITION,
} from '../../src/render/BeanView';
import { createInitialState, getActiveBean } from '../../src/sim/engine';

function createMockLarvaModel(): {
  root: THREE.Group;
  body: THREE.Mesh;
  eyes: THREE.Group;
  brows: THREE.Group;
  browL: THREE.Mesh;
  browR: THREE.Mesh;
  mouth: THREE.Mesh;
  hatSocket: THREE.Object3D;
} {
  const root = new THREE.Group();
  root.name = 'jellybean_larva';

  const bodyMat = new THREE.MeshStandardMaterial({ color: '#ff476f' });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), bodyMat);
  body.name = 'Body';

  const eyes = new THREE.Group();
  eyes.name = 'Eyes';
  eyes.position.set(0, 0.3, 0.22);

  const brows = new THREE.Group();
  brows.name = 'Brows';
  brows.position.set(0, 0.4, 0.22);

  const browMat = new THREE.MeshStandardMaterial({ color: '#3a243b' });
  const browL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), browMat);
  browL.name = 'Brow_L';
  browL.position.set(-0.1, 0, 0);

  const browR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), browMat);
  browR.name = 'Brow_R';
  browR.position.set(0.1, 0, 0);
  brows.add(browL, browR);

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.02), browMat);
  mouth.name = 'Mouth';
  mouth.position.set(0, 0.2, 0.23);

  const hatSocket = new THREE.Object3D();
  hatSocket.name = 'HatSocket';
  hatSocket.position.set(0, 0.56, 0.02);

  root.add(body, eyes, brows, mouth, hatSocket);
  return { root, body, eyes, brows, browL, browR, mouth, hatSocket };
}

function createMockApple(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'apple';
  group.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4)));
  return group;
}

describe('BeanView', () => {
  it('runs idle jelly bounce with volume-preserving squash-and-stretch', () => {
    const mock = createMockLarvaModel();
    const view = new BeanView({
      larvaModel: mock.root,
      appleTemplate: createMockApple(),
    });

    const bean = getActiveBean(createInitialState());
    view.syncState(bean, 'regular');
    view.update(0.05);
    view.update(0.05);

    const rig = view.getLarvaRig();
    expect(rig.position.x).toBeCloseTo(LARVA_HOME_POSITION.x, 3);
    expect(rig.position.z).toBeCloseTo(LARVA_HOME_POSITION.z, 3);
    // Volume preservation: scale.x * scale.z * scale.y ~= baseScale^3
    const baseCube = Math.pow(1.38, 3);
    expect(rig.scale.x * rig.scale.y * rig.scale.z).toBeCloseTo(baseCube, 2);

    view.dispose();
  });

  it('tosses a 3D apple in an arc and enters squash-and-stretch eat chomp on impact', () => {
    const mock = createMockLarvaModel();
    const view = new BeanView({
      larvaModel: mock.root,
      appleTemplate: createMockApple(),
    });

    view.triggerFeedApple();
    expect(view.getActiveAppleCount()).toBe(1);
    expect(view.isEating()).toBe(true);

    // Mid-flight: apple still active
    view.update(0.04);
    view.update(0.04);
    expect(view.getActiveAppleCount()).toBe(1);

    // Advance past 0.42s toss duration -> apple consumed, chomp animation active
    for (let i = 0; i < 10; i += 1) {
      view.update(0.04);
    }
    expect(view.getActiveAppleCount()).toBe(0);
    expect(view.isEating()).toBe(true);
    expect(mock.mouth.scale.y).toBeGreaterThan(1.0);

    // Advance past chomp duration -> returns to idle
    for (let i = 0; i < 20; i += 1) {
      view.update(0.04);
    }
    expect(view.isEating()).toBe(false);

    view.dispose();
  });

  it('moves Larva onto the cozy bed and closes eyes when sleeping', () => {
    const mock = createMockLarvaModel();
    const view = new BeanView({
      larvaModel: mock.root,
      appleTemplate: createMockApple(),
    });

    const state = createInitialState();
    const sleepingBean = { ...getActiveBean(state), isSleeping: true };
    view.syncState(sleepingBean, 'regular');

    // Advance ~1s so sleep transition completes
    for (let i = 0; i < 25; i += 1) {
      view.update(0.04);
    }

    const rig = view.getLarvaRig();
    expect(rig.position.x).toBeCloseTo(LARVA_BED_POSITION.x, 2);
    expect(rig.position.y).toBeCloseTo(LARVA_BED_POSITION.y, 2);
    expect(rig.position.z).toBeCloseTo(LARVA_BED_POSITION.z, 2);
    expect(mock.eyes.scale.y).toBeLessThan(0.2);

    view.dispose();
  });

  it('applies shivering cold pose, sleepy droopy eyes, and angry furrowed brows', () => {
    const mock = createMockLarvaModel();
    const view = new BeanView({
      larvaModel: mock.root,
      appleTemplate: createMockApple(),
    });

    const baseBean = getActiveBean(createInitialState());

    // Cold pose: worried brow tilts + cool body tint
    view.syncState(
      { ...baseBean, needs: { ...baseBean.needs, warmth: 15 } },
      'regular',
    );
    view.update(0.03);
    expect(mock.browL.rotation.z).toBeGreaterThan(0.1);
    expect(mock.browR.rotation.z).toBeLessThan(-0.1);
    const bodyMat = mock.body.material as THREE.MeshStandardMaterial;
    expect(bodyMat.color.b).toBeGreaterThan(0.25);

    // Sleepy (awake) pose: half-closed eyes
    view.syncState(
      { ...baseBean, needs: { ...baseBean.needs, sleep: 20 } },
      'regular',
    );
    view.update(0.03);
    expect(mock.eyes.scale.y).toBeCloseTo(0.52, 2);

    // Angry pose: furrowed inward brows
    view.syncState({ ...baseBean, anger: 70 }, 'regular');
    view.update(0.03);
    expect(mock.browL.rotation.z).toBeLessThan(-0.2);
    expect(mock.browR.rotation.z).toBeGreaterThan(0.2);

    view.dispose();
  });

  it('projects speech bubble anchor into clamped 2D iPhone viewport coordinates', () => {
    const mock = createMockLarvaModel();
    const view = new BeanView({
      larvaModel: mock.root,
      appleTemplate: createMockApple(),
    });

    const camera = new THREE.PerspectiveCamera(42, 390 / 844, 0.2, 160);
    camera.position.set(6, 7, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    view.update(0.016);
    const pos = view.projectSpeechBubble(camera, 390, 844);

    expect(pos.visible).toBe(true);
    expect(pos.x).toBeGreaterThanOrEqual(80);
    expect(pos.x).toBeLessThanOrEqual(310);
    expect(pos.y).toBeGreaterThanOrEqual(100);
    expect(pos.y).toBeLessThanOrEqual(700);

    view.dispose();
  });
});
