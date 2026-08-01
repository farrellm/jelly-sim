/**
 * Environment configuration (DESIGN.md §16).
 *
 * `JWT_SECRET` is mandatory in production; development and test fall back to a well-known value
 * so `npm run dev` works with no setup.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";
import { z } from "zod";

const DEV_JWT_SECRET = "dev-secret-change-me";

/** Repo root, resolved from this file (server/src/env.ts → ../..). */
export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().default(path.join(ROOT_DIR, "data", "jelly.sqlite")),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment: ${detail}`);
}

const raw = parsed.data;

if (raw.NODE_ENV === "production" && !raw.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production");
}

export const env = {
  ...raw,
  JWT_SECRET: raw.JWT_SECRET ?? DEV_JWT_SECRET,
  isProduction: raw.NODE_ENV === "production",
  /** Where `client/dist` lands after `npm run build`; served in production (DESIGN.md §16). */
  clientDistDir: path.join(ROOT_DIR, "client", "dist"),
};

/** JWTs last a week; there are no refresh tokens in v1 (DESIGN.md §13). */
export const JWT_EXPIRES_IN = "7d";

/** bcrypt cost factor (DESIGN.md §13). */
export const BCRYPT_ROUNDS = 12;
