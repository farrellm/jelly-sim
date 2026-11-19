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

describe('PR-04 hero pet & core care Blender MCP asset pack', () => {
  it('commits reproducible Blender script and source .blend file', () => {
    expect(existsSync(resolve(ROOT, 'assets-src/scripts/build_pet_core.py'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'assets-src/blend/pet_core.blend'))).toBe(true);
  });

  it('exports jellybean_larva.glb within budget with separate Body, Eyes, Brows, and Mouth nodes', () => {
    const glbPath = resolve(ROOT, 'public/assets/models/jellybean_larva.glb');
    expect(existsSync(glbPath)).toBe(true);

    const sizeBytes = statSync(glbPath).size;
    expect(sizeBytes).toBeGreaterThan(1024);
    expect(sizeBytes).toBeLessThanOrEqual(45 * 1024);

    const gltf = parseGlbJsonChunk(readFileSync(glbPath));
    const tris = countGlbTriangles(gltf);
    expect(tris).toBeGreaterThan(100);
    expect(tris).toBeLessThanOrEqual(1200);

    const nodes = gltf.nodes ?? [];
    const byName = (name: string) => nodes.find((n) => n.name === name);
    const childNames = (parent: GltfNode | undefined) =>
      (parent?.children ?? []).map((idx) => nodes[idx]?.name);

    const root = byName('jellybean_larva');
    assertIdentityRoot(root);

    const rootChildren = childNames(root);
    expect(rootChildren).toContain('Body');
    expect(rootChildren).toContain('Eyes');
    expect(rootChildren).toContain('Brows');
    expect(rootChildren).toContain('Mouth');
    expect(rootChildren).toContain('Cheeks');
    expect(rootChildren).toContain('HatSocket');

    expect(byName('Body')?.mesh).toBeDefined();
    expect(byName('Mouth')?.mesh).toBeDefined();

    const eyesChildren = childNames(byName('Eyes'));
    expect(eyesChildren).toContain('Eye_L');
    expect(eyesChildren).toContain('Eye_R');

    const browsChildren = childNames(byName('Brows'));
    expect(browsChildren).toContain('Brow_L');
    expect(browsChildren).toContain('Brow_R');
  });

  it('exports starter_house.glb within budget with distinct FrontDoor mesh child', () => {
    const glbPath = resolve(ROOT, 'public/assets/models/starter_house.glb');
    expect(existsSync(glbPath)).toBe(true);

    const sizeBytes = statSync(glbPath).size;
    expect(sizeBytes).toBeGreaterThan(1024);
    expect(sizeBytes).toBeLessThanOrEqual(65 * 1024);

    const gltf = parseGlbJsonChunk(readFileSync(glbPath));
    const tris = countGlbTriangles(gltf);
    expect(tris).toBeGreaterThan(100);
    expect(tris).toBeLessThanOrEqual(1500);

    const nodes = gltf.nodes ?? [];
    const root = nodes.find((n) => n.name === 'starter_house');
    assertIdentityRoot(root);

    const children = (root?.children ?? []).map((idx) => nodes[idx]);
    const frontDoor = children.find((n) => n?.name === 'FrontDoor');
    expect(frontDoor).toBeDefined();
    expect(frontDoor?.mesh).toBeDefined();

    const doorstep = children.find((n) => n?.name === 'DoorstepSocket');
    expect(doorstep).toBeDefined();
  });

  it('exports apple.glb and bed_prop.glb within 400 tris and 20 KB budgets', () => {
    for (const [filename, rootName] of [
      ['apple.glb', 'apple'],
      ['bed_prop.glb', 'bed_prop'],
    ] as const) {
      const glbPath = resolve(ROOT, 'public/assets/models', filename);
      expect(existsSync(glbPath), `missing ${filename}`).toBe(true);

      const sizeBytes = statSync(glbPath).size;
      expect(sizeBytes).toBeGreaterThan(512);
      expect(sizeBytes).toBeLessThanOrEqual(20 * 1024);

      const gltf = parseGlbJsonChunk(readFileSync(glbPath));
      const tris = countGlbTriangles(gltf);
      expect(tris).toBeGreaterThan(30);
      expect(tris).toBeLessThanOrEqual(400);

      const root = (gltf.nodes ?? []).find((n) => n.name === rootName);
      assertIdentityRoot(root);
    }
  });

  it('renders 128x128 transparent RGBA studio PNG icons for larva, apple, and bed', () => {
    for (const iconName of ['larva.png', 'apple.png', 'bed.png']) {
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
