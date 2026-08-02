import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Db = ReturnType<typeof createDb>['db'];

export function createDb(databaseUrl: string) {
  const sql = postgres(databaseUrl, {
    max: 10,
    // The API is a lazy-tick server: requests are short and bursty, and idle connections
    // cost Neon money.
    idle_timeout: 20,
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema });
  return { sql, db };
}

export { schema };
