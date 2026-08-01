/**
 * SQLite access (DESIGN.md §12). The server is a save *store*: it never re-simulates a save.
 */

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { ROOT_DIR, env } from "./env.js";
import * as schema from "./schema/index.js";

export type AppDb = BetterSQLite3Database<typeof schema>;

export interface DbHandle {
  db: AppDb;
  sqlite: Database.Database;
  close: () => void;
}

const MIGRATIONS_DIR = path.join(ROOT_DIR, "server", "drizzle");

export function createDatabase(databasePath: string = env.DATABASE_PATH): DbHandle {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  if (databasePath !== ":memory:") {
    // WAL keeps reads concurrent with the autosave writes (DESIGN.md §12).
    sqlite.pragma("journal_mode = WAL");
  }

  const db = drizzle(sqlite, { schema });
  return { db, sqlite, close: () => sqlite.close() };
}

/** Apply any pending migrations. Called on boot (DESIGN.md §16). */
export function runMigrations(db: AppDb): void {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
