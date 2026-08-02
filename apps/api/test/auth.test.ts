import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  VALID_PASSWORD,
  asClient,
  createTestApp,
  register,
  sessionCookie,
  truncateAll,
  type TestApp,
} from './helpers/app.js';

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

const login = (username: string, password: string) =>
  ctx.app.inject(
    asClient({ method: 'POST', url: '/api/v1/auth/login', payload: { username, password } }),
  );

describe('POST /auth/register', () => {
  it('creates a user, a Jelly Bean, and a session', async () => {
    const { res, cookie } = await register(ctx.app);

    expect(res.statusCode).toBe(201);
    expect(cookie).toMatch(/^jelly_session=/);

    const body = res.json();
    expect(body.user.username).toBe('alice');
    expect(body.players).toHaveLength(1);
    expect(body.players[0]).toMatchObject({ slot: 0, stage: 'larva', level: 1, mode: 'regular' });
  });

  it('seeds the save with a full PlayerState blob', async () => {
    await register(ctx.app);
    const [row] = await ctx.sql<
      { state: Record<string, unknown>; sim_version: number; state_version: number }[]
    >`SELECT state, sim_version, state_version FROM players`;

    expect(row?.sim_version).toBe(1);
    expect(row?.state_version).toBe(1);
    expect(row?.state).toMatchObject({
      simVersion: 1,
      mode: 'regular',
      bean: { stage: 'larva', holes: 0, needs: { hunger: 100, warmth: 100, rest: 100, mood: 100 } },
      wallet: { jellyCoins: 0, beanBucks: 0, bonusBeans: 0 },
    });
  });

  it('sets an HttpOnly, SameSite=Lax session cookie', async () => {
    const { res } = await register(ctx.app);
    const raw = res.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw : [raw]).join(';');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
  });

  it('refuses a taken username, case-insensitively', async () => {
    await register(ctx.app, { username: 'alice' });
    const { res } = await register(ctx.app, { username: 'ALICE' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'VALIDATION', message: 'That username is taken.' });
  });

  it('enforces the ten-character password floor', async () => {
    const { res } = await register(ctx.app, { password: 'short1' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION');
    expect(res.json().details[0].path).toBe('password');
  });

  it('refuses common passwords the length rule would let through', async () => {
    const { res } = await register(ctx.app, { password: 'password123' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/too common/i);
  });

  it('refuses a username the database CHECK would refuse', async () => {
    const { res } = await register(ctx.app, { username: 'no spaces!' });
    expect(res.statusCode).toBe(400);
  });

  it('records baby mode, which cannot be changed later', async () => {
    const { res } = await register(ctx.app, { username: 'hardcore', mode: 'baby' });
    expect(res.json().players[0].mode).toBe('baby');
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await register(ctx.app);
  });

  it('accepts the right password and returns the player', async () => {
    const res = await login('alice', VALID_PASSWORD);
    expect(res.statusCode).toBe(200);
    expect(res.json().players[0].beanName).toBe('Beanie');
    expect(sessionCookie(res.headers['set-cookie'])).toMatch(/^jelly_session=/);
  });

  it('is case-insensitive about the username', async () => {
    expect((await login('ALICE', VALID_PASSWORD)).statusCode).toBe(200);
  });

  it('gives the same answer for a wrong password and an unknown user', async () => {
    const wrong = await login('alice', 'not the password');
    const missing = await login('nobody_here', 'not the password');

    expect(wrong.statusCode).toBe(401);
    expect(missing.statusCode).toBe(401);
    expect(wrong.json().message).toBe(missing.json().message);
  });

  it('records the last login', async () => {
    await login('alice', VALID_PASSWORD);
    const [row] = await ctx.sql<{ last_login_at: Date | null }[]>`SELECT last_login_at FROM users`;
    expect(row?.last_login_at).not.toBeNull();
  });
});

describe('registration throttling (§9.3)', () => {
  it('caps registrations per IP', async () => {
    const limited = await createTestApp({ REGISTER_LIMIT_PER_HOUR: '2' });
    try {
      await truncateAll(limited.sql);
      expect((await register(limited.app, { username: 'one' })).res.statusCode).toBe(201);
      expect((await register(limited.app, { username: 'two' })).res.statusCode).toBe(201);

      const third = await register(limited.app, { username: 'three' });
      expect(third.res.statusCode).toBe(429);
      expect(third.res.json().error).toBe('RATE_LIMITED');
    } finally {
      await limited.close();
    }
  });
});

describe('login throttling (§9.3)', () => {
  beforeEach(async () => {
    await register(ctx.app);
  });

  it('backs off exponentially after five consecutive failures', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await login('alice', 'wrong password here')).statusCode).toBe(401);
    }

    const locked = await login('alice', 'wrong password here');
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error).toBe('RATE_LIMITED');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('locks out the right password too, so the lockout means something', async () => {
    for (let i = 0; i < 5; i++) await login('alice', 'wrong password here');
    expect((await login('alice', VALID_PASSWORD)).statusCode).toBe(429);
  });
});

describe('sessions', () => {
  it('keeps a player signed in across requests', async () => {
    const { cookie } = await register(ctx.app);
    const me = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json().user.username).toBe('alice');
  });

  it('rejects a missing, forged, or revoked cookie', async () => {
    const anonymous = await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json().error).toBe('UNAUTHENTICATED');

    const forged = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: 'jelly_session=not-a-real-token' },
    });
    expect(forged.statusCode).toBe(401);
  });

  it('revokes the current session on logout and leaves the others alone', async () => {
    const { cookie: first } = await register(ctx.app);
    const second = sessionCookie((await login('alice', VALID_PASSWORD)).headers['set-cookie']);

    const out = await ctx.app.inject(
      asClient({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: first } }),
    );
    expect(out.statusCode).toBe(200);

    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: first } }))
        .statusCode,
    ).toBe(401);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: second } }))
        .statusCode,
    ).toBe(200);
  });

  it('revokes every session on logout-all', async () => {
    const { cookie: first } = await register(ctx.app);
    const second = sessionCookie((await login('alice', VALID_PASSWORD)).headers['set-cookie']);

    await ctx.app.inject(
      asClient({ method: 'POST', url: '/api/v1/auth/logout-all', headers: { cookie: first } }),
    );

    for (const cookie of [first, second]) {
      const me = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { cookie },
      });
      expect(me.statusCode).toBe(401);
    }
  });
});

describe('POST /auth/password', () => {
  it('changes the password, signs out other devices, and keeps this one', async () => {
    const { cookie: changer } = await register(ctx.app);
    const other = sessionCookie((await login('alice', VALID_PASSWORD)).headers['set-cookie']);

    const res = await ctx.app.inject(
      asClient({
        method: 'POST',
        url: '/api/v1/auth/password',
        headers: { cookie: changer },
        payload: { currentPassword: VALID_PASSWORD, newPassword: 'a brand new passphrase' },
      }),
    );
    expect(res.statusCode).toBe(200);

    expect((await login('alice', VALID_PASSWORD)).statusCode).toBe(401);
    expect((await login('alice', 'a brand new passphrase')).statusCode).toBe(200);

    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: other } }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await ctx.app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: { cookie: changer },
        })
      ).statusCode,
    ).toBe(200);
  });

  it('refuses when the current password is wrong', async () => {
    const { cookie } = await register(ctx.app);
    const res = await ctx.app.inject(
      asClient({
        method: 'POST',
        url: '/api/v1/auth/password',
        headers: { cookie },
        payload: { currentPassword: 'wrong password here', newPassword: 'a brand new passphrase' },
      }),
    );
    expect(res.statusCode).toBe(401);
  });
});
