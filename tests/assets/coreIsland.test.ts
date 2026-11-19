import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');

interface GltfNode {
  name?: string;
  translation?: [number, number, number];
  scale?: [number, number, number];
  children?: number[];
}

interface GltfJson {
  nodes?: GltfNode[];
  meshes?: unknown[];
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

function readPngDimensions(filepath: string): { width: number; height: number } {
  const buf = readFileSync(filepath);
  // PNG 8-byte signature
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

describe('PR-02 core starter island & Blender MCP pipeline assets', () => {
  it('commits reproducible Blender scripts and source .blend file', () => {
    expect(existsSync(resolve(ROOT, 'assets-src/scripts/common.py'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'assets-src/scripts/build_core_island.py'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'assets-src/blend/core_island.blend'))).toBe(true);
  });

  it('exports island_ring0.glb under 100 KB with origin (0,0,0), scale (1,1,1), and 7 plot pads', () => {
    const glbPath = resolve(ROOT, 'public/assets/models/island_ring0.glb');
    expect(existsSync(glbPath)).toBe(true);

    const sizeBytes = statSync(glbPath).size;
    expect(sizeBytes).toBeGreaterThan(1024);
    expect(sizeBytes).toBeLessThan(100 * 1024);

    const gltf = parseGlbJsonChunk(readFileSync(glbPath));
    const nodes = gltf.nodes ?? [];
    const rootNode = nodes.find((n) => n.name === 'island_ring0');
    expect(rootNode).toBeDefined();

    // glTF omits identity translation/scale; if present they must be [0,0,0] and [1,1,1]
    if (rootNode?.translation) {
      expect(rootNode.translation.map((v) => Math.round(v * 1e5) / 1e5)).toEqual([0, 0, 0]);
    }
    if (rootNode?.scale) {
      expect(rootNode.scale.map((v) => Math.round(v * 1e5) / 1e5)).toEqual([1, 1, 1]);
    }

    for (let i = 0; i < 7; i += 1) {
      const padNode = nodes.find((n) => n.name === `plot_pad_${i}`);
      expect(padNode, `missing plot_pad_${i}`).toBeDefined();
    }
  });

  it('renders valid 512x512 app icon and 180x180 apple-touch-icon PNGs', () => {
    const icon512 = resolve(ROOT, 'public/assets/icons/app_icon_512.png');
    const icon180 = resolve(ROOT, 'public/assets/icons/apple_touch_icon_180.png');
    expect(existsSync(icon512)).toBe(true);
    expect(existsSync(icon180)).toBe(true);

    expect(readPngDimensions(icon512)).toEqual({ width: 512, height: 512 });
    expect(readPngDimensions(icon180)).toEqual({ width: 180, height: 180 });
  });
});
