import { SIM_VERSION } from '@jelly/sim';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, getState, register, truncateAll, type TestApp } from './helpers/app.js';

const HOUR = 3_600_000;

let ctx: TestApp;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await truncateAll(ctx.sql);
});

describe('GET /state', () => {
  it('returns the signed-in player’s save', async () => {
    const { cookie } = await register(ctx.app, { username: 'alice', beanName: 'Beanie' });

    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/state', headers: { cookie } });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.simVersion).toBe(SIM_VERSION);
    expect(body.state.bean.name).toBe('Beanie');
    expect(typeof body.serverTime).toBe('number');
    expect(body.view.needs).toEqual({ hunger: 100, warmth: 100, rest: 100, mood: 100 });
    expect(body.view.bark).toBeNull();
  });

  it('never returns another player’s save', async () => {
    const alice = await register(ctx.app, { username: 'alice', beanName: 'Beanie' });
    const bob = await register(ctx.app, { username: 'bob', beanName: 'Bobbin' });

    const asAlice = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/state',
      headers: { cookie: alice.cookie },
    });
    const asBob = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/state',
      headers: { cookie: bob.cookie },
    });

    expect(asAlice.json().state.bean.name).toBe('Beanie');
    expect(asBob.json().state.bean.name).toBe('Bobbin');
  });

  it('requires a session', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/state' });
    expect(res.statusCode).toBe(401);
  });

  it('404s for a slot with no Jelly Bean in it', async () => {
    const { cookie } = await register(ctx.app);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/state?slot=1',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a slot that is not a number instead of querying for NaN', async () => {
    const { cookie } = await register(ctx.app);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/state?slot=nonsense',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION');
  });
});

/**
 * The canon requirement `[C§5, C§17]`: the Jelly Bean gets hungry whether or not the app
 * is open. Nothing runs in the background — the absence is simulated on the way out of the
 * database, and these tests are the proof.
 */
describe('GET /state — the lazy catch-up', () => {
  it('simulates the fourteen hours the player was away', async () => {
    const { cookie } = await register(ctx.app, { beanName: 'Beanie' });
    const first = await getState(ctx.app, cookie);
    const start = first.json().serverTime;

    const later = await getState(ctx.app, cookie, start + 14 * HOUR);
    const body = later.json();

    // A larva loses 33.3 hunger an hour; fourteen hours bottoms out all three meters and
    // takes the mood with them.
    expect(body.view.needs.hunger).toBe(0);
    expect(body.view.needs.warmth).toBe(0);
    expect(body.view.needs.rest).toBe(0);
    expect(body.view.needs.mood).toBe(7);
    expect(body.view.bark.text).toMatch(/hungry|Feed me/);
  });

  it('reports what happened while nobody was watching', async () => {
    const { cookie } = await register(ctx.app);
    const start = (await getState(ctx.app, cookie)).json().serverTime;

    const events = (await getState(ctx.app, cookie, start + 14 * HOUR)).json().events;
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e: { t: string }) => e.t === 'bark')).toBe(true);
  });

  it('persists the tick, so the next read does not redo it', async () => {
    const { cookie } = await register(ctx.app);
    const start = (await getState(ctx.app, cookie)).json().serverTime;

    const ticked = await getState(ctx.app, cookie, start + 6 * HOUR);
    const [row] = await ctx.sql<{ state: { worldMs: number }; state_version: number }[]>`
      SELECT state, state_version FROM players`;

    expect(row?.state.worldMs).toBe(ticked.json().state.worldMs);
    expect(row?.state_version).toBe(ticked.json().stateVersion);
    expect(ticked.json().stateVersion).toBeGreaterThan(1);
  });

  it('does not bump the version when no whole tick has passed', async () => {
    // A glance at the island should not cost the other device a reconciliation.
    const { cookie } = await register(ctx.app);
    const first = await getState(ctx.app, cookie);
    const again = await getState(ctx.app, cookie, first.json().serverTime + 1_000);

    expect(again.json().stateVersion).toBe(first.json().stateVersion);
  });

  it('keeps the denormalised columns in step with the blob', async () => {
    // They exist so profile and friend-list queries never parse jsonb (schema.ts). A
    // projection that is only sometimes right is worse than none.
    const { cookie } = await register(ctx.app, { beanName: 'Beanie' });
    const start = (await getState(ctx.app, cookie)).json().serverTime;
    await getState(ctx.app, cookie, start + 6 * HOUR);

    const [row] = await ctx.sql<{ stage: string; level: number; sim_version: number }[]>`
      SELECT stage, level, sim_version FROM players`;
    expect(row?.stage).toBe('larva');
    expect(row?.level).toBe(1);
    expect(row?.sim_version).toBe(SIM_VERSION);
  });

  it('ignores a client that says it is earlier than the server does', async () => {
    const { cookie } = await register(ctx.app);
    const start = (await getState(ctx.app, cookie)).json().serverTime;
    await getState(ctx.app, cookie, start + 6 * HOUR);

    const rewound = await getState(ctx.app, cookie, start);
    expect(rewound.json().view.needs.hunger).toBeLessThan(100);
  });
});

describe('the request guards', () => {
  it('refuses a mutating request without the client header (§9.3)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'alice', password: 'correct horse battery' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  it('refuses a mutating request from an origin that is not allowlisted', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-jelly-client': '1', origin: 'https://evil.example' },
      payload: { username: 'alice', password: 'correct horse battery' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('leaves reads alone', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
  });
});

describe('GET /content', () => {
  it('reports the rules version the server is running', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/content' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ simVersion: SIM_VERSION, content: {} });
  });
});
