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

describe('PR-08 village buildings, currencies & Dr. Bubblegum Blender MCP asset pack', () => {
  it('commits reproducible Blender script and source .blend file', () => {
    expect(existsSync(resolve(ROOT, 'assets-src/scripts/build_village_m2.py'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'assets-src/blend/village_m2.blend'))).toBe(true);
  });

  it('exports dr_bubblegum.glb within budget with articulated Body, Head, Hat, Arm_L, Arm_R, and Cane nodes', () => {
    const glbPath = resolve(ROOT, 'public/assets/models/dr_bubblegum.glb');
    expect(existsSync(glbPath)).toBe(true);

    const sizeBytes = statSync(glbPath).size;
    expect(sizeBytes).toBeGreaterThan(2048);
    expect(sizeBytes).toBeLessThanOrEqual(75 * 1024);

    const gltf = parseGlbJsonChunk(readFileSync(glbPath));
    const tris = countGlbTriangles(gltf);
    expect(tris).toBeGreaterThan(200);
    expect(tris).toBeLessThanOrEqual(2000);

    const nodes = gltf.nodes ?? [];
    const byName = (name: string) => nodes.find((n) => n.name === name);
    const childNames = (parent: GltfNode | undefined) =>
      (parent?.children ?? []).map((idx) => nodes[idx]?.name);

    const root = byName('dr_bubblegum');
    assertIdentityRoot(root);

    const rootChildren = childNames(root);
    expect(rootChildren).toContain('Body');
    expect(rootChildren).toContain('Head');
    expect(rootChildren).toContain('Arm_L');
    expect(rootChildren).toContain('Arm_R');

    expect(byName('Body')?.mesh).toBeDefined();

    const headChildren = childNames(byName('Head'));
    expect(headChildren).toContain('HeadMesh');
    expect(headChildren).toContain('Hat');
    expect(byName('HeadMesh')?.mesh).toBeDefined();

    const hatChildren = childNames(byName('Hat'));
    expect(hatChildren).toContain('HatMesh');
    expect(byName('HatMesh')?.mesh).toBeDefined();

    const armLChildren = childNames(byName('Arm_L'));
    expect(armLChildren).toContain('Arm_L_Mesh');

    const armRChildren = childNames(byName('Arm_R'));
    expect(armRChildren).toContain('Arm_R_Mesh');
    expect(armRChildren).toContain('Cane');
    expect(byName('Cane')?.mesh).toBeDefined();
  });

  it('exports toilet.glb within 1,000 tris and 65 KB budgets with distinct ToiletDoor child', () => {
    const glbPath = resolve(ROOT, 'public/assets/models/toilet.glb');
    expect(existsSync(glbPath)).toBe(true);

    const sizeBytes = statSync(glbPath).size;
    expect(sizeBytes).toBeGreaterThan(1024);
    expect(sizeBytes).toBeLessThanOrEqual(65 * 1024);

    const gltf = parseGlbJsonChunk(readFileSync(glbPath));
    const tris = countGlbTriangles(gltf);
    expect(tris).toBeGreaterThan(100);
    expect(tris).toBeLessThanOrEqual(1000);

    const nodes = gltf.nodes ?? [];
    const root = nodes.find((n) => n.name === 'toilet');
    assertIdentityRoot(root);

    const children = (root?.children ?? []).map((idx) => nodes[idx]);
    const door = children.find((n) => n?.name === 'ToiletDoor');
    expect(door).toBeDefined();
    expect(door?.mesh).toBeDefined();
  });

  it('exports hamburger_stand.glb within 1,500 tris and 65 KB budgets with distinct BurgerSign rooftop child', () => {
    const glbPath = resolve(ROOT, 'public/assets/models/hamburger_stand.glb');
    expect(existsSync(glbPath)).toBe(true);

    const sizeBytes = statSync(glbPath).size;
    expect(sizeBytes).toBeGreaterThan(1024);
    expect(sizeBytes).toBeLessThanOrEqual(65 * 1024);

    const gltf = parseGlbJsonChunk(readFileSync(glbPath));
    const tris = countGlbTriangles(gltf);
    expect(tris).toBeGreaterThan(200);
    expect(tris).toBeLessThanOrEqual(1500);

    const nodes = gltf.nodes ?? [];
    const root = nodes.find((n) => n.name === 'hamburger_stand');
    assertIdentityRoot(root);

    const children = (root?.children ?? []).map((idx) => nodes[idx]);
    const sign = children.find((n) => n?.name === 'BurgerSign');
    expect(sign).toBeDefined();
    expect(sign?.mesh).toBeDefined();
  });

  it('exports jelly_coin.glb, bean_buck.glb, and bonus_bean.glb within 400 tris and 20 KB budgets', () => {
    for (const [filename, rootName] of [
      ['jelly_coin.glb', 'jelly_coin'],
      ['bean_buck.glb', 'bean_buck'],
      ['bonus_bean.glb', 'bonus_bean'],
    ] as const) {
      const glbPath = resolve(ROOT, 'public/assets/models', filename);
      expect(existsSync(glbPath), `missing ${filename}`).toBe(true);

      const sizeBytes = statSync(glbPath).size;
      expect(sizeBytes).toBeGreaterThan(512);
      expect(sizeBytes).toBeLessThanOrEqual(20 * 1024);

      const gltf = parseGlbJsonChunk(readFileSync(glbPath));
      const tris = countGlbTriangles(gltf);
      expect(tris).toBeGreaterThan(50);
      expect(tris).toBeLessThanOrEqual(400);

      const root = (gltf.nodes ?? []).find((n) => n.name === rootName);
      assertIdentityRoot(root);
    }
  });

  it('renders 128x128 transparent RGBA studio PNG icons for all M2 village & currency assets', () => {
    for (const iconName of [
      'dr_bubblegum.png',
      'toilet.png',
      'hamburger_stand.png',
      'jelly_coin.png',
      'bean_buck.png',
      'bonus_bean.png',
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
