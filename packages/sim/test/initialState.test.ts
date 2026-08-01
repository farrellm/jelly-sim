import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/initialState.js';
import { SIM_VERSION } from '../src/version.js';

const NOW = Date.UTC(2026, 7, 1, 12, 0, 0);

const newGame = () => createInitialState({ beanName: 'Beanie', nowMs: NOW, seed: 0xc0ffee });

describe('createInitialState', () => {
  it('is deterministic for the same inputs', () => {
    expect(newGame()).toEqual(newGame());
  });

  it('starts a larva with full meters and nothing else', () => {
    const s = newGame();
    expect(s.bean.stage).toBe('larva');
    expect(s.bean.needs).toEqual({ hunger: 100, warmth: 100, rest: 100, mood: 100 });
    expect(s.bean.holes).toBe(0);
    expect(s.wallet).toEqual({ jellyCoins: 0, beanBucks: 0, bonusBeans: 0 });
    expect(s.progress.level).toBe(1);
    expect(s.island.tiles).toEqual([]);
    expect(s.island.plots).toEqual([]);
  });

  it('stamps the sim version and the caller-supplied clock', () => {
    const s = newGame();
    expect(s.simVersion).toBe(SIM_VERSION);
    expect(s.worldMs).toBe(NOW);
    expect(s.bean.stageEnteredMs).toBe(NOW);
    expect(s.daily.dayKey).toBe('2026-08-01');
  });

  it('seeds a usable rng from the caller-supplied entropy', () => {
    const a = createInitialState({ beanName: 'A', nowMs: NOW, seed: 1 });
    const b = createInitialState({ beanName: 'A', nowMs: NOW, seed: 2 });
    expect(a.rng).not.toEqual(b.rng);
    expect(a.rng.some((w) => w !== 0)).toBe(true);
  });

  it('records baby mode, which is chosen at creation and immutable thereafter', () => {
    expect(newGame().mode).toBe('regular');
    expect(createInitialState({ beanName: 'B', nowMs: NOW, seed: 1, mode: 'baby' }).mode).toBe(
      'baby',
    );
  });

  it('round-trips through JSON, since it is stored as a jsonb blob', () => {
    const s = newGame();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
