import { seedRng } from './rng.js';
import type { PlayerState } from './state.js';
import { utcDayKey } from './time.js';
import { SIM_VERSION } from './version.js';

export interface NewGameOptions {
  beanName: string;
  /** Server clock at registration. Never read from inside this package (§4.2). */
  nowMs: number;
  /** A uint32 from the caller's CSPRNG; the sim has no source of entropy of its own. */
  seed: number;
  mode?: 'regular' | 'baby';
}

/**
 * The state a Jelly Bean starts life in, the moment Dr. Bubblegum grants the plot.
 *
 * A larva with full meters, an empty island, and no money. Everything a player will ever
 * have is earned from here. The one thing worth noticing is what is *absent*: no starting
 * plot, no starting currency, no tutorial gifts — the Arrival quest chain (§5.8) hands
 * those out in Phase 5, and until then the emptiness is the honest state of the game.
 */
export function createInitialState(opts: NewGameOptions): PlayerState {
  const { beanName, nowMs, seed, mode = 'regular' } = opts;

  return {
    simVersion: SIM_VERSION,
    rng: seedRng(seed),
    mode,
    worldMs: nowMs,

    bean: {
      name: beanName,
      flavor: 'original',
      stage: 'larva',
      stageEnteredMs: nowMs,
      careDays: 0,
      needs: { hunger: 100, warmth: 100, rest: 100, mood: 100 },
      holes: 0,
      trade: null,
      hobby: null,
      hp: 30, // 30 + 10 · stageIndex, and larva is index 0 (§5.7)
    },

    progress: {
      level: 1,
      xp: 0,
      skills: [],
      flavorsUnlocked: ['original'],
      enrolledUntilMs: null,
    },

    wallet: { jellyCoins: 0, beanBucks: 0, bonusBeans: 0 },

    island: {
      tiles: [],
      plots: [],
      nodes: [],
      weather: 'clear',
      unlockedParcels: 1,
    },

    inventory: {},
    pantry: 0,

    quests: [],
    adventure: null,
    energy: { value: 60, lastRegenMs: nowMs },

    daily: { dayKey: utcDayKey(nowMs), minigamePlays: {}, giftsSent: 0 },
    counters: { holesDugTotal: 0, spacesGiven: 0, harvests: 0 },
  };
}
