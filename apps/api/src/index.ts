import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { loadEnvFile } from './env.js';
import { buildServer } from './server.js';

loadEnvFile();

const config = loadConfig();
const { db, sql } = createDb(config.databaseUrl);
const app = await buildServer({ config, db, sql });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error({ err }, 'failed to start');
  process.exit(1);
}
