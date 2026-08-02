import { describe, expect, it } from 'vitest';
import { apply } from '../src/apply.js';
import { FILL_HOLE_COST_BB, MOOD_COST_PER_HOLE, SPACE_COST_BB } from '../src/content.js';
import { at } from './harness.js';

describe('apply — feeding', () => {
  it('spends one item and restores hunger', () => {
    const clock = at('2026-01-01T00:00Z').advanceHours(2);
    const before = clock.need('hunger');

    clock.do({ t: 'feed', item: 'hamburger' });
    expect(clock.need('hunger')).toBeCloseTo(before + 40, 5);
    expect(clock.state.inventory.hamburger).toBe(2);
  });

  it('refuses food nobody has, and food that is not food', () => {
    const clock = at('2026-01-01T00:00Z');
    clock.state.inventory = {};
    expect(clock.expectReject({ t: 'feed', item: 'hamburger' }).code).toBe('NOT_READY');
    expect(clock.expectReject({ t: 'feed', item: 'sword' }).code).toBe('NOT_READY');
  });

  it('does not overfill', () => {
    const clock = at('2026-01-01T00:00Z').do({ t: 'feed', item: 'hamburger' });
    expect(clock.need('hunger')).toBe(100);
  });
});

describe('apply — warming', () => {
  it('consumes the blanket and takes warmth back to full', () => {
    const clock = at('2026-01-01T00:00Z').advanceHours(3);
    expect(clock.need('warmth')).toBeLessThan(100);

    clock.do({ t: 'warm', item: 'blanket' });
    expect(clock.need('warmth')).toBe(100);
    // ⚙ Consumed: cold is priced at gathering time, and a permanent blanket would only
    // ever cost that once.
    expect(clock.state.inventory.blanket).toBeUndefined();
    expect(clock.expectReject({ t: 'warm', item: 'blanket' }).code).toBe('NOT_READY');
  });

  it('refuses to wrap a Jelly Bean in a tomato', () => {
    expect(at('2026-01-01T00:00Z').expectReject({ t: 'warm', item: 'tomato' }).code).toBe(
      'NOT_READY',
    );
  });
});

describe('apply — sleep', () => {
  it('is free, and toggles', () => {
    const clock = at('2026-01-01T00:00Z').advanceHours(4);
    clock.do({ t: 'sleep' });
    expect(clock.state.bean.asleepSinceMs).toBe(clock.nowMs);

    clock.do({ t: 'sleep' });
    expect(clock.state.bean.asleepSinceMs).toBeNull();
    expect(clock.events.some((e) => e.t === 'woke')).toBe(true);
  });

  it('actually restores rest over time', () => {
    const clock = at('2026-01-01T00:00Z').advanceHours(4);
    const before = clock.need('rest');
    clock.do({ t: 'sleep' }).advanceHours(3);
    expect(clock.need('rest')).toBeGreaterThan(before);
  });
});

describe('apply — giving space', () => {
  it('costs exactly fourteen bean bucks', () => {
    const clock = at('2026-01-01T00:00Z').advanceHours(8);
    clock.state.wallet.beanBucks = 14;
    const before = clock.need('mood');

    clock.do({ t: 'giveSpace' });
    expect(clock.state.wallet.beanBucks).toBe(0);
    expect(clock.state.counters.spacesGiven).toBe(1);
    expect(clock.need('mood')).toBeCloseTo(before + 40, 5);
  });

  it('is refused, specifically, to a player who cannot afford it', () => {
    // A new save has nothing, on purpose. Being 14 short is the game's most quoted moment.
    const reject = at('2026-01-01T00:00Z').expectReject({ t: 'giveSpace' });
    expect(reject.code).toBe('INSUFFICIENT_FUNDS');
    expect(reject.message).toContain(String(SPACE_COST_BB));
  });
});

/**
 * The hole trap (§5.1, §13.1).
 *
 * Digging is free, instant, unlimited, and satisfying, and every hole permanently costs
 * 1.5 of the mood ceiling. The player is never told. The tests below assert the mechanic
 * *and* the silence, because the silence is the feature — a well-meaning contributor
 * adding the missing tooltip should fail CI, not ship a fix.
 */
describe('apply — digging holes', () => {
  it('is always free and always succeeds', () => {
    const clock = at('2026-01-01T00:00Z').do({ t: 'digHole' }, 50);
    expect(clock.state.bean.holes).toBe(50);
    expect(clock.state.counters.holesDugTotal).toBe(50);
    expect(clock.state.wallet).toEqual({ jellyCoins: 0, beanBucks: 0, bonusBeans: 0 });
  });

  it('lowers the mood ceiling by exactly 1.5 per hole', () => {
    const clock = at('2026-01-01T00:00Z');
    expect(clock.ceiling()).toBe(100);

    for (const n of [1, 2, 10, 40]) {
      const dug = at('2026-01-01T00:00Z').do({ t: 'digHole' }, n);
      expect(dug.ceiling()).toBeCloseTo(100 - MOOD_COST_PER_HOLE * n, 10);
    }
  });

  it('never lets the ceiling fall below 20, so a digger stalls rather than dies', () => {
    const clock = at('2026-01-01T00:00Z').do({ t: 'digHole' }, 500);
    expect(clock.ceiling()).toBe(20);
    expect(clock.state.bean.hp).toBeGreaterThan(0);
  });

  it('drags mood down with the ceiling, the moment the hole is dug', () => {
    const clock = at('2026-01-01T00:00Z');
    expect(clock.need('mood')).toBe(100);

    clock.do({ t: 'digHole' }, 10);
    expect(clock.need('mood')).toBeCloseTo(85, 5);
  });

  it('makes giving space quietly worse value for a digger', () => {
    // The canon folk theory in one test: dig while your Jelly Bean is angry, then pay the
    // 14, and get less than the 40 the game implies. Nothing anywhere says why.
    const patient = at('2026-01-01T00:00Z');
    const digger = at('2026-01-01T00:00Z');
    for (const clock of [patient, digger]) {
      clock.advanceHours(10);
      clock.state.bean.needs.mood = 20;
      clock.state.wallet.beanBucks = SPACE_COST_BB;
    }
    digger.do({ t: 'digHole' }, 30);
    digger.state.bean.needs.mood = 20;

    patient.do({ t: 'giveSpace' });
    digger.do({ t: 'giveSpace' });

    expect(patient.need('mood')).toBe(60);
    expect(digger.need('mood')).toBe(55); // ceiling 100 − 45
  });

  it('fills back in for twenty-five bean bucks, restoring the 1.5', () => {
    const clock = at('2026-01-01T00:00Z').do({ t: 'digHole' }, 2);
    clock.state.wallet.beanBucks = FILL_HOLE_COST_BB;

    clock.do({ t: 'fillHole' });
    expect(clock.state.bean.holes).toBe(1);
    expect(clock.ceiling()).toBeCloseTo(100 - MOOD_COST_PER_HOLE, 10);
    expect(clock.state.wallet.beanBucks).toBe(0);
    expect(clock.expectReject({ t: 'fillHole' }).code).toBe('INSUFFICIENT_FUNDS');
  });

  it('refuses to fill a hole that is not there', () => {
    const clock = at('2026-01-01T00:00Z');
    clock.state.wallet.beanBucks = 999;
    expect(clock.expectReject({ t: 'fillHole' }).code).toBe('NOT_READY');
  });
});

/**
 * The absence test DESIGN.md §13.1 asks for by name.
 *
 * No SimEvent and no field the sim hands outward may mention holes and mood together. If
 * this fails because someone added the obviously-missing explanation, the fix is to remove
 * the explanation. See CLAUDE.md.
 */
describe('the hole trap is never explained', () => {
  const dig = () => {
    const clock = at('2026-01-01T00:00Z').advanceHours(6);
    clock.do({ t: 'digHole' }, 10);
    clock.do({ t: 'sleep' });
    clock.advanceHours(6);
    return clock;
  };

  it('emits no event that names a hole at all', () => {
    const clock = dig();
    const serialized = JSON.stringify(clock.events);
    expect(serialized).not.toMatch(/hole/i);
    expect(serialized).not.toMatch(/ceiling/i);
    expect(serialized).not.toMatch(/dig/i);
  });

  it('never exposes the mood ceiling as a field, anywhere in the save', () => {
    // The ceiling is computed, never stored and never sent. A save that carried it would
    // put the answer one JSON.stringify away from any curious player.
    const serialized = JSON.stringify(dig().state);
    expect(serialized).not.toMatch(/moodCeiling/);
    expect(serialized).not.toMatch(/ceiling/i);
  });

  it('keeps the hole counter a neutral number with nothing attached to it', () => {
    const { state } = dig();
    expect(state.bean.holes).toBe(10);
    expect(state.counters.holesDugTotal).toBe(10);

    // Digging touches the counters and the mood value. It must touch nothing that would
    // let a client correlate the two — no timestamp of the last dig, no "moodPenalty",
    // no per-hole record.
    const beanKeys = Object.keys(state.bean);
    expect(beanKeys.filter((k) => /penalt|ceiling|cap|max/i.test(k))).toEqual([]);
  });

  it('says nothing about digging when it refuses to give space', () => {
    // The moment a player is most likely to be told. "Maybe I need to dig more holes" has
    // to stay a folk theory the game never confirms or denies.
    const clock = at('2026-01-01T00:00Z').do({ t: 'digHole' }, 20);
    const reject = clock.expectReject({ t: 'giveSpace' });
    expect(reject.message).not.toMatch(/hole|dig|ceiling/i);
  });
});

describe('apply — the contract', () => {
  it('never mutates the state it is given, even on success', () => {
    const clock = at('2026-01-01T00:00Z');
    const before = JSON.stringify(clock.state);
    apply(clock.state, { t: 'digHole' }, clock.nowMs);
    apply(clock.state, { t: 'feed', item: 'hamburger' }, clock.nowMs);
    expect(JSON.stringify(clock.state)).toBe(before);
  });

  it('never throws, whatever it is handed', () => {
    const clock = at('2026-01-01T00:00Z');
    expect(() => apply(clock.state, { t: 'harvest', plot: -1 }, clock.nowMs)).not.toThrow();
    expect(apply(clock.state, { t: 'harvest', plot: 3 }, clock.nowMs)).toMatchObject({
      ok: false,
      code: 'NOT_UNLOCKED',
    });
  });

  it('is deterministic: same save, same intent, byte-identical result', () => {
    const a = at('2026-01-01T00:00Z').advanceHours(5);
    const b = at('2026-01-01T00:00Z').advanceHours(5);
    a.do({ t: 'digHole' }).do({ t: 'feed', item: 'hamburger' });
    b.do({ t: 'digHole' }).do({ t: 'feed', item: 'hamburger' });
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});
