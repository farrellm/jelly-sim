import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The suites share one Postgres and truncate between tests, so they cannot run in
    // parallel against each other.
    fileParallelism: false,
    // Argon2id at the OWASP baseline is deliberately slow, and these tests hash a lot.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
