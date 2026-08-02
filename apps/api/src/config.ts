import { z } from 'zod';

/**
 * Environment, validated once at boot. A misconfigured deploy should fail loudly on
 * startup rather than mysteriously at the first request that needs the missing value.
 */
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required. See .env.example.'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  /** Comma-separated allowlist used for both CORS and the Origin check (§9.3). */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === undefined || v === 'true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  /**
   * Registrations per hour per IP (§9.3). Configurable because it is the one limit a test
   * suite trips over immediately — every inject() shares an address — and because a
   * launch day may want it looser than a quiet Tuesday.
   */
  REGISTER_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(5),
  /**
   * Lets a request name its own "now" via the `x-test-now` header (§13.3).
   *
   * The end-to-end suite has to be able to close the tab, wait fourteen hours, and come
   * back, and the only alternatives are sleeping for fourteen hours or mocking the clock
   * inside the server it is supposed to be testing from the outside. Refused outright in
   * production regardless of this flag — see time.ts.
   */
  TEST_CLOCK: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});

export type Config = {
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl: string;
  port: number;
  host: string;
  corsOrigins: string[];
  cookieSecure: boolean;
  logLevel: string;
  registerLimitPerHour: number;
  allowTestClock: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid environment:\n  ${detail}`);
  }
  const e = parsed.data;

  return {
    nodeEnv: e.NODE_ENV,
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    host: e.HOST,
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    cookieSecure: e.COOKIE_SECURE,
    logLevel: e.LOG_LEVEL ?? (e.NODE_ENV === 'test' ? 'silent' : 'info'),
    registerLimitPerHour: e.REGISTER_LIMIT_PER_HOUR,
    // Belt and braces: the flag can only ever be on outside production.
    allowTestClock: e.TEST_CLOCK && e.NODE_ENV !== 'production',
  };
}
