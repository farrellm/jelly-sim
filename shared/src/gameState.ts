/**
 * The canonical, versioned save shape (DESIGN.md §6).
 *
 * One `GameState` object is the entire save. It is produced and mutated only by the pure
 * functions in `sim.ts`; the server stores it verbatim and never re-simulates it.
 */

export const SAVE_VERSION = 1;

export type LifeStage = "larva" | "pupa" | "sprout" | "adult" | "elder";

/** 0..100, higher = better. Anger is tracked separately (see `JellyBean.anger`). */
export type Mood = "hunger" | "warmth" | "energy" | "happiness";

export const MOODS: readonly Mood[] = ["hunger", "warmth", "energy", "happiness"];

export const LIFE_STAGES: readonly LifeStage[] = ["larva", "pupa", "sprout", "adult", "elder"];

export interface JellyBean {
  name: string;
  stage: LifeStage;
  level: number; // long-tail progression (CONCEPT: level 1497 exists)
  xp: number;
  flavor: string; // active unlocked flavor
  unlockedFlavors: string[];
  moods: Record<Mood, number>;
  anger: number; // 0..100 (higher = angrier); distinct from happiness
  skills: {
    kitchen: boolean; // self-sufficiency: reduces hunger decay
    trade: "blacksmith" | null;
    hobby: "swordsmith" | null;
  };
  education: { inCollege: boolean; graduated: boolean };
  job: { title: string | null; incomePerTick: number };
}

export type BuildingType = "house" | "toilet" | "hamburgerStand" | "farm" | "workshop";

export interface Building {
  id: string;
  type: BuildingType;
  plot: number;
  builtAt: number;
}

export interface Village {
  plots: number; // unlocked plot count
  buildings: Building[];
  weather: "clear" | "rain"; // rain is "cozy" per CONCEPT
  neighbors: number; // other jelly beans in the village
}

export interface Wallet {
  jellyCoins: number;
  beanBucks: number;
  bonusBeans: number;
}

export interface QuestState {
  activeQuestIds: string[]; // from Dr. Bubblegum
  completedQuestIds: string[];
}

export interface CombatProgress {
  candyCastleCleared: boolean;
  watermelonWitchDefeated: boolean;
  highestFloor: number;
}

export interface GameState {
  saveVersion: number; // === SAVE_VERSION; drives migrations
  lastTickAt: number; // epoch ms; used for offline catch-up
  playMode: "regular" | "baby";
  expansions: { viking: boolean };
  bean: JellyBean;
  village: Village;
  wallet: Wallet;
  quests: QuestState;
  combat: CombatProgress;
  stats: { totalPlayMs: number; holesDug: number };
}

/**
 * A brand-new save: a larva-stage Jelly Bean on the starting plot Dr. Bubblegum grants you
 * (CONCEPT §8), with moods full and an empty village.
 */
export function createNewGame(name: string, now: number = Date.now()): GameState {
  return {
    saveVersion: SAVE_VERSION,
    lastTickAt: now,
    playMode: "regular",
    expansions: { viking: false },
    bean: {
      name,
      stage: "larva",
      level: 1,
      xp: 0,
      flavor: "cherry",
      unlockedFlavors: ["cherry"],
      moods: { hunger: 80, warmth: 80, energy: 80, happiness: 80 },
      anger: 0,
      skills: { kitchen: false, trade: null, hobby: null },
      education: { inCollege: false, graduated: false },
      job: { title: null, incomePerTick: 0 },
    },
    village: {
      plots: 1,
      buildings: [],
      weather: "clear",
      neighbors: 0,
    },
    wallet: { jellyCoins: 25, beanBucks: 0, bonusBeans: 0 },
    quests: { activeQuestIds: [], completedQuestIds: [] },
    combat: { candyCastleCleared: false, watermelonWitchDefeated: false, highestFloor: 0 },
    stats: { totalPlayMs: 0, holesDug: 0 },
  };
}
