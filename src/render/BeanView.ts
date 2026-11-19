import * as THREE from 'three';
import { LOW_NEED_THRESHOLD } from '../sim/constants';
import { isBeanAngry, isMegaTantrum } from '../sim/needs';
import type { GameMode, JellyBeanEntity } from '../sim/types';

export interface ProjectedBubblePosition {
  x: number;
  y: number;
  visible: boolean;
}

export interface BeanVisualState {
  beanId: string;
  isSleeping: boolean;
  isHungry: boolean;
  isCold: boolean;
  isSleepy: boolean;
  isAngry: boolean;
  isMegaTantrum: boolean;
  mood: number;
}

export interface BeanViewOptions {
  larvaModel: THREE.Object3D;
  appleTemplate?: THREE.Object3D | null;
  homePosition?: THREE.Vector3;
  bedPosition?: THREE.Vector3;
  baseScale?: number;
}

interface ActiveAppleToss {
  mesh: THREE.Object3D;
  elapsed: number;
  duration: number;
  startPos: THREE.Vector3;
  controlPos: THREE.Vector3;
  endPos: THREE.Vector3;
}

interface BurstParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  elapsed: number;
  duration: number;
}

export const LARVA_HOME_POSITION = new THREE.Vector3(0.05, 0.0, 1.32);
export const LARVA_BED_POSITION = new THREE.Vector3(-0.96, 0.29, 1.44);
export const LARVA_DEFAULT_SCALE = 1.38;

const APPLE_TOSS_DURATION = 0.42;
const EAT_CHOMP_DURATION = 0.56;
const HAPPY_BOUNCE_DURATION = 0.52;
const BLINK_INTERVAL_SEC = 3.4;
const BLINK_DURATION_SEC = 0.14;
const SLEEP_TRANSITION_SPEED = 2.6;

const COLD_TINT_COLOR = new THREE.Color('#78c6ff');
const ANGRY_TINT_COLOR = new THREE.Color('#ff2e4c');

const CONFETTI_COLORS = ['#ffe066', '#ff85b3', '#7ce88c', '#8fd9fb', '#ffd15c'] as const;

function cloneBodyMaterials(bodyRoot: THREE.Object3D): Array<{
  material: THREE.MeshStandardMaterial;
  baseColor: THREE.Color;
}> {
  const entries: Array<{ material: THREE.MeshStandardMaterial; baseColor: THREE.Color }> = [];

  bodyRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;

    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((mat) => {
        if (mat instanceof THREE.MeshStandardMaterial) {
          const cloned = mat.clone();
          entries.push({ material: cloned, baseColor: cloned.color.clone() });
          return cloned;
        }
        return mat;
      });
    } else if (obj.material instanceof THREE.MeshStandardMaterial) {
      const cloned = obj.material.clone();
      obj.material = cloned;
      entries.push({ material: cloned, baseColor: cloned.color.clone() });
    }
  });

  return entries;
}

/**
 * Procedural 3D Larva Jelly Bean controller with idle jelly bounce,
 * tossed 3D apple + squash-and-stretch eat animation, shivering/sleepy/angry poses,
 * cozy bed tuck-in, and 3D-to-2D projected speech bubble anchoring.
 */
export class BeanView {
  readonly group = new THREE.Group();
  private readonly larvaContainer = new THREE.Group();
  private readonly fxContainer = new THREE.Group();

  private readonly larvaModel: THREE.Object3D;
  private readonly appleTemplate: THREE.Object3D | null;

  private readonly homePosition: THREE.Vector3;
  private readonly bedPosition: THREE.Vector3;
  private readonly baseScale: number;

  private readonly bodyNode: THREE.Object3D | null;
  private readonly eyesNode: THREE.Object3D | null;
  private readonly browsNode: THREE.Object3D | null;
  private readonly browLeftNode: THREE.Object3D | null;
  private readonly browRightNode: THREE.Object3D | null;
  private readonly mouthNode: THREE.Object3D | null;
  private readonly hatSocketNode: THREE.Object3D | null;

  private readonly baseEyesScale: THREE.Vector3;
  private readonly baseMouthScale: THREE.Vector3;
  private readonly baseBrowsPosY: number;
  private readonly baseBrowLeftRotZ: number;
  private readonly baseBrowRightRotZ: number;
  private readonly bodyMaterials: Array<{
    material: THREE.MeshStandardMaterial;
    baseColor: THREE.Color;
  }>;

  private readonly activeApples: ActiveAppleToss[] = [];
  private readonly burstParticles: BurstParticle[] = [];
  private readonly particleGeometry = new THREE.SphereGeometry(0.055, 8, 6);
  private readonly particleMaterials: THREE.MeshStandardMaterial[];

  private readonly tempWorldAnchor = new THREE.Vector3();
  private readonly tempProjected = new THREE.Vector3();
  private readonly tempPos = new THREE.Vector3();
  private readonly tempTint = new THREE.Color();

  private visualState: BeanVisualState = {
    beanId: 'bean-1',
    isSleeping: false,
    isHungry: false,
    isCold: false,
    isSleepy: false,
    isAngry: false,
    isMegaTantrum: false,
    mood: 80,
  };

  private elapsedSec = 0;
  private sleepBlend = 0;
  private eatAnimRemaining = 0;
  private happyAnimRemaining = 0;
  private blinkTimer = BLINK_INTERVAL_SEC * 0.65;
  private disposed = false;

  constructor(options: BeanViewOptions) {
    this.larvaModel = options.larvaModel;
    this.appleTemplate = options.appleTemplate ?? null;
    this.homePosition = (options.homePosition ?? LARVA_HOME_POSITION).clone();
    this.bedPosition = (options.bedPosition ?? LARVA_BED_POSITION).clone();
    this.baseScale = options.baseScale ?? LARVA_DEFAULT_SCALE;

    this.group.name = 'BeanViewRoot';
    this.larvaContainer.name = 'LarvaPoseRig';
    this.fxContainer.name = 'BeanCareEffects';

    this.larvaContainer.position.copy(this.homePosition);
    this.larvaContainer.scale.setScalar(this.baseScale);
    this.larvaContainer.add(this.larvaModel);

    this.group.add(this.larvaContainer);
    this.group.add(this.fxContainer);

    this.bodyNode = this.larvaModel.getObjectByName('Body') ?? null;
    this.eyesNode = this.larvaModel.getObjectByName('Eyes') ?? null;
    this.browsNode = this.larvaModel.getObjectByName('Brows') ?? null;
    this.browLeftNode = this.larvaModel.getObjectByName('Brow_L') ?? null;
    this.browRightNode = this.larvaModel.getObjectByName('Brow_R') ?? null;
    this.mouthNode = this.larvaModel.getObjectByName('Mouth') ?? null;
    this.hatSocketNode = this.larvaModel.getObjectByName('HatSocket') ?? null;

    this.baseEyesScale = this.eyesNode ? this.eyesNode.scale.clone() : new THREE.Vector3(1, 1, 1);
    this.baseMouthScale = this.mouthNode ? this.mouthNode.scale.clone() : new THREE.Vector3(1, 1, 1);
    this.baseBrowsPosY = this.browsNode ? this.browsNode.position.y : 0;
    this.baseBrowLeftRotZ = this.browLeftNode ? this.browLeftNode.rotation.z : 0;
    this.baseBrowRightRotZ = this.browRightNode ? this.browRightNode.rotation.z : 0;

    this.bodyMaterials = this.bodyNode ? cloneBodyMaterials(this.bodyNode) : [];
    this.particleMaterials = CONFETTI_COLORS.map(
      (hex) =>
        new THREE.MeshStandardMaterial({
          color: hex,
          roughness: 0.25,
          metalness: 0.0,
          transparent: true,
          opacity: 1,
        }),
    );
  }

  getBeanId(): string {
    return this.visualState.beanId;
  }

  getVisualState(): Readonly<BeanVisualState> {
    return this.visualState;
  }

  getLarvaRig(): THREE.Group {
    return this.larvaContainer;
  }

  getRaycastTargets(): THREE.Object3D[] {
    return [this.larvaContainer];
  }

  getActiveAppleCount(): number {
    return this.activeApples.length;
  }

  isEating(): boolean {
    return this.eatAnimRemaining > 0 || this.activeApples.length > 0;
  }

  syncState(bean: JellyBeanEntity, mode: GameMode = 'regular'): void {
    this.visualState = {
      beanId: bean.id,
      isSleeping: bean.isSleeping,
      isHungry: bean.needs.hunger < LOW_NEED_THRESHOLD,
      isCold: bean.needs.warmth < LOW_NEED_THRESHOLD,
      isSleepy: !bean.isSleeping && bean.needs.sleep < LOW_NEED_THRESHOLD,
      isAngry: isBeanAngry(bean),
      isMegaTantrum: isMegaTantrum(bean, mode),
      mood: bean.needs.mood,
    };
  }

  /**
   * Launches a 3D apple along a playful parabolic arc into the Larva's mouth,
   * followed by a squash-and-stretch chomp animation and confetti pop.
   */
  triggerFeedApple(): void {
    if (this.disposed) return;

    const endPos = this.larvaContainer.position.clone().add(new THREE.Vector3(0, 0.42, 0.24));
    const startPos = endPos.clone().add(new THREE.Vector3(1.12, 1.52, 1.32));
    const controlPos = startPos
      .clone()
      .lerp(endPos, 0.48)
      .add(new THREE.Vector3(0.08, 0.85, 0.12));

    let appleMesh: THREE.Object3D;
    if (this.appleTemplate) {
      appleMesh = this.appleTemplate.clone(true);
      appleMesh.scale.setScalar(1.35);
    } else {
      const fallback = new THREE.Mesh(
        this.particleGeometry,
        this.particleMaterials[1] ?? this.particleMaterials[0],
      );
      fallback.scale.setScalar(2.4);
      appleMesh = fallback;
    }

    appleMesh.position.copy(startPos);
    this.fxContainer.add(appleMesh);

    this.activeApples.push({
      mesh: appleMesh,
      elapsed: 0,
      duration: APPLE_TOSS_DURATION,
      startPos,
      controlPos,
      endPos,
    });
  }

  /**
   * Plays a joyful wiggle-hop and sparkle burst (used for Pet, Warm, Wash, Level Up).
   */
  triggerHappyBounce(): void {
    if (this.disposed) return;
    this.happyAnimRemaining = HAPPY_BOUNCE_DURATION;
    this.spawnBurst(this.larvaContainer.position.clone().add(new THREE.Vector3(0, 0.65, 0.15)), 5);
  }

  update(dtSeconds: number): void {
    if (this.disposed) return;
    const dt = Math.max(0, Math.min(dtSeconds, 0.05));
    this.elapsedSec += dt;

    this.updateAppleTosses(dt);
    this.updateBurstParticles(dt);

    if (this.eatAnimRemaining > 0) {
      this.eatAnimRemaining = Math.max(0, this.eatAnimRemaining - dt);
    }
    if (this.happyAnimRemaining > 0) {
      this.happyAnimRemaining = Math.max(0, this.happyAnimRemaining - dt);
    }

    // Smoothly transition between sunny yard and cozy bed when sleeping
    const targetSleep = this.visualState.isSleeping ? 1 : 0;
    if (this.sleepBlend !== targetSleep) {
      const step = SLEEP_TRANSITION_SPEED * dt;
      if (this.sleepBlend < targetSleep) {
        this.sleepBlend = Math.min(1, this.sleepBlend + step);
      } else {
        this.sleepBlend = Math.max(0, this.sleepBlend - step);
      }
    }

    const smoothSleep = this.sleepBlend * this.sleepBlend * (3 - 2 * this.sleepBlend);
    const transitHop = Math.sin(this.sleepBlend * Math.PI) * 0.42;

    this.tempPos.lerpVectors(this.homePosition, this.bedPosition, smoothSleep);

    let bounceY = 0;
    let scaleY = 1;
    let rotX = 0;
    let rotY = THREE.MathUtils.lerp(0.24, 0.56, smoothSleep);
    let rotZ = 0;
    let shiverOffsetX = 0;

    if (this.eatAnimRemaining > 0) {
      // Celebratory squash-and-stretch chomp + joyful hop!
      const p = 1 - this.eatAnimRemaining / EAT_CHOMP_DURATION;
      const chompWave = Math.sin(p * Math.PI * 3.0);
      const jump = Math.sin(p * Math.PI) * 0.34;
      bounceY = jump;
      scaleY = 1 + 0.24 * Math.sin(p * Math.PI * 2.0) - 0.14 * Math.max(0, -chompWave);
      rotZ = Math.sin(p * Math.PI * 4.0) * 0.09;
    } else if (this.happyAnimRemaining > 0) {
      const p = 1 - this.happyAnimRemaining / HAPPY_BOUNCE_DURATION;
      bounceY = Math.sin(p * Math.PI) * 0.28;
      scaleY = 1 + 0.18 * Math.sin(p * Math.PI * 2.0);
      rotZ = Math.sin(p * Math.PI * 3.0) * 0.12;
    } else if (this.visualState.isSleeping) {
      // Slow cozy breathing while tucked into the pastel bed
      const breath = Math.sin(this.elapsedSec * 1.9);
      scaleY = 0.94 + breath * 0.055;
      rotZ = Math.sin(this.elapsedSec * 0.95) * 0.05;
      rotX = 0.08;
    } else {
      // Awake idle jelly bounce modulated by mood & urgent needs
      const speed = this.visualState.isHungry
        ? 4.6
        : this.visualState.isAngry
          ? 5.4
          : this.visualState.isSleepy
            ? 1.7
            : 2.9;

      const phase = this.elapsedSec * speed;
      const wave = Math.sin(phase);
      const hopAmp = this.visualState.isHungry
        ? 0.13
        : this.visualState.isSleepy
          ? 0.015
          : this.visualState.mood >= 60
            ? 0.075
            : 0.035;

      bounceY = Math.max(0, wave) * hopAmp;
      scaleY = 1 + wave * (this.visualState.isSleepy ? 0.035 : 0.075);
      rotZ = Math.sin(this.elapsedSec * (this.visualState.isSleepy ? 1.1 : 1.8)) * 0.045;
      rotX = this.visualState.isSleepy ? 0.1 : 0;

      if (this.visualState.isCold) {
        shiverOffsetX = Math.sin(this.elapsedSec * 36.0) * 0.032;
        rotZ += Math.cos(this.elapsedSec * 32.0) * 0.065;
      }

      if (this.visualState.isAngry) {
        shiverOffsetX += Math.sin(this.elapsedSec * 28.0) * 0.018;
      }
    }

    // Volume-preserving jelly squash & stretch
    const safeScaleY = THREE.MathUtils.clamp(scaleY, 0.72, 1.32);
    const scaleXZ = 1 / Math.sqrt(safeScaleY);

    this.larvaContainer.position.set(
      this.tempPos.x + shiverOffsetX,
      this.tempPos.y + bounceY + transitHop,
      this.tempPos.z,
    );
    this.larvaContainer.scale.set(
      this.baseScale * scaleXZ,
      this.baseScale * safeScaleY,
      this.baseScale * scaleXZ,
    );
    this.larvaContainer.rotation.set(rotX, rotY, rotZ);

    this.updateFacialExpressions(dt);
    this.updateBodyTint();
  }

  /**
   * Projects a world anchor above the Larva's crown into clamped 2D viewport CSS pixels.
   */
  projectSpeechBubble(
    camera: THREE.Camera,
    viewportWidth: number,
    viewportHeight: number,
  ): ProjectedBubblePosition {
    if (viewportWidth <= 0 || viewportHeight <= 0) {
      return { x: 0, y: 0, visible: false };
    }

    this.larvaContainer.updateWorldMatrix(true, true);

    if (this.hatSocketNode) {
      this.hatSocketNode.getWorldPosition(this.tempWorldAnchor);
      this.tempWorldAnchor.y += 0.36;
    } else {
      this.larvaContainer.getWorldPosition(this.tempWorldAnchor);
      this.tempWorldAnchor.y += 1.05;
    }

    this.tempProjected.copy(this.tempWorldAnchor).project(camera);

    // Behind camera frustum check
    const inFront = this.tempProjected.z >= -1 && this.tempProjected.z <= 1;
    const rawX = (this.tempProjected.x * 0.5 + 0.5) * viewportWidth;
    const rawY = (-this.tempProjected.y * 0.5 + 0.5) * viewportHeight;

    const marginX = Math.min(112, viewportWidth * 0.3);
    const minY = Math.min(148, viewportHeight * 0.2);
    const maxY = Math.max(minY, viewportHeight - 196);

    return {
      x: THREE.MathUtils.clamp(rawX, marginX, Math.max(marginX, viewportWidth - marginX)),
      y: THREE.MathUtils.clamp(rawY, minY, maxY),
      visible: inFront,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (const toss of this.activeApples) {
      this.fxContainer.remove(toss.mesh);
    }
    this.activeApples.length = 0;

    for (const particle of this.burstParticles) {
      this.fxContainer.remove(particle.mesh);
    }
    this.burstParticles.length = 0;

    for (const entry of this.bodyMaterials) {
      entry.material.dispose();
    }
    this.bodyMaterials.length = 0;

    this.particleGeometry.dispose();
    for (const mat of this.particleMaterials) {
      mat.dispose();
    }
    this.particleMaterials.length = 0;

    this.group.removeFromParent();
  }

  private updateAppleTosses(dt: number): void {
    for (let i = this.activeApples.length - 1; i >= 0; i -= 1) {
      const toss = this.activeApples[i];
      if (!toss) continue;

      toss.elapsed += dt;
      const t = Math.min(1, toss.elapsed / toss.duration);

      // Keep landing target locked onto the moving Larva's mouth
      toss.endPos.copy(this.larvaContainer.position).add(new THREE.Vector3(0, 0.42, 0.24));

      // Quadratic Bezier arc: (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
      const inv = 1 - t;
      toss.mesh.position.set(
        inv * inv * toss.startPos.x + 2 * inv * t * toss.controlPos.x + t * t * toss.endPos.x,
        inv * inv * toss.startPos.y + 2 * inv * t * toss.controlPos.y + t * t * toss.endPos.y,
        inv * inv * toss.startPos.z + 2 * inv * t * toss.controlPos.z + t * t * toss.endPos.z,
      );

      toss.mesh.rotation.x += dt * 7.5;
      toss.mesh.rotation.z += dt * 4.2;

      const shrink = t > 0.78 ? 1 - ((t - 0.78) / 0.22) * 0.55 : 1;
      toss.mesh.scale.setScalar(1.35 * shrink);

      if (t >= 1) {
        this.fxContainer.remove(toss.mesh);
        this.activeApples.splice(i, 1);
        this.eatAnimRemaining = EAT_CHOMP_DURATION;
        this.spawnBurst(toss.endPos, 7);
      }
    }
  }

  private spawnBurst(origin: THREE.Vector3, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const mat = this.particleMaterials[i % this.particleMaterials.length];
      if (!mat) continue;

      const angle = (Math.PI * 2 * i) / count + this.elapsedSec * 0.7;
      const speed = 1.05 + (i % 3) * 0.35;
      const mesh = new THREE.Mesh(this.particleGeometry, mat);
      mesh.position.copy(origin);
      this.fxContainer.add(mesh);

      this.burstParticles.push({
        mesh,
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          1.35 + (i % 2) * 0.45,
          Math.sin(angle) * speed,
        ),
        elapsed: 0,
        duration: 0.48,
      });
    }
  }

  private updateBurstParticles(dt: number): void {
    for (let i = this.burstParticles.length - 1; i >= 0; i -= 1) {
      const p = this.burstParticles[i];
      if (!p) continue;

      p.elapsed += dt;
      const t = Math.min(1, p.elapsed / p.duration);
      p.velocity.y -= 4.2 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.scale.setScalar(Math.max(0.01, 1 - t));

      if (t >= 1) {
        this.fxContainer.remove(p.mesh);
        this.burstParticles.splice(i, 1);
      }
    }
  }

  private updateFacialExpressions(dt: number): void {
    // Periodic natural blink timer
    this.blinkTimer -= dt;
    if (this.blinkTimer <= -BLINK_DURATION_SEC) {
      this.blinkTimer = BLINK_INTERVAL_SEC;
    }
    const isBlinking = this.blinkTimer <= 0 && this.blinkTimer > -BLINK_DURATION_SEC;

    if (this.eyesNode) {
      let eyeScaleY = 1;
      if (this.visualState.isSleeping) {
        eyeScaleY = 0.12;
      } else if (this.eatAnimRemaining > 0) {
        // Happy squinting eyes while chomping
        eyeScaleY = 0.42 + 0.12 * Math.sin(this.elapsedSec * 18);
      } else if (isBlinking) {
        eyeScaleY = 0.12;
      } else if (this.visualState.isSleepy) {
        eyeScaleY = 0.52;
      } else if (this.visualState.isHungry) {
        eyeScaleY = 1.12;
      }
      this.eyesNode.scale.set(
        this.baseEyesScale.x,
        this.baseEyesScale.y * eyeScaleY,
        this.baseEyesScale.z,
      );
    }

    if (this.mouthNode) {
      let mouthScaleX = 1;
      let mouthScaleY = 1;
      if (this.eatAnimRemaining > 0) {
        const chew = 0.5 + 0.5 * Math.sin(this.elapsedSec * 24);
        mouthScaleX = 1.25;
        mouthScaleY = 1.15 + chew * 1.15;
      } else if (this.visualState.isSleeping) {
        mouthScaleX = 0.65;
        mouthScaleY = 0.72;
      } else if (this.visualState.isHungry) {
        const cry = 0.5 + 0.5 * Math.sin(this.elapsedSec * 9);
        mouthScaleX = 1.05;
        mouthScaleY = 1.1 + cry * 0.9;
      } else if (this.visualState.isCold) {
        mouthScaleX = 0.85;
        mouthScaleY = 1.25 + 0.25 * Math.sin(this.elapsedSec * 28);
      } else if (this.happyAnimRemaining > 0) {
        mouthScaleX = 1.25;
        mouthScaleY = 1.35;
      }

      this.mouthNode.scale.set(
        this.baseMouthScale.x * mouthScaleX,
        this.baseMouthScale.y * mouthScaleY,
        this.baseMouthScale.z,
      );
    }

    if (this.browsNode) {
      const browOffsetY = this.visualState.isAngry
        ? -0.025
        : this.visualState.isHungry || this.happyAnimRemaining > 0
          ? 0.015
          : 0;
      this.browsNode.position.y = this.baseBrowsPosY + browOffsetY;
    }

    // Brow tilts: angry furrows inward, cold/sleepy tilts worried outward
    let leftDelta = 0;
    let rightDelta = 0;
    if (this.visualState.isAngry) {
      leftDelta = -0.32;
      rightDelta = 0.32;
    } else if (this.visualState.isCold || this.visualState.isSleepy) {
      leftDelta = 0.22;
      rightDelta = -0.22;
    }

    if (this.browLeftNode) {
      this.browLeftNode.rotation.z = this.baseBrowLeftRotZ + leftDelta;
    }
    if (this.browRightNode) {
      this.browRightNode.rotation.z = this.baseBrowRightRotZ + rightDelta;
    }
  }

  private updateBodyTint(): void {
    for (const entry of this.bodyMaterials) {
      this.tempTint.copy(entry.baseColor);
      if (this.visualState.isCold) {
        const coldPulse = 0.24 + 0.08 * Math.sin(this.elapsedSec * 8);
        this.tempTint.lerp(COLD_TINT_COLOR, coldPulse);
      } else if (this.visualState.isAngry) {
        const angryPulse = 0.22 + 0.1 * Math.sin(this.elapsedSec * 10);
        this.tempTint.lerp(ANGRY_TINT_COLOR, angryPulse);
      }
      entry.material.color.copy(this.tempTint);
    }
  }
}
