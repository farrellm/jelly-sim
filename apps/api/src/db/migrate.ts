import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';

/**
 * `migrations/` sits beside this file in source, and beside the bundle in the production
 * image (scripts/build.mjs copies it there). Try both rather than making the runtime
 * layout depend on how the code was built.
 */
const MIGRATIONS_DIR = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, 'migrations'), join(here, 'db', 'migrations')]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`No migrations directory found near ${here}`);
})();

/**
 * A deliberately small migration runner: apply every .sql file in `migrations/` in
 * filename order, exactly once, recording what ran.
 *
 * DESIGN.md §7 asks for typed SQL migrations checked into the repo, and §14 runs them as a
 * release command before new instances take traffic. Hand-written SQL is the point — the
 * schema uses citext, CHECK constraints, and partial indexes that a generator would either
 * mangle or drop.
 */
export async function runMigrations(sql: Sql, log: (msg: string) => void = () => {}) {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  // One deploy at a time. Two instances starting together must not race each other
  // through the same CREATE TABLE.
  await sql`SELECT pg_advisory_lock(4820163)`;
  try {
    const applied = new Set(
      (await sql<{ name: string }[]>`SELECT name FROM schema_migrations`).map((r) => r.name),
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const body = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      log(`applying ${file}`);
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      });
    }

    log(`schema up to date (${files.length} migration(s))`);
  } finally {
    await sql`SELECT pg_advisory_unlock(4820163)`;
  }
}
