import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveAssetUrl } from '../utils/assets';

export interface GltfLoaderLike {
  loadAsync(url: string): Promise<GLTF>;
}

export interface LoadModelOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export interface AssetLoaderOptions {
  baseUrl?: string;
  loader?: GltfLoaderLike;
}

function disposeObjectResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (obj.geometry) {
        geometries.add(obj.geometry);
      }
      const matList = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of matList) {
        if (!mat) continue;
        materials.add(mat);
        for (const value of Object.values(mat)) {
          if (value instanceof THREE.Texture) {
            textures.add(value);
          }
        }
      }
    }
  });

  for (const texture of textures) {
    texture.dispose();
  }
  for (const material of materials) {
    material.dispose();
  }
  for (const geometry of geometries) {
    geometry.dispose();
  }
}

function applyShadowFlags(root: THREE.Object3D, options: LoadModelOptions): void {
  const { castShadow, receiveShadow } = options;
  if (castShadow === undefined && receiveShadow === undefined) {
    return;
  }
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (castShadow !== undefined) {
        obj.castShadow = castShadow;
      }
      if (receiveShadow !== undefined) {
        obj.receiveShadow = receiveShadow;
      }
    }
  });
}

/**
 * Cached glTF 2.0 (.glb) model loader with base-URL resolution and
 * in-flight request deduplication for GitHub Pages subpath hosting.
 */
export class AssetLoader {
  private readonly loader: GltfLoaderLike;
  private readonly baseUrl?: string;
  private readonly resolvedCache = new Map<string, GLTF>();
  private readonly inFlight = new Map<string, Promise<GLTF>>();

  constructor(options: AssetLoaderOptions = {}) {
    this.loader = options.loader ?? new GLTFLoader();
    this.baseUrl = options.baseUrl;
  }

  resolveUrl(relativePath: string): string {
    return resolveAssetUrl(relativePath, this.baseUrl);
  }

  hasCached(relativePath: string): boolean {
    return this.resolvedCache.has(this.resolveUrl(relativePath));
  }

  get cacheSize(): number {
    return this.resolvedCache.size;
  }

  async loadGltf(relativePath: string): Promise<GLTF> {
    const url = this.resolveUrl(relativePath);

    const cached = this.resolvedCache.get(url);
    if (cached) {
      return cached;
    }

    const pending = this.inFlight.get(url);
    if (pending) {
      return pending;
    }

    const request = this.loader
      .loadAsync(url)
      .then((gltf) => {
        this.resolvedCache.set(url, gltf);
        this.inFlight.delete(url);
        return gltf;
      })
      .catch((error: unknown) => {
        this.inFlight.delete(url);
        throw error;
      });

    this.inFlight.set(url, request);
    return request;
  }

  /**
   * Loads a cached .glb and returns an independent scene-graph clone
   * sharing underlying geometries and materials for low mobile GPU overhead.
   */
  async loadModel(relativePath: string, options: LoadModelOptions = {}): Promise<THREE.Group> {
    const gltf = await this.loadGltf(relativePath);
    const clone = gltf.scene.clone(true);
    applyShadowFlags(clone, options);
    return clone;
  }

  async preloadModels(relativePaths: readonly string[]): Promise<void> {
    await Promise.all(relativePaths.map((path) => this.loadGltf(path)));
  }

  clearCache(): void {
    for (const gltf of this.resolvedCache.values()) {
      disposeObjectResources(gltf.scene);
    }
    this.resolvedCache.clear();
    this.inFlight.clear();
  }
}
