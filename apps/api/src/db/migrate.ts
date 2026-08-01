import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';
import postgres from 'postgres';
import { loadEnvFile } from '../env.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

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

const isCli = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  loadEnvFile();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.');
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await runMigrations(sql, (m) => console.log(m));
  } finally {
    await sql.end();
  }
}
