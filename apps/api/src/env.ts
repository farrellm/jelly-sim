import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Load the repo-root .env, if there is one, without pulling in dotenv. Deployed
 * environments inject real environment variables and have no file to read; this exists so
 * `pnpm dev` and the test suite pick up local settings.
 *
 * Values already present in the environment win, matching dotenv's behaviour.
 */
export function loadEnvFile(): void {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
}
