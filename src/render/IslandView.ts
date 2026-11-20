import * as THREE from 'three';
import type { BuildingType, GameState, TileState } from '../sim/types';
import { AssetLoader } from './AssetLoader';

export type FloatingPopupAccent = 'coin' | 'buck' | 'xp' | 'burger';

export interface ProjectedFloatingPopup {
  id: number;
  text: string;
  accent: FloatingPopupAccent;
  x: number;
  y: number;
  opacity: number;
  scale: number;
  visible: boolean;
}

export interface IslandViewOptions {
  islandModel: THREE.Object3D;
  assetLoader: AssetLoader;
  initialHouseModel?: THREE.Object3D | null;
  coinTemplate?: THREE.Object3D | null;
}

interface MountedBuilding {
  tileId: string;
  type: BuildingType;
  tier: number;
  root: THREE.Group;
  model: THREE.Object3D;
  baseScale: number;
  popProgress: number;
  doorNode: THREE.Object3D | null;
  doorBaseRotY: number;
  doorAnimRemaining: number;
  burgerSignNode: THREE.Object3D | null;
  burgerSignBaseY: number;
  coinBadge: THREE.Object3D | null;
  hasPendingCoins: boolean;
}

interface FloatingPopupItem {
  id: number;
  text: string;
  accent: FloatingPopupAccent;
  worldOrigin: THREE.Vector3;
  elapsed: number;
  duration: number;
}

interface CoinBurstItem {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  elapsed: number;
  duration: number;
}

export const CANONICAL_PLOT_PAD_RE = /^plot_pad_\d+$/;

const PAD_SURFACE_Y = 0.026;
const FLOAT_POPUP_DURATION = 1.35;
const DOOR_FLUSH_DURATION = 0.72;
const COIN_BURST_DURATION = 0.75;

export const BUILDING_MODEL_PATHS: Partial<Record<BuildingType, string>> = {
  starter_house: 'assets/models/starter_house.glb',
  toilet: 'assets/models/toilet.glb',
  hamburger_stand: 'assets/models/hamburger_stand.glb',
};

const COIN_MODEL_PATH = 'assets/models/jelly_coin.glb';

/**
 * Walks up a glTF scene graph from a hit mesh (which GLTFLoader may split into
 * multi-material primitive children like `plot_pad_0_1`) to its canonical
 * `plot_pad_<n>` node.
 */
export function findCanonicalPlotPad(object: THREE.Object3D | null): THREE.Object3D | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (CANONICAL_PLOT_PAD_RE.test(current.name)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

/**
 * Resolves either a canonical plot pad mesh or a mounted building mesh back to its `tileId`.
 */
export function resolveTileIdFromHit(object: THREE.Object3D | null): string | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (typeof current.userData?.tileId === 'string' && current.userData.tileId.length > 0) {
      return current.userData.tileId;
    }
    if (CANONICAL_PLOT_PAD_RE.test(current.name)) {
      return current.name;
    }
    current = current.parent;
  }
  return null;
}

function tagSubtreeTileId(root: THREE.Object3D, tileId: string): void {
  root.userData.tileId = tileId;
  root.traverse((child) => {
    child.userData.tileId = tileId;
  });
}

function computeBuildingRotationY(tileId: string, localPos: THREE.Vector3): number {
  if (tileId === 'plot_pad_0') {
    return 0;
  }
  // Outer ring pads face nicely toward the cozy island center plaza.
  return Math.atan2(-localPos.x, -localPos.z);
}

function getBuildingTierScale(type: BuildingType, tier: number): number {
  if (type === 'starter_house') {
    return 1 + Math.max(0, tier - 1) * 0.055;
  }
  return 1;
}

/**
 * Manages the 3D island diorama surface: raycastable plot pads, selection and
 * valid-build ghost highlights, mounted `.glb` buildings (Starter House, Toilet,
 * Hamburger Stand), ready-to-collect coin badges, and floating `+JC` popups.
 */
export class IslandView {
  readonly group = new THREE.Group();

  private readonly assetLoader: AssetLoader;
  private readonly islandModel: THREE.Object3D;
  private readonly buildingsGroup = new THREE.Group();
  private readonly highlightsGroup = new THREE.Group();
  private readonly ghostGroup = new THREE.Group();
  private readonly fxGroup = new THREE.Group();

  private readonly padNodes = new Map<string, THREE.Object3D>();
  private readonly padPositions = new Map<string, THREE.Vector3>();
  private readonly mountedBuildings = new Map<string, MountedBuilding>();
  private readonly loadingKeys = new Map<string, string>();
  private readonly placementRings = new Map<string, THREE.Mesh>();

  private readonly selectionRing: THREE.Mesh;
  private readonly placementRingGeometry: THREE.RingGeometry;
  private readonly placementRingMaterial: THREE.MeshBasicMaterial;
  private readonly ghostMaterial: THREE.MeshStandardMaterial;
  private readonly fallbackCoinGeometry: THREE.CylinderGeometry;
  private readonly fallbackCoinMaterial: THREE.MeshStandardMaterial;

  private coinTemplate: THREE.Object3D | null;
  private ghostPreviewMesh: THREE.Object3D | null = null;
  private ghostPreviewType: BuildingType | null = null;
  private ghostPreviewToken = 0;

  private tilesSnapshot: Record<string, TileState> = {};
  private unlockedRing = 0;
  private dugHoles: readonly string[] = [];
  private selectedTileId: string | null = null;
  private placementBuildingType: BuildingType | null = null;

  private readonly floatingPopups: FloatingPopupItem[] = [];
  private readonly coinBursts: CoinBurstItem[] = [];
  private popupSeq = 0;
  private elapsedSec = 0;
  private disposed = false;

  private readonly tempWorld = new THREE.Vector3();
  private readonly tempProjected = new THREE.Vector3();

  constructor(options: IslandViewOptions) {
    this.assetLoader = options.assetLoader;
    this.islandModel = options.islandModel;
    this.coinTemplate = options.coinTemplate ?? null;

    this.group.name = 'IslandViewRoot';
    this.buildingsGroup.name = 'IslandBuildings';
    this.highlightsGroup.name = 'IslandHighlights';
    this.ghostGroup.name = 'IslandGhostPreview';
    this.fxGroup.name = 'IslandEffects';

    this.group.add(this.islandModel);
    this.group.add(this.highlightsGroup);
    this.group.add(this.buildingsGroup);
    this.group.add(this.ghostGroup);
    this.group.add(this.fxGroup);

    this.placementRingGeometry = new THREE.RingGeometry(0.72, 0.92, 28);
    this.placementRingGeometry.rotateX(-Math.PI / 2);
    this.placementRingMaterial = new THREE.MeshBasicMaterial({
      color: '#44d685',
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.ghostMaterial = new THREE.MeshStandardMaterial({
      color: '#6ff2a8',
      emissive: '#2bbf72',
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.56,
      roughness: 0.35,
      metalness: 0.0,
      depthWrite: false,
    });

    this.fallbackCoinGeometry = new THREE.CylinderGeometry(0.14, 0.14, 0.05, 14);
    this.fallbackCoinGeometry.rotateX(Math.PI / 2);
    this.fallbackCoinMaterial = new THREE.MeshStandardMaterial({
      color: '#ffca3a',
      emissive: '#e39b00',
      emissiveIntensity: 0.25,
      roughness: 0.22,
      metalness: 0.45,
    });

    this.selectionRing = this.createSelectionRing();
    this.highlightsGroup.add(this.selectionRing);

    this.registerPlotPads();

    if (options.initialHouseModel) {
      this.mountBuildingMesh('plot_pad_0', 'starter_house', 1, options.initialHouseModel, false);
    }

    if (!this.coinTemplate) {
      void this.preloadCoinTemplate();
    }
  }

  getPlotPadIds(): string[] {
    return Array.from(this.padNodes.keys());
  }

  getPadPosition(tileId: string): THREE.Vector3 | null {
    const pos = this.padPositions.get(tileId);
    return pos ? pos.clone() : null;
  }

  getMountedBuildingTypes(): Record<string, BuildingType> {
    const out: Record<string, BuildingType> = {};
    for (const [tileId, entry] of this.mountedBuildings.entries()) {
      out[tileId] = entry.type;
    }
    return out;
  }

  getSelectedTileId(): string | null {
    return this.selectedTileId;
  }

  getPlacementBuildingType(): BuildingType | null {
    return this.placementBuildingType;
  }

  getVisiblePlacementPadIds(): string[] {
    const visible: string[] = [];
    for (const [tileId, ring] of this.placementRings.entries()) {
      if (ring.visible) {
        visible.push(tileId);
      }
    }
    return visible;
  }

  getActivePopupCount(): number {
    return this.floatingPopups.length;
  }

  getRaycastTargets(): THREE.Object3D[] {
    const targets: THREE.Object3D[] = Array.from(this.padNodes.values());
    for (const mounted of this.mountedBuildings.values()) {
      targets.push(mounted.root);
    }
    return targets;
  }

  setSelectedTile(tileId: string | null): void {
    this.selectedTileId = tileId;
    if (!tileId) {
      this.selectionRing.visible = false;
      this.updateGhostPreviewTransform();
      return;
    }

    const pos = this.padPositions.get(tileId);
    if (!pos) {
      this.selectionRing.visible = false;
      this.updateGhostPreviewTransform();
      return;
    }

    this.selectionRing.position.set(pos.x, pos.y + 0.055, pos.z);
    this.selectionRing.visible = true;
    this.updateGhostPreviewTransform();
  }

  /**
   * Toggles build placement mode, highlighting all empty unlocked plot pads and
   * loading a translucent ghost `.glb` preview of the chosen building.
   */
  setPlacementMode(buildingType: BuildingType | null): void {
    if (this.disposed) return;
    this.placementBuildingType = buildingType;
    this.refreshPlacementHighlights();

    if (!buildingType) {
      this.clearGhostPreview();
      return;
    }

    if (this.ghostPreviewType === buildingType && this.ghostPreviewMesh) {
      this.updateGhostPreviewTransform();
      return;
    }

    this.ghostPreviewType = buildingType;
    const token = ++this.ghostPreviewToken;
    const modelPath = BUILDING_MODEL_PATHS[buildingType];
    if (!modelPath) {
      this.clearGhostPreview();
      return;
    }

    void this.assetLoader
      .loadModel(modelPath, { castShadow: false, receiveShadow: false })
      .then((model) => {
        if (this.disposed || token !== this.ghostPreviewToken || this.placementBuildingType !== buildingType) {
          return;
        }
        this.clearGhostPreview();
        this.ghostPreviewType = buildingType;
        model.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.material = this.ghostMaterial;
            obj.castShadow = false;
            obj.receiveShadow = false;
          }
        });
        this.ghostPreviewMesh = model;
        this.ghostGroup.add(model);
        this.updateGhostPreviewTransform();
      })
      .catch(() => {
        // Ignore preview load errors cleanly; mint placement rings still guide the user.
      });
  }

  /**
   * Declaratively synchronizes mounted 3D buildings, tiers, and ready-coin indicators
   * with the pure-TS GameState island snapshot.
   */
  syncFromState(state: Pick<GameState, 'island'>): void {
    if (this.disposed) return;

    this.tilesSnapshot = state.island.tiles;
    this.unlockedRing = state.island.unlockedRing;
    this.dugHoles = state.island.dugHoles;

    const activeTileIds = new Set<string>();

    for (const [tileId, tile] of Object.entries(state.island.tiles)) {
      if (!tile.building) continue;
      if (!this.padPositions.has(tileId)) continue;
      activeTileIds.add(tileId);

      const existing = this.mountedBuildings.get(tileId);
      const hasPending = tile.building === 'hamburger_stand' && Math.floor(tile.pendingCoins ?? 0) >= 1;

      if (existing && existing.type === tile.building) {
        if (existing.tier !== tile.buildingTier) {
          existing.tier = tile.buildingTier;
          existing.baseScale = getBuildingTierScale(tile.building, tile.buildingTier);
          existing.popProgress = 0;
        }
        existing.hasPendingCoins = hasPending;
        if (existing.coinBadge) {
          existing.coinBadge.visible = hasPending;
        }
        continue;
      }

      if (existing) {
        this.unmountBuilding(tileId);
      }

      const modelPath = BUILDING_MODEL_PATHS[tile.building];
      if (!modelPath) continue;

      const loadKey = `${tile.building}:${tile.buildingTier}`;
      if (this.loadingKeys.get(tileId) === loadKey) {
        continue;
      }
      this.loadingKeys.set(tileId, loadKey);

      const requestedType = tile.building;
      const requestedTier = tile.buildingTier;
      void this.assetLoader
        .loadModel(modelPath, { castShadow: true, receiveShadow: true })
        .then((model) => {
          if (this.disposed) return;
          if (this.loadingKeys.get(tileId) !== loadKey) return;
          this.loadingKeys.delete(tileId);

          const latestTile = this.tilesSnapshot[tileId];
          if (!latestTile || latestTile.building !== requestedType) {
            return;
          }
          const latestHasPending =
            requestedType === 'hamburger_stand' && Math.floor(latestTile.pendingCoins ?? 0) >= 1;
          this.mountBuildingMesh(tileId, requestedType, requestedTier, model, true, latestHasPending);
        })
        .catch(() => {
          if (this.loadingKeys.get(tileId) === loadKey) {
            this.loadingKeys.delete(tileId);
          }
        });
    }

    for (const tileId of Array.from(this.mountedBuildings.keys())) {
      if (!activeTileIds.has(tileId)) {
        this.unmountBuilding(tileId);
      }
    }

    this.refreshPlacementHighlights();
    this.updateGhostPreviewTransform();
  }

  /**
   * Animates the Toilet door swinging playfully when used.
   */
  triggerToiletFlush(tileId?: string): void {
    if (this.disposed) return;
    const target = tileId
      ? this.mountedBuildings.get(tileId)
      : Array.from(this.mountedBuildings.values()).find((b) => b.type === 'toilet');

    if (target) {
      target.doorAnimRemaining = DOOR_FLUSH_DURATION;
      target.popProgress = Math.min(target.popProgress, 0.35);
    }
  }

  /**
   * Vibrates the Starter House FrontDoor subtly when Dr. Bubblegum knocks!
   */
  triggerFrontDoorKnock(): void {
    if (this.disposed) return;
    const house = Array.from(this.mountedBuildings.values()).find(
      (b) => b.type === 'starter_house',
    );
    if (house) {
      house.doorAnimRemaining = DOOR_FLUSH_DURATION;
    }
  }

  /**
   * Spawns a projected floating text popup (`+15 JC`, `+5 JC`, etc.) above a tile,
   * accompanied by spinning 3D coin particles when accent is `'coin'`.
   */
  spawnFloatingPopup(
    tileId: string,
    text: string,
    accent: FloatingPopupAccent = 'coin',
  ): void {
    if (this.disposed) return;
    const pos = this.padPositions.get(tileId) ?? new THREE.Vector3(0, 0, 0);
    const anchor = new THREE.Vector3(pos.x, pos.y + 1.38, pos.z);

    this.popupSeq += 1;
    this.floatingPopups.push({
      id: this.popupSeq,
      text,
      accent,
      worldOrigin: anchor,
      elapsed: 0,
      duration: FLOAT_POPUP_DURATION,
    });

    if (accent === 'coin') {
      this.spawnCoinBurst(new THREE.Vector3(pos.x, pos.y + 0.95, pos.z), 4);
    }
  }

  /**
   * Advances building pop-ins, Hamburger Stand rooftop signs, coin indicators,
   * placement ring pulses, and floating popups.
   */
  update(dtSeconds: number): void {
    if (this.disposed) return;
    const dt = Math.max(0, Math.min(dtSeconds, 0.05));
    this.elapsedSec += dt;

    if (this.selectionRing.visible) {
      const pulse = 1 + 0.06 * Math.sin(this.elapsedSec * 4.5);
      this.selectionRing.scale.set(pulse, 1, pulse);
    }

    if (this.placementBuildingType) {
      const ringPulse = 1 + 0.075 * Math.sin(this.elapsedSec * 5.2);
      this.placementRingMaterial.opacity = 0.58 + 0.25 * Math.sin(this.elapsedSec * 5.2);
      for (const ring of this.placementRings.values()) {
        if (ring.visible) {
          ring.scale.set(ringPulse, 1, ringPulse);
        }
      }
      if (this.ghostPreviewMesh && this.ghostPreviewMesh.visible) {
        this.ghostPreviewMesh.position.y =
          PAD_SURFACE_Y + 0.05 + 0.045 * Math.sin(this.elapsedSec * 3.8);
      }
    }

    for (const mounted of this.mountedBuildings.values()) {
      // Elastic pop-in scale when placed or upgraded
      if (mounted.popProgress < 1) {
        mounted.popProgress = Math.min(1, mounted.popProgress + dt * 2.8);
        const t = mounted.popProgress;
        const overshoot = 1 + Math.sin(t * Math.PI) * 0.16;
        const scale = mounted.baseScale * THREE.MathUtils.lerp(0.15, 1, t) * overshoot;
        mounted.root.scale.setScalar(scale);
      } else {
        mounted.root.scale.setScalar(mounted.baseScale);
      }

      // Toilet door playful wiggle on flush / Starter House FrontDoor rattle on Dr. Bubblegum knock
      if (mounted.doorNode) {
        if (mounted.doorAnimRemaining > 0) {
          mounted.doorAnimRemaining = Math.max(0, mounted.doorAnimRemaining - dt);
          const p = 1 - mounted.doorAnimRemaining / DOOR_FLUSH_DURATION;
          const amp = mounted.type === 'starter_house' ? 0.16 : 0.45;
          const freq = mounted.type === 'starter_house' ? Math.PI * 4 : Math.PI * 2;
          mounted.doorNode.rotation.y = mounted.doorBaseRotY + Math.sin(p * freq) * amp;
        } else {
          mounted.doorNode.rotation.y = mounted.doorBaseRotY;
        }
      }

      // Hamburger Stand rooftop burger sign bob & floating ready coin indicator
      if (mounted.burgerSignNode) {
        const bobSpeed = mounted.hasPendingCoins ? 4.2 : 1.9;
        const bobAmp = mounted.hasPendingCoins ? 0.06 : 0.025;
        mounted.burgerSignNode.position.y =
          mounted.burgerSignBaseY + Math.sin(this.elapsedSec * bobSpeed) * bobAmp;
        mounted.burgerSignNode.rotation.y = Math.sin(this.elapsedSec * 1.4) * 0.14;
      }

      if (mounted.coinBadge && mounted.coinBadge.visible) {
        mounted.coinBadge.position.y = 1.72 + Math.sin(this.elapsedSec * 4.4) * 0.09;
        mounted.coinBadge.rotation.y = this.elapsedSec * 2.6;
      }
    }

    for (let i = this.floatingPopups.length - 1; i >= 0; i -= 1) {
      const popup = this.floatingPopups[i];
      if (!popup) continue;
      popup.elapsed += dt;
      if (popup.elapsed >= popup.duration) {
        this.floatingPopups.splice(i, 1);
      }
    }

    for (let i = this.coinBursts.length - 1; i >= 0; i -= 1) {
      const burst = this.coinBursts[i];
      if (!burst) continue;
      burst.elapsed += dt;
      const t = Math.min(1, burst.elapsed / burst.duration);
      burst.velocity.y -= 5.2 * dt;
      burst.mesh.position.addScaledVector(burst.velocity, dt);
      burst.mesh.rotation.y += dt * 9.0;
      burst.mesh.scale.setScalar(Math.max(0.01, (1 - t * 0.7) * 0.9));
      if (t >= 1) {
        this.fxGroup.remove(burst.mesh);
        this.coinBursts.splice(i, 1);
      }
    }
  }

  /**
   * Projects active 3D floating `+JC` popups into 2D viewport CSS coordinates.
   */
  projectFloatingPopups(
    camera: THREE.Camera,
    viewportWidth: number,
    viewportHeight: number,
  ): ProjectedFloatingPopup[] {
    if (this.floatingPopups.length === 0 || viewportWidth <= 0 || viewportHeight <= 0) {
      return [];
    }

    this.group.updateWorldMatrix(true, false);
    const projected: ProjectedFloatingPopup[] = [];

    for (const popup of this.floatingPopups) {
      const t = Math.min(1, popup.elapsed / popup.duration);
      const riseY = t * 0.95;

      this.tempWorld
        .copy(popup.worldOrigin)
        .add(new THREE.Vector3(0, riseY, 0))
        .applyMatrix4(this.group.matrixWorld);
      this.tempProjected.copy(this.tempWorld).project(camera);

      const inFront = this.tempProjected.z >= -1 && this.tempProjected.z <= 1;
      const rawX = (this.tempProjected.x * 0.5 + 0.5) * viewportWidth;
      const rawY = (-this.tempProjected.y * 0.5 + 0.5) * viewportHeight;

      const opacity = t < 0.2 ? t / 0.2 : t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1;
      const scale = t < 0.18 ? 0.78 + (t / 0.18) * 0.3 : 1.08 - t * 0.12;

      projected.push({
        id: popup.id,
        text: popup.text,
        accent: popup.accent,
        x: THREE.MathUtils.clamp(rawX, 54, Math.max(54, viewportWidth - 54)),
        y: THREE.MathUtils.clamp(rawY, 84, Math.max(84, viewportHeight - 120)),
        opacity,
        scale,
        visible: inFront,
      });
    }

    return projected;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.clearGhostPreview();

    for (const burst of this.coinBursts) {
      this.fxGroup.remove(burst.mesh);
    }
    this.coinBursts.length = 0;
    this.floatingPopups.length = 0;

    for (const tileId of Array.from(this.mountedBuildings.keys())) {
      this.unmountBuilding(tileId);
    }

    this.placementRingGeometry.dispose();
    this.placementRingMaterial.dispose();
    this.ghostMaterial.dispose();
    this.fallbackCoinGeometry.dispose();
    this.fallbackCoinMaterial.dispose();

    this.selectionRing.geometry.dispose();
    if (Array.isArray(this.selectionRing.material)) {
      for (const m of this.selectionRing.material) m.dispose();
    } else {
      this.selectionRing.material.dispose();
    }

    this.group.removeFromParent();
  }

  private createSelectionRing(): THREE.Mesh {
    const ringGeo = new THREE.RingGeometry(0.76, 0.94, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#ff6b9d',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = 'PlotSelectionRing';
    ring.visible = false;
    ring.position.y = 0.055;
    return ring;
  }

  private registerPlotPads(): void {
    this.islandModel.updateMatrixWorld(true);
    this.islandModel.traverse((child) => {
      if (!CANONICAL_PLOT_PAD_RE.test(child.name)) return;
      if (this.padNodes.has(child.name)) return;

      const worldPos = new THREE.Vector3();
      child.getWorldPosition(worldPos);
      const localPos = this.group.worldToLocal(worldPos.clone());
      localPos.y = 0;

      this.padNodes.set(child.name, child);
      this.padPositions.set(child.name, localPos);
      tagSubtreeTileId(child, child.name);

      const placementRing = new THREE.Mesh(
        this.placementRingGeometry,
        this.placementRingMaterial,
      );
      placementRing.name = `PlacementRing_${child.name}`;
      placementRing.position.set(localPos.x, 0.05, localPos.z);
      placementRing.visible = false;
      this.highlightsGroup.add(placementRing);
      this.placementRings.set(child.name, placementRing);
    });
  }

  private isTileValidForPlacement(tileId: string): boolean {
    const tile = this.tilesSnapshot[tileId];
    if (!tile) return false;
    return (
      tile.ring <= this.unlockedRing &&
      tile.building === null &&
      !this.dugHoles.includes(tileId)
    );
  }

  private refreshPlacementHighlights(): void {
    const active = this.placementBuildingType !== null;
    for (const [tileId, ring] of this.placementRings.entries()) {
      ring.visible = active && this.isTileValidForPlacement(tileId);
    }
  }

  private updateGhostPreviewTransform(): void {
    if (!this.ghostPreviewMesh || !this.placementBuildingType) {
      return;
    }

    const candidateTileId =
      this.selectedTileId && this.isTileValidForPlacement(this.selectedTileId)
        ? this.selectedTileId
        : Array.from(this.padNodes.keys()).find((id) => this.isTileValidForPlacement(id)) ?? null;

    if (!candidateTileId) {
      this.ghostPreviewMesh.visible = false;
      return;
    }

    const pos = this.padPositions.get(candidateTileId);
    if (!pos) {
      this.ghostPreviewMesh.visible = false;
      return;
    }

    this.ghostPreviewMesh.visible = true;
    this.ghostPreviewMesh.position.set(pos.x, PAD_SURFACE_Y + 0.05, pos.z);
    this.ghostPreviewMesh.rotation.y = computeBuildingRotationY(candidateTileId, pos);
  }

  private clearGhostPreview(): void {
    if (this.ghostPreviewMesh) {
      this.ghostGroup.remove(this.ghostPreviewMesh);
      this.ghostPreviewMesh = null;
    }
    this.ghostPreviewType = null;
  }

  private mountBuildingMesh(
    tileId: string,
    type: BuildingType,
    tier: number,
    model: THREE.Object3D,
    animatePop: boolean,
    hasPendingCoins = false,
  ): void {
    const pos = this.padPositions.get(tileId);
    if (!pos) return;

    const root = new THREE.Group();
    root.name = `Building_${type}_${tileId}`;
    root.position.set(pos.x, PAD_SURFACE_Y, pos.z);
    root.rotation.y = computeBuildingRotationY(tileId, pos);

    const baseScale = getBuildingTierScale(type, tier);
    root.scale.setScalar(animatePop ? baseScale * 0.15 : baseScale);
    root.add(model);

    const doorNode =
      type === 'starter_house'
        ? model.getObjectByName('FrontDoor') ?? null
        : model.getObjectByName('ToiletDoor') ?? null;
    const burgerSignNode = model.getObjectByName('BurgerSign') ?? null;

    let coinBadge: THREE.Object3D | null = null;
    if (type === 'hamburger_stand') {
      coinBadge = this.createCoinInstance(1.1);
      coinBadge.name = 'StandPendingCoinBadge';
      coinBadge.position.set(0, 1.72, 0);
      coinBadge.visible = hasPendingCoins;
      root.add(coinBadge);
    }

    tagSubtreeTileId(root, tileId);
    this.buildingsGroup.add(root);

    this.mountedBuildings.set(tileId, {
      tileId,
      type,
      tier,
      root,
      model,
      baseScale,
      popProgress: animatePop ? 0 : 1,
      doorNode,
      doorBaseRotY: doorNode ? doorNode.rotation.y : 0,
      doorAnimRemaining: 0,
      burgerSignNode,
      burgerSignBaseY: burgerSignNode ? burgerSignNode.position.y : 0,
      coinBadge,
      hasPendingCoins,
    });
  }

  private unmountBuilding(tileId: string): void {
    const existing = this.mountedBuildings.get(tileId);
    if (!existing) return;
    this.buildingsGroup.remove(existing.root);
    this.mountedBuildings.delete(tileId);
  }

  private createCoinInstance(scale = 0.85): THREE.Object3D {
    if (this.coinTemplate) {
      const clone = this.coinTemplate.clone(true);
      clone.scale.setScalar(scale);
      return clone;
    }
    const mesh = new THREE.Mesh(this.fallbackCoinGeometry, this.fallbackCoinMaterial);
    mesh.scale.setScalar(scale);
    return mesh;
  }

  private spawnCoinBurst(origin: THREE.Vector3, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const coin = this.createCoinInstance(0.75);
      coin.position.copy(origin);
      this.fxGroup.add(coin);

      const angle = (Math.PI * 2 * i) / count + this.elapsedSec * 0.5;
      const horizSpeed = 0.72 + (i % 2) * 0.28;
      this.coinBursts.push({
        mesh: coin,
        velocity: new THREE.Vector3(
          Math.cos(angle) * horizSpeed,
          2.2 + (i % 2) * 0.45,
          Math.sin(angle) * horizSpeed,
        ),
        elapsed: 0,
        duration: COIN_BURST_DURATION,
      });
    }
  }

  private async preloadCoinTemplate(): Promise<void> {
    try {
      const coinModel = await this.assetLoader.loadModel(COIN_MODEL_PATH, {
        castShadow: false,
        receiveShadow: false,
      });
      if (this.disposed) return;
      this.coinTemplate = coinModel;

      // Upgrade any already-mounted Hamburger Stand coin badge from fallback mesh to .glb
      for (const mounted of this.mountedBuildings.values()) {
        if (mounted.type === 'hamburger_stand' && mounted.coinBadge) {
          const wasVisible = mounted.coinBadge.visible;
          mounted.root.remove(mounted.coinBadge);
          const upgraded = this.createCoinInstance(1.1);
          upgraded.name = 'StandPendingCoinBadge';
          upgraded.position.set(0, 1.72, 0);
          upgraded.visible = wasVisible;
          tagSubtreeTileId(upgraded, mounted.tileId);
          mounted.root.add(upgraded);
          mounted.coinBadge = upgraded;
        }
      }
    } catch {
      // Fallback gold cylinder coin stays active cleanly.
    }
  }
}
