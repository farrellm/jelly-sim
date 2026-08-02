import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end, on the device the game is actually for (§13.3).
 *
 * iPhone 13 emulation is not decoration: the thumb-zone layout, the 44 pt targets, and the
 * dvh-based frame are all sized for a phone held in one hand, and a 1280-wide headless
 * Chrome would pass tests the real thing fails.
 *
 * Both servers are started by Playwright rather than assumed, so `make test-e2e` and CI
 * run the same way. TEST_CLOCK is on so scenario 5 can leave for fourteen hours.
 */
const API_PORT = 3000;
const WEB_PORT = 5273;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // one database, and the suite registers real users into it
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },

  /**
   * WebKit, because an iPhone runs WebKit and §11.1 is a list of Safari behaviours. The
   * escape hatch is for developer machines where Playwright's WebKit build cannot be
   * installed — its Linux dependencies are Ubuntu packages, and not every distribution has
   * them. `E2E_BROWSER=chromium pnpm test:e2e` keeps the phone viewport and the touch
   * emulation and swaps only the engine. CI always runs the real one.
   */
  projects: [
    {
      name: 'iPhone 13',
      use: {
        ...devices['iPhone 13'],
        ...(process.env.E2E_BROWSER === 'chromium' ? { browserName: 'chromium' as const } : {}),
      },
    },
  ],

  webServer: [
    {
      command: 'pnpm --filter @jelly/api dev',
      port: API_PORT,
      cwd: '../..',
      // Never reuse. These servers are started with a specific database, a specific
      // registration limit, and the test clock switched on; silently attaching to whatever
      // `make dev` left running gives a suite that fails for reasons it cannot report.
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'development',
        TEST_CLOCK: '1',
        DATABASE_URL:
          process.env.TEST_DATABASE_URL ?? 'postgres://jelly:jelly@localhost:5435/jelly_test',
        COOKIE_SECURE: 'false',
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        REGISTER_LIMIT_PER_HOUR: '10000',
      },
    },
    {
      command: 'pnpm --filter @jelly/web dev',
      port: WEB_PORT,
      cwd: '../..',
      // Never reuse. These servers are started with a specific database, a specific
      // registration limit, and the test clock switched on; silently attaching to whatever
      // `make dev` left running gives a suite that fails for reasons it cannot report.
      reuseExistingServer: false,
    },
  ],
});
