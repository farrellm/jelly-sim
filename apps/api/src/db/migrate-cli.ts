import postgres from 'postgres';
import { loadEnvFile } from '../env.js';
import { runMigrations } from './migrate.js';

/**
 * `pnpm db:migrate` locally, and the Fly release command in production (§14) — migrations
 * run before the new version accepts traffic.
 *
 * This is a separate entry point from migrate.ts on purpose: the runner is imported by the
 * test helper, and importing a module must never have the side effect of migrating a
 * database.
 */
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
