import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');

interface GltfNode {
  name?: string;
  mesh?: number;
  translation?: [number, number, number];
  scale?: [number, number, number];
  children?: number[];
}

interface GltfPrimitive {
  indices?: number;
  attributes: { POSITION?: number };
  mode?: number;
}

interface GltfMesh {
  name?: string;
  primitives: GltfPrimitive[];
}

interface GltfAccessor {
  count: number;
  min?: number[];
  max?: number[];
}

interface GltfJson {
  nodes?: GltfNode[];
  meshes?: GltfMesh[];
  accessors?: GltfAccessor[];
  materials?: unknown[];
}

function parseGlbJsonChunk(buf: Buffer): GltfJson {
  expect(buf.subarray(0, 4).toString('ascii')).toBe('glTF');
  expect(buf.readUInt32LE(4)).toBe(2);
  const chunkLength = buf.readUInt32LE(12);
  const chunkType = buf.subarray(16, 20).toString('ascii');
  expect(chunkType).toBe('JSON');
  const jsonStr = buf.subarray(20, 20 + chunkLength).toString('utf8').trim();
  return JSON.parse(jsonStr) as GltfJson;
}

function countGlbTriangles(gltf: GltfJson): number {
  const meshes = gltf.meshes ?? [];
  const accessors = gltf.accessors ?? [];
  let total = 0;

  for (const mesh of meshes) {
    for (const prim of mesh.primitives) {
      const mode = prim.mode ?? 4; // 4 = TRIANGLES
      if (mode !== 4) continue;
      if (prim.indices !== undefined) {
        const count = accessors[prim.indices]?.count ?? 0;
        total += Math.floor(count / 3);
      } else if (prim.attributes.POSITION !== undefined) {
        const count = accessors[prim.attributes.POSITION]?.count ?? 0;
        total += Math.floor(count / 3);
      }
    }
  }
  return total;
}

function getMeshPositionBounds(gltf: GltfJson, meshIndex: number): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const mesh = gltf.meshes?.[meshIndex];
  const accessors = gltf.accessors ?? [];
  expect(mesh).toBeDefined();

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const prim of mesh?.primitives ?? []) {
    if (prim.attributes.POSITION === undefined) continue;
    const acc = accessors[prim.attributes.POSITION];
    if (!acc?.min || !acc?.max) continue;
    minX = Math.min(minX, acc.min[0] ?? Infinity);
    minY = Math.min(minY, acc.min[1] ?? Infinity);
    minZ = Math.min(minZ, acc.min[2] ?? Infinity);
    maxX = Math.max(maxX, acc.max[0] ?? -Infinity);
    maxY = Math.max(maxY, acc.max[1] ?? -Infinity);
    maxZ = Math.max(maxZ, acc.max[2] ?? -Infinity);
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

function assertIdentityRoot(node: GltfNode | undefined): void {
  expect(node).toBeDefined();
  if (node?.translation) {
    expect(node.translation.map((v) => Math.round(v * 1e5) / 1e5)).toEqual([0, 0, 0]);
  }
  if (node?.scale) {
    expect(node.scale.map((v) => Math.round(v * 1e5) / 1e5)).toEqual([1, 1, 1]);
  }
}

function readPngHeader(filepath: string): {
  width: number;
  height: number;
  colorType: number;
} {
  const buf = readFileSync(filepath);
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf.readUInt8(25),
  };
}

describe('PR-11 farm crops, apple tree & feather blanket Blender MCP asset pack', () => {
  it('commits reproducible Blender script and source .blend file', () => {
    expect(existsSync(resolve(ROOT, 'assets-src/scripts/build_farm_m3.py'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'assets-src/blend/farm_m3.blend'))).toBe(true);
  });

  it('exports all 4 canonical crops as instancing-ready single meshes <= 400 tris and <= 20 KB', () => {
    for (const [filename, rootName] of [
      ['crop_parsley.glb', 'crop_parsley'],
      ['crop_tomato.glb', 'crop_tomato'],
      ['crop_candycane.glb', 'crop_candycane'],
      ['crop_100beans.glb', 'crop_100beans'],
    ] as const) {
      const glbPath = resolve(ROOT, 'public/assets/models', filename);
      expect(existsSync(glbPath), `missing ${filename}`).toBe(true);

      const sizeBytes = statSync(glbPath).size;
      expect(sizeBytes).toBeGreaterThan(512);
      expect(sizeBytes).toBeLessThanOrEqual(20 * 1024);

      const gltf = parseGlbJsonChunk(readFileSync(glbPath));
      const tris = countGlbTriangles(gltf);
      expect(tris).toBeGreaterThan(40);
      expect(tris).toBeLessThanOrEqual(400);

      // Single mesh object at identity root with base seated at Y = 0 for clean scale-growth & instancing
      expect(gltf.meshes?.length).toBe(1);
      const root = (gltf.nodes ?? []).find((n) => n.name === rootName);
      assertIdentityRoot(root);
      expect(root?.mesh).toBe(0);

      const bounds = getMeshPositionBounds(gltf, 0);
      expect(Math.abs(bounds.min[1])).toBeLessThan(0.01);
      expect(bounds.max[1]).toBeGreaterThan(0.3);
    }
  });

  it('exports garden_plot.glb within 400 tris and 20 KB budgets with CropSocket child', () => {
    const glbPath = resolve(ROOT, 'public/assets/models/garden_plot.glb');
    expect(existsSync(glbPath)).toBe(true);

    const sizeBytes = statSync(glbPath).size;
    expect(sizeBytes).toBeGreaterThan(512);
    expect(sizeBytes).toBeLessThanOrEqual(20 * 1024);

    const gltf = parseGlbJsonChunk(readFileSync(glbPath));
    const tris = countGlbTriangles(gltf);
    expect(tris).toBeGreaterThan(60);
    expect(tris).toBeLessThanOrEqual(400);

    const nodes = gltf.nodes ?? [];
    const root = nodes.find((n) => n.name === 'garden_plot');
    assertIdentityRoot(root);

    const children = (root?.children ?? []).map((idx) => nodes[idx]);
    const cropSocket = children.find((n) => n?.name === 'CropSocket');
    expect(cropSocket).toBeDefined();
  });

  it('exports apple_tree.glb within 1,000 tris and 45 KB budgets with distinct CanopyApples child', () => {
    const glbPath = resolve(ROOT, 'public/assets/models/apple_tree.glb');
    expect(existsSync(glbPath)).toBe(true);

    const sizeBytes = statSync(glbPath).size;
    expect(sizeBytes).toBeGreaterThan(1024);
    expect(sizeBytes).toBeLessThanOrEqual(45 * 1024);

    const gltf = parseGlbJsonChunk(readFileSync(glbPath));
    const tris = countGlbTriangles(gltf);
    expect(tris).toBeGreaterThan(150);
    expect(tris).toBeLessThanOrEqual(1000);

    const nodes = gltf.nodes ?? [];
    const root = nodes.find((n) => n.name === 'apple_tree');
    assertIdentityRoot(root);

    const children = (root?.children ?? []).map((idx) => nodes[idx]);
    const canopyApples = children.find((n) => n?.name === 'CanopyApples');
    expect(canopyApples).toBeDefined();
    expect(canopyApples?.mesh).toBeDefined();
  });

  it('exports feather.glb and knitted_blanket.glb within 400 tris and 20 KB budgets', () => {
    for (const [filename, rootName] of [
      ['feather.glb', 'feather'],
      ['knitted_blanket.glb', 'knitted_blanket'],
    ] as const) {
      const glbPath = resolve(ROOT, 'public/assets/models', filename);
      expect(existsSync(glbPath), `missing ${filename}`).toBe(true);

      const sizeBytes = statSync(glbPath).size;
      expect(sizeBytes).toBeGreaterThan(512);
      expect(sizeBytes).toBeLessThanOrEqual(20 * 1024);

      const gltf = parseGlbJsonChunk(readFileSync(glbPath));
      const tris = countGlbTriangles(gltf);
      expect(tris).toBeGreaterThan(40);
      expect(tris).toBeLessThanOrEqual(400);

      const root = (gltf.nodes ?? []).find((n) => n.name === rootName);
      assertIdentityRoot(root);
    }
  });

  it('sizes knitted_blanket.glb to drape cleanly around jellybean_larva.glb without clipping body', () => {
    const larvaGltf = parseGlbJsonChunk(
      readFileSync(resolve(ROOT, 'public/assets/models/jellybean_larva.glb')),
    );
    const blanketGltf = parseGlbJsonChunk(
      readFileSync(resolve(ROOT, 'public/assets/models/knitted_blanket.glb')),
    );

    const larvaBodyNode = (larvaGltf.nodes ?? []).find((n) => n.name === 'Body');
    const blanketNode = (blanketGltf.nodes ?? []).find((n) => n.name === 'knitted_blanket');
    expect(larvaBodyNode?.mesh).toBeDefined();
    expect(blanketNode?.mesh).toBeDefined();

    // In glTF Y-up space: X is left/right, Y is height, +Z is front (-Y Blender), -Z is back (+Y Blender)
    const larvaBounds = getMeshPositionBounds(larvaGltf, larvaBodyNode!.mesh!);
    const blanketBounds = getMeshPositionBounds(blanketGltf, blanketNode!.mesh!);

    // Blanket must comfortably surround Larva left/right X width and back (-Z) tail cushion
    expect(blanketBounds.max[0]).toBeGreaterThan(larvaBounds.max[0] + 0.02);
    expect(blanketBounds.min[0]).toBeLessThan(larvaBounds.min[0] - 0.02);
    expect(blanketBounds.min[2]).toBeLessThan(larvaBounds.min[2] - 0.02);
    // Blanket base sits cleanly near Y = 0 and collar stays below crown so head/eyes peek out
    expect(Math.abs(blanketBounds.min[1])).toBeLessThan(0.01);
    expect(blanketBounds.max[1]).toBeLessThan(larvaBounds.max[1]);
  });

  it('exports feather_loom.glb within 1,500 tris and 65 KB budgets with LoomShuttle child', () => {
    const glbPath = resolve(ROOT, 'public/assets/models/feather_loom.glb');
    expect(existsSync(glbPath)).toBe(true);

    const sizeBytes = statSync(glbPath).size;
    expect(sizeBytes).toBeGreaterThan(1024);
    expect(sizeBytes).toBeLessThanOrEqual(65 * 1024);

    const gltf = parseGlbJsonChunk(readFileSync(glbPath));
    const tris = countGlbTriangles(gltf);
    expect(tris).toBeGreaterThan(150);
    expect(tris).toBeLessThanOrEqual(1500);

    const nodes = gltf.nodes ?? [];
    const root = nodes.find((n) => n.name === 'feather_loom');
    assertIdentityRoot(root);

    const children = (root?.children ?? []).map((idx) => nodes[idx]);
    const shuttle = children.find((n) => n?.name === 'LoomShuttle');
    expect(shuttle).toBeDefined();
    expect(shuttle?.mesh).toBeDefined();
  });

  it('renders 128x128 transparent RGBA studio PNG icons for all 9 M3 farm & blanket assets', () => {
    for (const iconName of [
      'garden_plot.png',
      'crop_parsley.png',
      'crop_tomato.png',
      'crop_candycane.png',
      'crop_100beans.png',
      'apple_tree.png',
      'feather.png',
      'knitted_blanket.png',
      'feather_loom.png',
    ]) {
      const iconPath = resolve(ROOT, 'public/assets/icons', iconName);
      expect(existsSync(iconPath), `missing ${iconName}`).toBe(true);
      const header = readPngHeader(iconPath);
      expect(header.width).toBe(128);
      expect(header.height).toBe(128);
      // PNG colorType 6 = Truecolour with alpha (RGBA)
      expect(header.colorType).toBe(6);
    }
  });
});
