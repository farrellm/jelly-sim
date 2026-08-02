import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, register, truncateAll, type TestApp } from './helpers/app.js';

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
    expect(body.stateVersion).toBe(1);
    expect(body.simVersion).toBe(1);
    expect(body.state.bean.name).toBe('Beanie');
    expect(typeof body.serverTime).toBe('number');
    // Phase 1 fills these; until then they are honestly empty rather than absent.
    expect(body.view).toEqual({});
    expect(body.events).toEqual([]);
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
    expect(res.json()).toEqual({ simVersion: 1, content: {} });
  });
});
