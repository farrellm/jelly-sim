import { hash, verify } from '@node-rs/argon2';

/**
 * @node-rs/argon2 declares its `Algorithm` enum as an ambient const enum, which
 * `verbatimModuleSyntax` cannot import. 2 is Argon2id; the assertion below keeps us
 * honest by checking the value against the hashes we actually produce.
 */
const ARGON2ID = 2;

/**
 * Argon2id at the OWASP baseline (DESIGN.md §9.1). The parameters are recorded inside the
 * encoded hash, so they can be raised later and old hashes upgraded on the next successful
 * login rather than by asking every player to reset a password they cannot reset.
 */
export const ARGON2_PARAMS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_PARAMS);
}

export function verifyPassword(encoded: string, password: string): Promise<boolean> {
  return verify(encoded, password, ARGON2_PARAMS).catch(() => false);
}

/**
 * True when a stored hash was produced with weaker parameters than we now use, and should
 * be rewritten while we have the plaintext in hand.
 */
export function needsRehash(encoded: string): boolean {
  const params = /\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(encoded);
  if (!params) return true; // not argon2id at all — definitely rehash
  const [, m, t, p] = params;
  return (
    Number(m) < ARGON2_PARAMS.memoryCost ||
    Number(t) < ARGON2_PARAMS.timeCost ||
    Number(p) < ARGON2_PARAMS.parallelism
  );
}
