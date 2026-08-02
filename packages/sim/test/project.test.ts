import { describe, expect, it } from 'vitest';
import { project } from '../src/project.js';
import { at } from './harness.js';

const view = (clock: ReturnType<typeof at>) => project(clock.state, clock.nowMs);

describe('project', () => {
  it('rounds the meters for display and leaves the save alone', () => {
    const clock = at('2026-01-01T00:00Z').advanceMinutes(37);
    const before = JSON.stringify(clock.state);

    for (const value of Object.values(view(clock).needs)) {
      expect(Number.isInteger(value)).toBe(true);
    }
    expect(JSON.stringify(clock.state)).toBe(before);
  });

  it('is idempotent — reading it twice gives the same answer', () => {
    const clock = at('2026-01-01T00:00Z').advanceHours(9);
    expect(view(clock)).toEqual(view(clock));
  });

  it('shows the loudest standing complaint, in priority order', () => {
    const clock = at('2026-01-01T00:00Z').advanceHours(4);
    clock.state.bean.needs = { hunger: 10, warmth: 10, rest: 10, mood: 10 };
    expect(view(clock).bark?.need).toBe('hunger');

    clock.state.bean.needs.hunger = 100;
    expect(view(clock).bark?.need).toBe('warmth');

    clock.state.bean.needs.warmth = 100;
    expect(view(clock).bark?.need).toBe('rest');

    clock.state.bean.needs.rest = 100;
    expect(view(clock).bark?.text).toBe('Jelly Bean need space.');
  });

  it('says nothing when the Jelly Bean is content', () => {
    expect(view(at('2026-01-01T00:00Z')).bark).toBeNull();
  });

  it('does not complain about being sleepy while asleep', () => {
    const clock = at('2026-01-01T00:00Z').advanceHours(4);
    clock.state.bean.needs = { hunger: 100, warmth: 100, rest: 5, mood: 100 };
    expect(view(clock).bark?.need).toBe('rest');

    clock.do({ t: 'sleep' });
    expect(view(clock).bark).toBeNull();
    expect(view(clock).asleep).toBe(true);
    expect(view(clock).asleepForMs).toBe(0);
  });

  it('reports what the care row can actually do', () => {
    const clock = at('2026-01-01T00:00Z');
    expect(view(clock).can).toEqual({
      feed: true,
      warm: true,
      giveSpace: false, // a new save has nothing, and that is the point
      fillHole: false,
      dig: true,
    });

    clock.do({ t: 'feed', item: 'hamburger' }, 3);
    clock.do({ t: 'warm', item: 'blanket' });
    clock.state.wallet.beanBucks = 30;
    clock.do({ t: 'digHole' });

    expect(view(clock).can).toEqual({
      feed: false,
      warm: false,
      giveSpace: true,
      fillHole: true,
      dig: true, // always
    });
  });

  it('flags a stalled Jelly Bean without saying what stalled it', () => {
    const clock = at('2026-01-01T00:00Z').advanceHours(14);
    const v = view(clock);
    expect(v.stalled).toBe(true);
    expect(JSON.stringify(v)).not.toMatch(/stall.*(hole|mood)|because/i);
  });
});

/** The other half of the §13.1 absence test: what the UI is handed. */
describe('project never explains the holes', () => {
  const dug = () => {
    const clock = at('2026-01-01T00:00Z').advanceHours(6);
    clock.do({ t: 'digHole' }, 12);
    return view(clock);
  };

  it('reports the hole count as a bare number', () => {
    expect(dug().holes).toBe(12);
  });

  it('exposes no ceiling, cap, or penalty field of any name', () => {
    const serialized = JSON.stringify(dug());
    expect(serialized).not.toMatch(/ceiling/i);
    expect(serialized).not.toMatch(/penalt/i);
    expect(serialized).not.toMatch(/moodMax|maxMood/i);
  });

  it('leaves nothing in the view from which the rule could be read off', () => {
    // A view that reported both mood and its own upper bound would let any client draw the
    // meter with the missing 18 points shaded in, which is the tooltip by other means.
    const v = dug();
    const keys = Object.keys(v).concat(Object.keys(v.needs), Object.keys(v.can));
    expect(keys.filter((k) => /ceiling|cap|limit|max/i.test(k))).toEqual([]);
  });
});
