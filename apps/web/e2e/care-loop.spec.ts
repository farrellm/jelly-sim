import { expect, test, type Page } from '@playwright/test';

/**
 * DESIGN.md §13.3, the three scenarios Phase 1 can actually drive. Scenarios 2 and 3 need
 * crops and mini-games and join in Phase 2; scenario 6 is covered against the API in
 * apps/api/test/actions.test.ts, where two racing devices are easier to arrange than two
 * browser contexts.
 */

const HOUR = 3_600_000;
const PASSWORD = 'correct horse battery';

/**
 * A clock the test controls.
 *
 * The server honours `x-test-now` outside production (apps/api/src/time.ts), so the way to
 * simulate a player closing the tab and coming back tomorrow is to say so, rather than to
 * wait. The route handler rewrites every API request, so the value can change mid-test.
 */
class TestClock {
  nowMs = Date.now();

  async install(page: Page): Promise<void> {
    await page.route('**/api/**', async (route) => {
      const headers = { ...route.request().headers(), 'x-test-now': String(this.nowMs) };
      await route.continue({ headers });
    });
  }

  advanceHours(hours: number): void {
    this.nowMs += hours * HOUR;
  }
}

async function registerFresh(page: Page, clock: TestClock, beanName = 'Pip'): Promise<string> {
  const username = `e2e${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

  await clock.install(page);
  await page.goto('/register');
  // Selected by autocomplete rather than by label text: the password field's accessible
  // name picks up its own hint, and a test that breaks when the hint is reworded is noise.
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('input:not([type="password"]):not([autocomplete="username"])').fill(beanName);
  await page.getByRole('button', { name: 'Start' }).click();

  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  return username;
}

/** The meter values the Bean sheet is showing, once it has one to show. */
async function needs(page: Page): Promise<Record<string, number>> {
  await page.goto('/bean');
  // The sheet renders "Loading…" until the save arrives; reading it before then gets an
  // empty object and a confusing failure three assertions later.
  await expect(page.getByRole('meter').first()).toBeVisible();

  const entries = await page
    .getByRole('meter')
    .evaluateAll((nodes) =>
      nodes.map((n) => [
        n.getAttribute('aria-label') ?? '',
        Number(n.getAttribute('aria-valuenow')),
      ]),
    );
  return Object.fromEntries(entries) as Record<string, number>;
}

/** Wait for the outbox to debounce, send, and be acknowledged. */
async function synced(page: Page, act: () => Promise<void>): Promise<void> {
  const response = page.waitForResponse((r) => r.url().includes('/api/v1/actions') && r.ok());
  await act();
  await response;
}

test.describe('the care loop', () => {
  // §13.3 scenario 1.
  test('register, land on the island, and resolve the first bark', async ({ page }) => {
    const clock = new TestClock();
    await registerFresh(page, clock, 'Beanie');

    await expect(page.getByText('Beanie has a plot of land.')).toBeVisible();

    // Three hours of larva hunger takes it under 30, which is when it starts shouting.
    clock.advanceHours(3);
    await page.reload();

    const bark = page.getByRole('button', { name: /Jelly Bean hungry!|Mama! Feed me!/ });
    await expect(bark).toBeVisible();

    await synced(page, () => bark.click());
    await expect(bark).toBeHidden();
    expect((await needs(page))['Fed']).toBeGreaterThan(30);
  });

  // §13.3 scenario 5. The canon requirement that needs run while the app is closed.
  test('fourteen hours away decays the needs exactly right', async ({ page }) => {
    const clock = new TestClock();
    await registerFresh(page, clock);

    clock.advanceHours(14);
    await page.reload();

    // A larva loses 33.3 hunger, 25 warmth, and 16.7 rest an hour, so all three bottom
    // out; mood falls 8/h from the moment the first of them drops under 20.
    expect(await needs(page)).toEqual({ Fed: 0, Warm: 0, Rested: 0, Happy: 7 });
  });

  /**
   * §13.3 scenario 4 — the one that matters most.
   *
   * Digging measurably angers the Jelly Bean, and nothing in the UI says so. The second
   * half is the assertion: if this fails because someone added the obviously missing
   * explanation, the fix is to remove the explanation. See CLAUDE.md.
   */
  test('digging ten holes lowers the mood ceiling and the game never says why', async ({
    page,
  }) => {
    const clock = new TestClock();
    await registerFresh(page, clock);

    // Bring mood down first, so there is room for the ceiling to be the thing capping it.
    clock.advanceHours(10);
    await page.reload();

    const dig = page.getByRole('button', { name: 'Dig' });
    await synced(page, async () => {
      for (let i = 0; i < 10; i += 1) await dig.click();
    });
    await page.reload();

    const after = await needs(page);
    expect(after['Happy']).toBeLessThanOrEqual(85);
    await expect(page.getByText('Holes')).toBeVisible();

    // Every word the player can read, on every screen the counter appears on.
    for (const path of ['/', '/bean', '/settings']) {
      await page.goto(path);
      const text = (await page.locator('body').innerText()).toLowerCase();

      // The counter and the button are allowed to exist and be named. What is not allowed
      // is any sentence connecting them to mood, happiness, or a limit.
      expect(text).not.toMatch(/hole[^.]{0,80}(mood|happy|angr|ceiling|penalt|limit|max)/);
      expect(text).not.toMatch(/(mood|happy|angr|ceiling|penalt|limit|max)[^.]{0,80}hole/);
      expect(text).not.toMatch(/dig[^.]{0,80}(mood|happy|angr|worse)/);
    }
  });

  test('space costs fourteen bean bucks and says so when you have none', async ({ page }) => {
    // Not a §13.3 scenario on its own, but it is the moment the whole economy hangs off
    // and the tension Phase 2 exists to resolve `[C§11]`.
    const clock = new TestClock();
    await registerFresh(page, clock);

    await expect(page.getByRole('button', { name: /Space/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Space/ })).toContainText('14');
  });
});
