import * as THREE from 'three';

export interface ProjectedNpcIndicator {
  x: number;
  y: number;
  visible: boolean;
  pulse: number;
}

export interface NpcViewOptions {
  drBubblegumModel: THREE.Object3D;
  doorstepPosition?: THREE.Vector3;
  baseScale?: number;
  initialAtDoor?: boolean;
}

/**
 * Standing spot right beside the Starter House biscuit welcome doorstep (`plot_pad_0`),
 * angled warmly toward the player camera without colliding with the Larva or Bed.
 */
export const DR_BUBBLEGUM_DOORSTEP_POSITION = new THREE.Vector3(0.62, 0.026, 0.86);
export const DR_BUBBLEGUM_DEFAULT_SCALE = 1.08;

const PRESENCE_TRANSITION_SPEED = 4.2;
const KNOCK_BURST_DURATION = 0.92;
const IDLE_KNOCK_PERIOD = 2.8;

/**
 * Renders and animates Dr. Bubblegum (`dr_bubblegum.glb`) on the Starter House doorstep
 * with periodic double cane-tap animations, head/hat nods, a pulsing doorstep aura ring,
 * raycastable tap detection, and a 3D-to-2D projected `*KNOCK KNOCK*` indicator anchor.
 */
export class NpcView {
  readonly group = new THREE.Group();
  private readonly npcRig = new THREE.Group();
  private readonly model: THREE.Object3D;

  private readonly doorstepPosition: THREE.Vector3;
  private readonly baseScale: number;

  private readonly headNode: THREE.Object3D | null;
  private readonly hatNode: THREE.Object3D | null;
  private readonly armLeftNode: THREE.Object3D | null;
  private readonly armRightNode: THREE.Object3D | null;
  private readonly caneNode: THREE.Object3D | null;

  private readonly baseHeadRotX: number;
  private readonly baseHeadRotY: number;
  private readonly baseHatRotZ: number;
  private readonly baseArmLeftRotZ: number;
  private readonly baseArmRightRotX: number;
  private readonly baseArmRightRotZ: number;

  private readonly auraRingGeometry: THREE.RingGeometry;
  private readonly auraRingMaterial: THREE.MeshBasicMaterial;
  private readonly auraRingMesh: THREE.Mesh;

  private readonly knockWaveGeometry: THREE.RingGeometry;
  private readonly knockWaveMaterial: THREE.MeshBasicMaterial;
  private readonly knockWaveMesh: THREE.Mesh;

  private readonly tempWorldAnchor = new THREE.Vector3();
  private readonly tempProjected = new THREE.Vector3();

  private atDoor: boolean;
  private presenceBlend: number;
  private knockBurstRemaining = 0;
  private elapsedSec = 0;
  private disposed = false;

  constructor(options: NpcViewOptions) {
    this.model = options.drBubblegumModel;
    this.doorstepPosition = (options.doorstepPosition ?? DR_BUBBLEGUM_DOORSTEP_POSITION).clone();
    this.baseScale = options.baseScale ?? DR_BUBBLEGUM_DEFAULT_SCALE;
    this.atDoor = options.initialAtDoor ?? false;
    this.presenceBlend = this.atDoor ? 1 : 0;

    this.group.name = 'NpcViewRoot';
    this.npcRig.name = 'DrBubblegumRig';
    this.npcRig.position.copy(this.doorstepPosition);
    this.npcRig.rotation.y = -0.34;
    this.npcRig.scale.setScalar(this.atDoor ? this.baseScale : 0.001);
    this.npcRig.visible = this.atDoor;
    this.npcRig.add(this.model);

    // Tag entire NPC subtree so raycasting identifies Dr. Bubblegum cleanly
    this.npcRig.userData.npcId = 'dr_bubblegum';
    this.model.traverse((child) => {
      child.userData.npcId = 'dr_bubblegum';
    });

    this.headNode = this.model.getObjectByName('Head') ?? null;
    this.hatNode = this.model.getObjectByName('Hat') ?? null;
    this.armLeftNode = this.model.getObjectByName('Arm_L') ?? null;
    this.armRightNode = this.model.getObjectByName('Arm_R') ?? null;
    this.caneNode = this.model.getObjectByName('Cane') ?? null;

    this.baseHeadRotX = this.headNode ? this.headNode.rotation.x : 0;
    this.baseHeadRotY = this.headNode ? this.headNode.rotation.y : 0;
    this.baseHatRotZ = this.hatNode ? this.hatNode.rotation.z : 0;
    this.baseArmLeftRotZ = this.armLeftNode ? this.armLeftNode.rotation.z : 0;
    this.baseArmRightRotX = this.armRightNode ? this.armRightNode.rotation.x : 0;
    this.baseArmRightRotZ = this.armRightNode ? this.armRightNode.rotation.z : 0;

    // Warm bubblegum-gold doorstep halo ring while waiting at the door
    this.auraRingGeometry = new THREE.RingGeometry(0.32, 0.44, 24);
    this.auraRingGeometry.rotateX(-Math.PI / 2);
    this.auraRingMaterial = new THREE.MeshBasicMaterial({
      color: '#ff6b9d',
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.auraRingMesh = new THREE.Mesh(this.auraRingGeometry, this.auraRingMaterial);
    this.auraRingMesh.name = 'DrBubblegumDoorAura';
    this.auraRingMesh.position.set(
      this.doorstepPosition.x,
      this.doorstepPosition.y + 0.028,
      this.doorstepPosition.z,
    );
    this.auraRingMesh.visible = this.atDoor;

    // Expanding golden ripple wave when tapping his cane / knocking on the door
    this.knockWaveGeometry = new THREE.RingGeometry(0.22, 0.31, 24);
    this.knockWaveGeometry.rotateX(-Math.PI / 2);
    this.knockWaveMaterial = new THREE.MeshBasicMaterial({
      color: '#ffca3a',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.knockWaveMesh = new THREE.Mesh(this.knockWaveGeometry, this.knockWaveMaterial);
    this.knockWaveMesh.name = 'DrBubblegumKnockWave';
    this.knockWaveMesh.position.set(
      this.doorstepPosition.x + 0.14,
      this.doorstepPosition.y + 0.032,
      this.doorstepPosition.z + 0.06,
    );
    this.knockWaveMesh.visible = false;

    this.group.add(this.auraRingMesh);
    this.group.add(this.knockWaveMesh);
    this.group.add(this.npcRig);
  }

  isAtDoor(): boolean {
    return this.atDoor;
  }

  isVisible(): boolean {
    return this.npcRig.visible;
  }

  hasCaneNode(): boolean {
    return this.caneNode !== null;
  }

  getNpcRig(): THREE.Group {
    return this.npcRig;
  }

  getRaycastTargets(): THREE.Object3D[] {
    return this.atDoor && this.npcRig.visible ? [this.npcRig] : [];
  }

  setAtDoor(atDoor: boolean, triggerKnockBurst = false): void {
    if (this.disposed) return;
    const newlyArrived = atDoor && !this.atDoor;
    this.atDoor = atDoor;
    if (newlyArrived || (atDoor && triggerKnockBurst)) {
      this.triggerKnock();
    }
  }

  /**
   * Triggers a crisp double cane-tap knock flourish & golden knock ripple wave.
   */
  triggerKnock(): void {
    if (this.disposed) return;
    this.knockBurstRemaining = KNOCK_BURST_DURATION;
  }

  update(dtSeconds: number): void {
    if (this.disposed) return;
    const dt = Math.max(0, Math.min(dtSeconds, 0.05));
    this.elapsedSec += dt;

    // Smooth elastic pop-in / shrink-out on the doorstep
    const targetPresence = this.atDoor ? 1 : 0;
    if (this.presenceBlend !== targetPresence) {
      const step = PRESENCE_TRANSITION_SPEED * dt;
      if (this.presenceBlend < targetPresence) {
        this.presenceBlend = Math.min(1, this.presenceBlend + step);
      } else {
        this.presenceBlend = Math.max(0, this.presenceBlend - step);
      }
    }

    const visible = this.presenceBlend > 0.02;
    this.npcRig.visible = visible;
    this.auraRingMesh.visible = visible;

    if (!visible) {
      this.knockWaveMesh.visible = false;
      return;
    }

    const popOvershoot =
      this.presenceBlend < 1
        ? 1 + Math.sin(this.presenceBlend * Math.PI) * 0.16
        : 1;
    const currentScale = Math.max(0.01, this.baseScale * this.presenceBlend * popOvershoot);
    this.npcRig.scale.setScalar(currentScale);

    // Compute double cane-tap wave (either active knock burst or periodic patient knock)
    let tapWave = 0;
    let waveProgress = 0;
    if (this.knockBurstRemaining > 0) {
      this.knockBurstRemaining = Math.max(0, this.knockBurstRemaining - dt);
      const p = 1 - this.knockBurstRemaining / KNOCK_BURST_DURATION;
      waveProgress = p;
      // Two crisp double-knock beats at p in [0..0.42] and [0.48..0.92]
      if (p < 0.42) {
        tapWave = Math.sin((p / 0.42) * Math.PI);
      } else if (p > 0.48 && p < 0.92) {
        tapWave = Math.sin(((p - 0.48) / 0.44) * Math.PI);
      }
    } else {
      const cycle = this.elapsedSec % IDLE_KNOCK_PERIOD;
      if (cycle < 0.28) {
        tapWave = Math.sin((cycle / 0.28) * Math.PI) * 0.85;
        waveProgress = cycle / 0.65;
      } else if (cycle > 0.34 && cycle < 0.62) {
        tapWave = Math.sin(((cycle - 0.34) / 0.28) * Math.PI) * 0.85;
        waveProgress = cycle / 0.65;
      }
    }

    // Gentle stern-professor breathing & slight eager hop on cane tap
    const idleBob = Math.sin(this.elapsedSec * 2.6) * 0.024;
    const tapHop = tapWave * 0.045;
    this.npcRig.position.set(
      this.doorstepPosition.x,
      this.doorstepPosition.y + Math.max(0, idleBob) + tapHop,
      this.doorstepPosition.z,
    );

    // Articulate right arm + cane for crisp double cane-taps
    if (this.armRightNode) {
      this.armRightNode.rotation.x = this.baseArmRightRotX - tapWave * 0.52;
      this.armRightNode.rotation.z = this.baseArmRightRotZ + tapWave * 0.14;
    }

    // Subtle expressive sway on left arm
    if (this.armLeftNode) {
      this.armLeftNode.rotation.z =
        this.baseArmLeftRotZ + Math.sin(this.elapsedSec * 2.1) * 0.08 - tapWave * 0.1;
    }

    // Professorial head nod & mortarboard hat wobble
    if (this.headNode) {
      this.headNode.rotation.x =
        this.baseHeadRotX + Math.sin(this.elapsedSec * 1.9) * 0.04 + tapWave * 0.12;
      this.headNode.rotation.y = this.baseHeadRotY + Math.sin(this.elapsedSec * 1.2) * 0.11;
    }
    if (this.hatNode) {
      this.hatNode.rotation.z =
        this.baseHatRotZ + Math.sin(this.elapsedSec * 2.6) * 0.05 + tapWave * 0.09;
    }

    // Pulsing doorstep halo ring
    const auraPulse = 1 + 0.12 * Math.sin(this.elapsedSec * 4.4);
    this.auraRingMesh.scale.set(auraPulse, 1, auraPulse);
    this.auraRingMaterial.opacity = (0.45 + 0.28 * Math.sin(this.elapsedSec * 4.4)) * this.presenceBlend;

    // Expanding golden ripple synced to cane-taps
    if (waveProgress > 0 && waveProgress < 1) {
      this.knockWaveMesh.visible = true;
      const ringScale = 0.8 + waveProgress * 1.55;
      this.knockWaveMesh.scale.set(ringScale, 1, ringScale);
      this.knockWaveMaterial.opacity = (1 - waveProgress) * 0.82 * this.presenceBlend;
    } else {
      this.knockWaveMesh.visible = false;
    }
  }

  /**
   * Projects Dr. Bubblegum's `*KNOCK KNOCK*` indicator badge above his mortarboard hat
   * into clamped 2D viewport CSS pixels.
   */
  projectKnockIndicator(
    camera: THREE.Camera,
    viewportWidth: number,
    viewportHeight: number,
  ): ProjectedNpcIndicator {
    if (!this.atDoor || this.presenceBlend <= 0.35 || viewportWidth <= 0 || viewportHeight <= 0) {
      return { x: 0, y: 0, visible: false, pulse: 0 };
    }

    this.npcRig.updateWorldMatrix(true, true);

    if (this.hatNode) {
      this.hatNode.getWorldPosition(this.tempWorldAnchor);
      this.tempWorldAnchor.y += 0.36;
    } else {
      this.npcRig.getWorldPosition(this.tempWorldAnchor);
      this.tempWorldAnchor.y += 1.35;
    }

    this.tempProjected.copy(this.tempWorldAnchor).project(camera);
    const inFront = this.tempProjected.z >= -1 && this.tempProjected.z <= 1;
    const rawX = (this.tempProjected.x * 0.5 + 0.5) * viewportWidth;
    const rawY = (-this.tempProjected.y * 0.5 + 0.5) * viewportHeight;

    const marginX = Math.min(92, viewportWidth * 0.24);
    const minY = Math.min(136, viewportHeight * 0.18);
    const maxY = Math.max(minY, viewportHeight - 190);
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsedSec * 6.0);

    return {
      x: THREE.MathUtils.clamp(rawX, marginX, Math.max(marginX, viewportWidth - marginX)),
      y: THREE.MathUtils.clamp(rawY, minY, maxY),
      visible: inFront,
      pulse,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.auraRingGeometry.dispose();
    this.auraRingMaterial.dispose();
    this.knockWaveGeometry.dispose();
    this.knockWaveMaterial.dispose();
    this.group.removeFromParent();
  }
}
