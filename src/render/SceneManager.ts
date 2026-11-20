import * as THREE from 'three';
import type { BuildingType, GameMode, GameState, JellyBeanEntity } from '../sim/types';
import { AssetLoader } from './AssetLoader';
import {
  BeanView,
  LARVA_BED_POSITION,
  LARVA_HOME_POSITION,
  type ProjectedBubblePosition,
} from './BeanView';
import {
  findCanonicalPlotPad,
  IslandView,
  resolveTileIdFromHit,
  type FloatingPopupAccent,
  type ProjectedFloatingPopup,
} from './IslandView';
import { TouchCameraController, type TapEvent } from './TouchCameraController';

export { findCanonicalPlotPad };

export type SceneStatus = 'loading' | 'ready' | 'context-lost' | 'error';

export interface SceneManagerOptions {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  assetLoader?: AssetLoader;
  lowPowerMode?: boolean;
  onStatusChange?: (status: SceneStatus, message?: string) => void;
  onPadSelect?: (padName: string | null) => void;
  onBeanTap?: (beanId: string) => void;
  onFrameUpdate?: (
    dtSeconds: number,
    bubblePosition: ProjectedBubblePosition | null,
    floatingPopups?: readonly ProjectedFloatingPopup[],
  ) => void;
}

const STARTER_ISLAND_MODEL = 'assets/models/island_ring0.glb';
const STARTER_HOUSE_MODEL = 'assets/models/starter_house.glb';
const BED_PROP_MODEL = 'assets/models/bed_prop.glb';
const LARVA_MODEL = 'assets/models/jellybean_larva.glb';
const APPLE_MODEL = 'assets/models/apple.glb';

const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldDirection;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDirection = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uTopColor;
  uniform vec3 uMidColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uBottomColor;
  varying vec3 vWorldDirection;

  void main() {
    float h = normalize(vWorldDirection).y;
    vec3 color;
    if (h >= 0.0) {
      float tMid = smoothstep(0.0, 0.32, h);
      float tTop = smoothstep(0.28, 0.88, h);
      color = mix(uHorizonColor, uMidColor, tMid);
      color = mix(color, uTopColor, tTop);
    } else {
      float tBot = smoothstep(0.0, -0.35, h);
      color = mix(uHorizonColor, uBottomColor, tBot);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

const OCEAN_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const OCEAN_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallowColor;
  uniform vec3 uDeepColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uFoamColor;
  varying vec3 vWorldPos;

  void main() {
    float dist = length(vWorldPos.xz);

    // Gentle stylized wave shimmer bands
    float waveA = sin(vWorldPos.x * 0.55 + uTime * 0.85 + cos(vWorldPos.z * 0.42 - uTime * 0.45));
    float waveB = cos(vWorldPos.z * 0.62 - uTime * 0.72 + sin(vWorldPos.x * 0.35 + uTime * 0.3));
    float shimmer = smoothstep(0.45, 0.98, 0.5 + 0.25 * waveA + 0.25 * waveB);

    // Soft pastel seafoam halo beneath the floating island
    float islandRing = exp(-pow((dist - 4.35) / 1.45, 2.0));
    float ripple = 0.5 + 0.5 * sin(dist * 2.4 - uTime * 1.6);
    float foamMask = islandRing * (0.28 + 0.22 * ripple);

    // Subtle cool shadow directly underneath the island center
    float underShadow = 1.0 - 0.14 * exp(-pow(dist / 3.8, 2.0));

    float depthBlend = smoothstep(4.0, 26.0, dist);
    vec3 water = mix(uShallowColor, uDeepColor, depthBlend) * underShadow;
    water = mix(water, uFoamColor, shimmer * 0.13 + foamMask);

    // Blend seamlessly into the pastel horizon
    float horizonFade = smoothstep(26.0, 74.0, dist);
    vec3 finalColor = mix(water, uHorizonColor, horizonFade);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function disposeSceneObjects(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (obj.geometry) {
        geometries.add(obj.geometry);
      }
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of list) {
        if (mat) {
          materials.add(mat);
        }
      }
    }
  });

  for (const mat of materials) {
    mat.dispose();
  }
  for (const geo of geometries) {
    geo.dispose();
  }
}

/**
 * Imperative 60 FPS Three.js diorama renderer for Jelly Bean Simulator.
 * Manages WebGLRenderer, lighting, sky/ocean backdrop, island loading,
 * raycasted tile selection, resize, visibility pause, and context-loss recovery.
 */
export class SceneManager {
  private readonly canvas: HTMLCanvasElement;
  private readonly container: HTMLElement;
  private readonly assetLoader: AssetLoader;
  private readonly ownsAssetLoader: boolean;
  private readonly onStatusChange?: (status: SceneStatus, message?: string) => void;
  private readonly onPadSelect?: (padName: string | null) => void;
  private readonly onBeanTap?: (beanId: string) => void;
  private readonly onFrameUpdate?: (
    dtSeconds: number,
    bubblePosition: ProjectedBubblePosition | null,
    floatingPopups?: readonly ProjectedFloatingPopup[],
  ) => void;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly cameraController: TouchCameraController;
  private readonly raycaster = new THREE.Raycaster();

  private readonly islandAnchor = new THREE.Group();
  private readonly cloudGroup = new THREE.Group();

  private islandView: IslandView | null = null;
  private beanView: BeanView | null = null;
  private pendingBeanState: { bean: JellyBeanEntity; mode: GameMode } | null = null;
  private pendingIslandState: Pick<GameState, 'island'> | null = null;
  private pendingPlacementMode: BuildingType | null = null;
  private viewportWidth: number;
  private viewportHeight: number;
  private oceanUniforms: { uTime: { value: number } } | null = null;
  private lowPowerMode: boolean;
  private resizeObserver: ResizeObserver | null = null;
  private rafId: number | null = null;
  private lastFrameMs = 0;
  private elapsedSeconds = 0;
  private selectedPadName: string | null = null;
  private status: SceneStatus = 'loading';
  private contextLost = false;
  private disposed = false;

  constructor(options: SceneManagerOptions) {
    this.canvas = options.canvas;
    this.container = options.container;
    this.ownsAssetLoader = !options.assetLoader;
    this.assetLoader = options.assetLoader ?? new AssetLoader();
    this.lowPowerMode = options.lowPowerMode ?? false;
    this.onStatusChange = options.onStatusChange;
    this.onPadSelect = options.onPadSelect;
    this.onBeanTap = options.onBeanTap;
    this.onFrameUpdate = options.onFrameUpdate;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#c8ecff');

    const { width, height } = this.measureContainer();
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.2, 160);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.lowPowerMode,
      alpha: false,
      powerPreference: this.lowPowerMode ? 'low-power' : 'high-performance',
    });
    this.configureRenderer(width, height);

    this.setupLighting();
    this.setupSkyAndOcean();
    this.setupClouds();

    this.islandAnchor.name = 'IslandAnchor';
    this.scene.add(this.islandAnchor);

    this.cameraController = new TouchCameraController(this.camera, this.canvas, {
      target: new THREE.Vector3(0, -0.45, 0),
      framingRadius: 5.45,
      onTap: (tap) => this.handleCanvasTap(tap),
    });

    this.bindLifecycleListeners();
    this.setStatus('loading');
    void this.loadStarterIsland();
    this.startLoop();
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getIslandAnchor(): THREE.Group {
    return this.islandAnchor;
  }

  getAssetLoader(): AssetLoader {
    return this.assetLoader;
  }

  getCameraController(): TouchCameraController {
    return this.cameraController;
  }

  getBeanView(): BeanView | null {
    return this.beanView;
  }

  getIslandView(): IslandView | null {
    return this.islandView;
  }

  syncBeanState(bean: JellyBeanEntity, mode: GameMode = 'regular'): void {
    this.pendingBeanState = { bean, mode };
    this.beanView?.syncState(bean, mode);
  }

  syncIslandState(state: Pick<GameState, 'island'>): void {
    this.pendingIslandState = state;
    this.islandView?.syncFromState(state);
  }

  setPlacementMode(buildingType: BuildingType | null): void {
    this.pendingPlacementMode = buildingType;
    this.islandView?.setPlacementMode(buildingType);
  }

  setSelectedPad(padName: string | null): void {
    this.selectedPadName = padName;
    this.islandView?.setSelectedTile(padName);
  }

  spawnTilePopup(tileId: string, text: string, accent: FloatingPopupAccent = 'coin'): void {
    this.islandView?.spawnFloatingPopup(tileId, text, accent);
  }

  triggerToiletFlush(tileId?: string): void {
    this.islandView?.triggerToiletFlush(tileId);
  }

  triggerFeedApple(): void {
    this.beanView?.triggerFeedApple();
  }

  triggerHappyBounce(): void {
    this.beanView?.triggerHappyBounce();
  }

  resetCamera(): void {
    this.cameraController.resetView(false);
  }

  setLowPowerMode(enabled: boolean): void {
    if (this.lowPowerMode === enabled) return;
    this.lowPowerMode = enabled;
    const { width, height } = this.measureContainer();
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.configureRenderer(width, height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.stopLoop();
    this.unbindLifecycleListeners();
    this.cameraController.dispose();

    this.beanView?.dispose();
    this.beanView = null;

    this.islandView?.dispose();
    this.islandView = null;

    disposeSceneObjects(this.scene);
    if (this.ownsAssetLoader) {
      this.assetLoader.clearCache();
    }
    this.renderer.dispose();
  }

  private setStatus(nextStatus: SceneStatus, message?: string): void {
    this.status = nextStatus;
    this.onStatusChange?.(nextStatus, message);
  }

  private measureContainer(): { width: number; height: number } {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || window.innerWidth || 390));
    const height = Math.max(1, Math.round(rect.height || window.innerHeight || 844));
    return { width, height };
  }

  private configureRenderer(width: number, height: number): void {
    const maxDpr = this.lowPowerMode ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  private setupLighting(): void {
    const hemiLight = new THREE.HemisphereLight('#f2fbff', '#9fe0b4', 1.15);
    hemiLight.position.set(0, 20, 0);
    this.scene.add(hemiLight);

    // Single shadow-casting directional sun light (1024x1024 shadow map per iPhone budget)
    const sunLight = new THREE.DirectionalLight('#fff6e5', 1.65);
    sunLight.position.set(9.5, 16.5, 10.5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 36;
    sunLight.shadow.camera.left = -8.5;
    sunLight.shadow.camera.right = 8.5;
    sunLight.shadow.camera.top = 8.5;
    sunLight.shadow.camera.bottom = -8.5;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.025;
    this.scene.add(sunLight);

    // Subtle non-shadow bounce rim light so candy clay reads warmly from behind
    const rimLight = new THREE.DirectionalLight('#ffd9eb', 0.42);
    rimLight.position.set(-10, 6, -9);
    this.scene.add(rimLight);
  }

  private setupSkyAndOcean(): void {
    const skyGeo = new THREE.SphereGeometry(92, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: new THREE.Color('#6ec8fa') },
        uMidColor: { value: new THREE.Color('#b6e6ff') },
        uHorizonColor: { value: new THREE.Color('#e3f7ff') },
        uBottomColor: { value: new THREE.Color('#9edcf8') },
      },
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
    });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    skyDome.name = 'SkyDome';
    skyDome.renderOrder = -2;
    this.scene.add(skyDome);

    const oceanUniforms = {
      uTime: { value: 0 },
      uShallowColor: { value: new THREE.Color('#80d9fa') },
      uDeepColor: { value: new THREE.Color('#57bce8') },
      uHorizonColor: { value: new THREE.Color('#e3f7ff') },
      uFoamColor: { value: new THREE.Color('#f5fdff') },
    };
    this.oceanUniforms = oceanUniforms;

    const oceanGeo = new THREE.CircleGeometry(82, 48);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMat = new THREE.ShaderMaterial({
      uniforms: oceanUniforms,
      vertexShader: OCEAN_VERTEX_SHADER,
      fragmentShader: OCEAN_FRAGMENT_SHADER,
    });
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.name = 'CandyOcean';
    oceanMesh.position.y = -3.15;
    oceanMesh.receiveShadow = false;
    this.scene.add(oceanMesh);
  }

  private setupClouds(): void {
    this.cloudGroup.name = 'PastelClouds';
    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.92,
      metalness: 0.0,
    });
    const puffGeo = new THREE.IcosahedronGeometry(1, 1);

    const cloudSpecs: ReadonlyArray<{ x: number; y: number; z: number; scale: number }> = [
      { x: -16, y: 4.8, z: -24, scale: 1.45 },
      { x: 17, y: 4.2, z: -20, scale: 1.2 },
      { x: 22, y: 5.4, z: 14, scale: 1.3 },
      { x: -20, y: 3.8, z: 16, scale: 1.1 },
    ];

    for (const spec of cloudSpecs) {
      const cluster = new THREE.Group();
      cluster.position.set(spec.x, spec.y, spec.z);
      cluster.scale.setScalar(spec.scale);

      const offsets: ReadonlyArray<[number, number, number, number]> = [
        [0, 0, 0, 1.2],
        [-1.05, -0.18, 0.15, 0.85],
        [1.1, -0.22, -0.1, 0.92],
        [0.35, 0.42, 0.2, 0.78],
      ];

      for (const [ox, oy, oz, r] of offsets) {
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        puff.position.set(ox, oy, oz);
        puff.scale.set(r * 1.15, r * 0.75, r * 0.95);
        cluster.add(puff);
      }

      this.cloudGroup.add(cluster);
    }

    this.scene.add(this.cloudGroup);
  }

  private async loadStarterIsland(): Promise<void> {
    try {
      const [islandModel, houseModel, bedModel, larvaModel, appleModel] = await Promise.all([
        this.assetLoader.loadModel(STARTER_ISLAND_MODEL, {
          castShadow: true,
          receiveShadow: true,
        }),
        this.assetLoader.loadModel(STARTER_HOUSE_MODEL, {
          castShadow: true,
          receiveShadow: true,
        }),
        this.assetLoader.loadModel(BED_PROP_MODEL, {
          castShadow: true,
          receiveShadow: true,
        }),
        this.assetLoader.loadModel(LARVA_MODEL, {
          castShadow: true,
          receiveShadow: false,
        }),
        this.assetLoader.loadModel(APPLE_MODEL, {
          castShadow: true,
          receiveShadow: false,
        }),
      ]);

      if (this.disposed) {
        return;
      }

      // Mount IslandView managing raycastable plot pads, buildings, ghost highlights & popups
      this.islandView = new IslandView({
        islandModel,
        assetLoader: this.assetLoader,
        initialHouseModel: houseModel,
      });
      this.islandAnchor.add(this.islandView.group);

      if (this.pendingIslandState) {
        this.islandView.syncFromState(this.pendingIslandState);
      }
      if (this.pendingPlacementMode) {
        this.islandView.setPlacementMode(this.pendingPlacementMode);
      }
      if (this.selectedPadName) {
        this.islandView.setSelectedTile(this.selectedPadName);
      }

      // Place Cozy Pastel Bed nestled in the front-left meadow pocket
      bedModel.position.set(LARVA_BED_POSITION.x, 0.0, LARVA_BED_POSITION.z);
      bedModel.rotation.y = 0.56;
      this.islandAnchor.add(bedModel);

      // Mount animated Larva Jelly Bean View
      this.beanView = new BeanView({
        larvaModel,
        appleTemplate: appleModel,
        homePosition: LARVA_HOME_POSITION,
        bedPosition: LARVA_BED_POSITION,
      });
      if (this.pendingBeanState) {
        this.beanView.syncState(this.pendingBeanState.bean, this.pendingBeanState.mode);
      }
      this.islandAnchor.add(this.beanView.group);

      if (!this.contextLost) {
        this.setStatus('ready');
      }
    } catch (error: unknown) {
      if (this.disposed) return;
      const message = error instanceof Error ? error.message : 'Failed to load starter island';
      this.setStatus('error', message);
    }
  }

  private handleCanvasTap(tap: TapEvent): void {
    if (this.disposed || this.contextLost) {
      return;
    }

    this.raycaster.setFromCamera(new THREE.Vector2(tap.ndcX, tap.ndcY), this.camera);

    // Prioritize tapping directly on the Jelly Bean for instant tactile petting
    // (unless the player is actively choosing a pad to place a building!)
    if (this.beanView && !this.pendingPlacementMode) {
      const beanHits = this.raycaster.intersectObjects(this.beanView.getRaycastTargets(), true);
      if (beanHits.length > 0) {
        this.beanView.triggerHappyBounce();
        this.onBeanTap?.(this.beanView.getBeanId());
        return;
      }
    }

    if (!this.islandView) {
      return;
    }

    const targets = this.islandView.getRaycastTargets();
    if (targets.length === 0) {
      return;
    }

    const hits = this.raycaster.intersectObjects(targets, true);

    if (hits.length > 0 && hits[0]) {
      const tileId = resolveTileIdFromHit(hits[0].object);
      if (tileId) {
        this.selectedPadName = tileId;
        this.islandView.setSelectedTile(tileId);
        this.onPadSelect?.(tileId);
        return;
      }
    }

    if (this.selectedPadName !== null) {
      this.selectedPadName = null;
      this.islandView.setSelectedTile(null);
      this.onPadSelect?.(null);
    }
  }

  private readonly handleResize = (): void => {
    if (this.disposed) return;
    const { width, height } = this.measureContainer();
    this.viewportWidth = width;
    this.viewportHeight = height;
    const aspect = width / height;

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.cameraController.setAspect(aspect);
    this.configureRenderer(width, height);
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.stopLoop();
    this.setStatus('context-lost', 'Graphics context paused — recovering...');
  };

  private readonly handleContextRestored = (): void => {
    if (this.disposed) return;
    this.contextLost = false;
    const { width, height } = this.measureContainer();
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.configureRenderer(width, height);
    this.setStatus(this.islandView ? 'ready' : 'loading');
    this.startLoop();
  };

  private readonly handleVisibilityChange = (): void => {
    if (this.disposed) return;
    if (document.hidden) {
      this.stopLoop();
    } else if (!this.contextLost) {
      this.lastFrameMs = performance.now();
      this.startLoop();
    }
  };

  private bindLifecycleListeners(): void {
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    }
  }

  private unbindLifecycleListeners(): void {
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  private startLoop(): void {
    if (this.disposed || this.rafId !== null || this.contextLost) {
      return;
    }
    this.lastFrameMs = performance.now();
    this.rafId = window.requestAnimationFrame(this.tickFrame);
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private readonly tickFrame = (nowMs: number): void => {
    if (this.disposed || this.contextLost) {
      this.rafId = null;
      return;
    }

    const rawDt = (nowMs - this.lastFrameMs) / 1000;
    this.lastFrameMs = nowMs;
    const dt = Math.max(0, Math.min(rawDt, 0.05));
    this.elapsedSeconds += dt;

    // Smooth camera orbit/zoom damping
    this.cameraController.update(dt);

    // Gentle cozy diorama floating bob & ambient motion
    this.islandAnchor.position.y = Math.sin(this.elapsedSeconds * 0.9) * 0.045;
    this.cloudGroup.rotation.y = this.elapsedSeconds * 0.012;

    if (this.oceanUniforms) {
      this.oceanUniforms.uTime.value = this.elapsedSeconds;
    }

    let floatingPopups: readonly ProjectedFloatingPopup[] = [];
    if (this.islandView) {
      this.islandView.update(dt);
      floatingPopups = this.islandView.projectFloatingPopups(
        this.camera,
        this.viewportWidth,
        this.viewportHeight,
      );
    }

    let bubblePosition: ProjectedBubblePosition | null = null;
    if (this.beanView) {
      this.beanView.update(dt);
      bubblePosition = this.beanView.projectSpeechBubble(
        this.camera,
        this.viewportWidth,
        this.viewportHeight,
      );
    }

    this.onFrameUpdate?.(dt, bubblePosition, floatingPopups);

    this.renderer.render(this.scene, this.camera);
    this.rafId = window.requestAnimationFrame(this.tickFrame);
  };

  getStatus(): SceneStatus {
    return this.status;
  }
}
