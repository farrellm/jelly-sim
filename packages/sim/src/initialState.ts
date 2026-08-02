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
 * have is earned from here — no starting plot, no starting currency, and in particular no
 * bean bucks, because a new player being unable to afford the 14 for space is the tension
 * the whole economy hangs off `[C§11]`.
 *
 * ⚙ The one exception is the arrival basket below, and it is scaffolding. Feeding needs an
 * item and warming needs a blanket, but crops, gathering, and crafting are all Phase 2, so
 * without a basket the Phase 1 care loop is a bark you cannot answer. The Arrival quest
 * chain (§5.8) hands out a real starter kit in Phase 5; this goes away when it lands.
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
      asleepSinceMs: null,
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

    // ⚙ The arrival basket. Phase 1 scaffolding — see the note above.
    inventory: { hamburger: 3, blanket: 1 },
    pantry: 0,

    quests: [],
    adventure: null,
    energy: { value: 60, lastRegenMs: nowMs },

    daily: { dayKey: utcDayKey(nowMs), minigamePlays: {}, giftsSent: 0 },
    counters: { holesDugTotal: 0, spacesGiven: 0, harvests: 0 },
  };
}
