import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  DR_BUBBLEGUM_DOORSTEP_POSITION,
  NpcView,
} from '../../src/render/NpcView';

function createMockDrBubblegumModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'dr_bubblegum';

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4));
  body.name = 'Body';
  root.add(body);

  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 0.52, 0);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22));
  headMesh.name = 'HeadMesh';
  head.add(headMesh);

  const hat = new THREE.Group();
  hat.name = 'Hat';
  hat.position.set(0, 0.42, 0);
  const hatMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.32));
  hatMesh.name = 'HatMesh';
  hat.add(hatMesh);
  head.add(hat);
  root.add(head);

  const armL = new THREE.Group();
  armL.name = 'Arm_L';
  root.add(armL);

  const armR = new THREE.Group();
  armR.name = 'Arm_R';
  const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5));
  cane.name = 'Cane';
  armR.add(cane);
  root.add(armR);

  return root;
}

describe('PR-10 NpcView Dr. Bubblegum doorstep animation & *KNOCK KNOCK* projection', () => {
  it('spawns Dr. Bubblegum at the Starter House doorstep with cane articulation and raycast tagging', () => {
    const model = createMockDrBubblegumModel();
    const npcView = new NpcView({
      drBubblegumModel: model,
      initialAtDoor: true,
    });

    expect(npcView.isAtDoor()).toBe(true);
    expect(npcView.isVisible()).toBe(true);
    expect(npcView.hasCaneNode()).toBe(true);
    expect(npcView.getRaycastTargets()).toHaveLength(1);
    expect(npcView.getNpcRig().position.x).toBeCloseTo(DR_BUBBLEGUM_DOORSTEP_POSITION.x, 4);
    expect(npcView.getNpcRig().userData.npcId).toBe('dr_bubblegum');

    // Triggering a knock articulates Arm_R (holding the cane)
    const armR = model.getObjectByName('Arm_R')!;
    const initialRotX = armR.rotation.x;
    npcView.triggerKnock();
    npcView.update(0.05);
    npcView.update(0.05);
    npcView.update(0.05);
    expect(armR.rotation.x).not.toBeCloseTo(initialRotX, 4);

    npcView.dispose();
  });

  it('projects a clamped *KNOCK KNOCK* indicator when at the door and hides cleanly when away', () => {
    const model = createMockDrBubblegumModel();
    const npcView = new NpcView({
      drBubblegumModel: model,
      initialAtDoor: true,
    });

    const camera = new THREE.PerspectiveCamera(42, 390 / 844, 0.2, 160);
    camera.position.set(0, 7, 11);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    npcView.update(0.05);
    const indicator = npcView.projectKnockIndicator(camera, 390, 844);
    expect(indicator.visible).toBe(true);
    expect(indicator.x).toBeGreaterThan(0);
    expect(indicator.x).toBeLessThan(390);
    expect(indicator.y).toBeGreaterThan(0);
    expect(indicator.y).toBeLessThan(844);

    // Dismissing Dr. Bubblegum smoothly shrinks him away and disables indicator & raycasting
    npcView.setAtDoor(false);
    expect(npcView.isAtDoor()).toBe(false);
    expect(npcView.getRaycastTargets()).toHaveLength(0);
    for (let i = 0; i < 12; i += 1) {
      npcView.update(0.05);
    }
    expect(npcView.isVisible()).toBe(false);
    expect(npcView.projectKnockIndicator(camera, 390, 844).visible).toBe(false);

    npcView.dispose();
  });
});
