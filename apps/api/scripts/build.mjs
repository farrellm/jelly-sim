import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * Bundle the API to a single file for the production image.
 *
 * The workspace packages (@jelly/shared, @jelly/sim) are source-only TypeScript and get
 * bundled in, which is the point: the runtime image then needs no pnpm, no workspace
 * layout, and no TypeScript. @node-rs/argon2 stays external because it is a native module
 * and cannot be bundled.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = join(root, 'dist');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: {
    server: join(root, 'src/index.ts'),
    migrate: join(root, 'src/db/migrate-cli.ts'),
  },
  outdir,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: ['@node-rs/argon2'],
  banner: {
    // Some dependencies still reach for CommonJS globals from ESM.
    js: [
      "import { createRequire as __jellyCreateRequire } from 'node:module';",
      'const require = __jellyCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  logLevel: 'info',
});

// The migration runner reads these at runtime, so they ship next to the bundle.
await cp(join(root, 'src/db/migrations'), join(outdir, 'migrations'), { recursive: true });

console.log('built dist/server.js and dist/migrate.js');
