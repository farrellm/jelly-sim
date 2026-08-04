import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestApp,
  getState,
  postActions,
  register,
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

const HOUR = 3_600_000;

/** Register, then read the save so a test has a version to act against. */
async function start(username = 'alice') {
  const { cookie } = await register(ctx.app, { username, beanName: 'Beanie' });
  const state = (await getState(ctx.app, cookie)).json();
  return { cookie, stateVersion: state.stateVersion as number, serverTime: state.serverTime };
}

describe('POST /actions', () => {
  it('applies an intent and returns the canonical state', async () => {
    const { cookie, stateVersion, serverTime } = await start();

    const res = await postActions(
      ctx.app,
      cookie,
      { stateVersion, actions: [{ t: 'digHole' }] },
      serverTime + HOUR,
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results).toEqual([{ ok: true, events: [] }]);
    expect(body.state.bean.holes).toBe(1);
    expect(body.stateVersion).toBe(stateVersion + 1);
    expect(body.view.holes).toBe(1);
  });

  it('ticks the save before applying, so an intent lands on a current world', async () => {
    const { cookie, stateVersion, serverTime } = await start();

    const res = await postActions(
      ctx.app,
      cookie,
      { stateVersion, actions: [{ t: 'feed', item: 'hamburger' }] },
      serverTime + 2 * HOUR,
    );

    // Two hours of larva hunger is 66.6 gone; a 40-point hamburger cannot put it back to
    // 100, which it could if the action had been applied to the state as stored.
    expect(res.json().view.needs.hunger).toBe(73);
  });

  it('applies a batch in order, best-effort', async () => {
    const { cookie, stateVersion, serverTime } = await start();

    const res = await postActions(
      ctx.app,
      cookie,
      {
        stateVersion,
        actions: [{ t: 'digHole' }, { t: 'giveSpace' }, { t: 'digHole' }, { t: 'sleep' }],
      },
      serverTime + HOUR,
    );

    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.results.map((r: { ok: boolean }) => r.ok)).toEqual([true, false, true, true]);
    expect(body.results[1].code).toBe('INSUFFICIENT_FUNDS');
    // The rejection in the middle did not discard the taps around it.
    expect(body.state.bean.holes).toBe(2);
    expect(body.state.bean.asleepSinceMs).not.toBeNull();
  });

  it('refuses an action from a later phase by name', async () => {
    const { cookie, stateVersion } = await start();
    const res = await postActions(ctx.app, cookie, {
      stateVersion,
      actions: [{ t: 'harvest', plot: 0 }],
    });

    // Rejected by the schema, not the rules: harvest is not on the Phase 1 wire at all.
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION');
  });

  it('returns NOT_READY for an item the rules do not recognise', async () => {
    const { cookie, stateVersion } = await start();
    const res = await postActions(ctx.app, cookie, {
      stateVersion,
      actions: [{ t: 'feed', item: 'gravel' }],
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().results[0]).toMatchObject({ ok: false, code: 'NOT_READY' });
  });

  it('requires a session and the client header', async () => {
    const { cookie, stateVersion } = await start();

    expect(
      (await postActions(ctx.app, '', { stateVersion, actions: [{ t: 'digHole' }] })).statusCode,
    ).toBe(401);

    const noHeader = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/actions',
      headers: { cookie },
      payload: { stateVersion, actions: [{ t: 'digHole' }] },
    });
    expect(noHeader.statusCode).toBe(403);
  });

  it('rejects an empty or oversized batch', async () => {
    const { cookie, stateVersion } = await start();
    const many = Array.from({ length: 51 }, () => ({ t: 'digHole' }));

    expect((await postActions(ctx.app, cookie, { stateVersion, actions: [] })).statusCode).toBe(
      400,
    );
    expect((await postActions(ctx.app, cookie, { stateVersion, actions: many })).statusCode).toBe(
      400,
    );
  });

  it('cannot act on a slot the player does not have', async () => {
    const { cookie, stateVersion } = await start();
    const res = await postActions(ctx.app, cookie, {
      stateVersion,
      slot: 1,
      actions: [{ t: 'digHole' }],
    });
    expect(res.statusCode).toBe(404);
  });

  it('cannot reach another player’s save', async () => {
    const alice = await start('alice');
    const bob = await start('bob');

    await postActions(ctx.app, bob.cookie, {
      stateVersion: bob.stateVersion,
      actions: [{ t: 'digHole' }],
    });

    const stillAlice = await getState(ctx.app, alice.cookie);
    expect(stillAlice.json().state.bean.holes).toBe(0);
  });
});

/**
 * The canon multi-device scenario `[C§17]`, handled by refusing rather than by
 * last-write-wins. A player with the game open on a phone and a laptop must not have one
 * of them silently overwrite the other.
 */
describe('POST /actions — optimistic concurrency', () => {
  it('409s a client holding a stale version, and says which one is current', async () => {
    const { cookie, stateVersion, serverTime } = await start();

    const first = await postActions(
      ctx.app,
      cookie,
      { stateVersion, actions: [{ t: 'digHole' }] },
      serverTime + HOUR,
    );
    expect(first.statusCode).toBe(200);

    // The second device is still holding what it read before the first device acted.
    const stale = await postActions(
      ctx.app,
      cookie,
      { stateVersion, actions: [{ t: 'digHole' }] },
      serverTime + HOUR,
    );

    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe('STATE_CONFLICT');
    expect(stale.json().stateVersion).toBe(first.json().stateVersion);
  });

  it('applies nothing at all when it 409s', async () => {
    const { cookie, stateVersion } = await start();
    await postActions(ctx.app, cookie, { stateVersion, actions: [{ t: 'digHole' }] });
    await postActions(ctx.app, cookie, { stateVersion, actions: [{ t: 'digHole' }] });

    const [row] = await ctx.sql<
      { state: { bean: { holes: number } } }[]
    >`SELECT state FROM players`;
    expect(row?.state.bean.holes).toBe(1);
  });

  it('lets the loser replay against the version it is told', async () => {
    const { cookie, stateVersion } = await start();
    await postActions(ctx.app, cookie, { stateVersion, actions: [{ t: 'digHole' }] });

    const conflict = await postActions(ctx.app, cookie, {
      stateVersion,
      actions: [{ t: 'digHole' }],
    });
    const replay = await postActions(ctx.app, cookie, {
      stateVersion: conflict.json().stateVersion,
      actions: [{ t: 'digHole' }],
    });

    expect(replay.statusCode).toBe(200);
    expect(replay.json().state.bean.holes).toBe(2);
  });
});

/** Every string value anywhere in a response — the prose a player could ever be shown. */
function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}

/** Every field name anywhere in a response. */
function keysIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysIn);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) => [key, ...keysIn(v)]);
  }
  return [];
}

/** §13.1's absence test, at the API boundary — the surface a client can actually see. */
describe('POST /actions — the hole trap stays unexplained', () => {
  it('says nothing about holes in the response to digging ten of them', async () => {
    const { cookie, stateVersion, serverTime } = await start();

    const res = await postActions(
      ctx.app,
      cookie,
      { stateVersion, actions: Array.from({ length: 10 }, () => ({ t: 'digHole' })) },
      serverTime + 8 * HOUR,
    );

    const body = res.json();
    expect(body.state.bean.holes).toBe(10);
    // The counter and the two affordances are allowed to exist and to be named plainly:
    // the Farm screen draws a number, and the care row needs to know whether a button
    // works. What is forbidden is prose, and any field implying mood has a ceiling.
    expect(body.view.holes).toBe(10);

    const surface = { events: body.events, results: body.results, view: body.view };
    expect(stringsIn(surface).filter((s) => /hole|dig|ceiling/i.test(s))).toEqual([]);
    expect(
      keysIn(surface).filter((k) => /ceiling|penalt|maxmood|moodmax|moodcap/i.test(k)),
    ).toEqual([]);
  });

  it('offers no explanation when it refuses to give space', async () => {
    const { cookie, stateVersion, serverTime } = await start();

    const res = await postActions(
      ctx.app,
      cookie,
      { stateVersion, actions: [{ t: 'digHole' }, { t: 'giveSpace' }] },
      serverTime + 8 * HOUR,
    );

    expect(res.json().results[1].message).not.toMatch(/hole|dig/i);
  });
});
