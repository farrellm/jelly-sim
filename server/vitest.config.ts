import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Each file opens its own in-memory database.
    env: { NODE_ENV: "test", DATABASE_PATH: ":memory:" },
  },
});
