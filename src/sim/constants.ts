import type { GameMode, LifeStage } from './types';

export const CURRENT_SCHEMA_VERSION = 1;

/** Fixed simulation step (10 Hz) for deterministic active ticks. */
export const FIXED_TICK_DT = 0.1;

/** Offline catch-up cap (12 hours in seconds). */
export const MAX_OFFLINE_SECONDS = 12 * 3600;

/** Coarse simulation step (60 seconds) used during offline catch-up. */
export const OFFLINE_STEP_SECONDS = 60;

export const NEED_MIN = 0;
export const NEED_MAX = 100;

/** Needs below this value trigger low-threshold voice/speech cues. */
export const LOW_NEED_THRESHOLD = 30;

/** Needs below this value cause anger to climb. */
export const CRITICAL_NEED_THRESHOLD = 20;

/** Needs at or above this value allow anger to gradually cool off. */
export const CALM_NEED_THRESHOLD = 40;

/** Anger threshold for entering the Angry visual/gameplay state. */
export const ANGRY_THRESHOLD = 50;

/** Anger cap during Regular Mode offline catch-up so beans are grumpy, never broken. */
export const REGULAR_OFFLINE_ANGER_CAP = 85;

/** Baby Mode Mega Tantrum threshold. */
export const MEGA_TANTRUM_THRESHOLD = 100;

export interface ModeNeedRates {
  hungerPerMin: number;
  warmthPerMin: number;
  warmthColdPerMin: number;
  sleepPerMin: number;
  hygienePerMin: number;
  moodDriftPerMin: number;
  moodBaseDecayPerMin: number;
  cozyRainMoodBoostPerMin: number;
  angerClimbPerMin: number;
  angerDecayPerMin: number;
  needFloor: number;
}

/**
 * Exact need decay & safety floor parameters from DESIGN.md §3.1.
 */
export const MODE_NEED_RATES: Record<GameMode, ModeNeedRates> = {
  regular: {
    hungerPerMin: 2.2,
    warmthPerMin: 0.8,
    warmthColdPerMin: 3.5,
    sleepPerMin: 1.5,
    hygienePerMin: 1.3,
    moodDriftPerMin: 1.8,
    moodBaseDecayPerMin: 0,
    cozyRainMoodBoostPerMin: 1.5,
    angerClimbPerMin: 4.0,
    angerDecayPerMin: 3.0,
    needFloor: 10,
  },
  baby: {
    hungerPerMin: 4.4,
    warmthPerMin: 1.6,
    warmthColdPerMin: 6.5,
    sleepPerMin: 3.0,
    hygienePerMin: 2.8,
    moodDriftPerMin: 1.8,
    moodBaseDecayPerMin: 2.0,
    cozyRainMoodBoostPerMin: 1.5,
    angerClimbPerMin: 9.0,
    angerDecayPerMin: 2.0,
    needFloor: 0,
  },
};

/** Core care action values (DESIGN.md §3.1). */
export const CARE_ACTIONS = {
  appleHungerRestore: 35,
  appleMoodBonus: 4,
  appleAngerRelief: 6,
  appleFeedXp: 15,
  appleFeedCoins: 8,
  appleShopCost: 5,

  /** +25 sleep per 10 seconds of active rest (+2.5 / sec). */
  sleepActiveRestorePerSec: 2.5,
  /** Slowed non-sleep decay while peacefully napping. */
  sleepingOtherDecayMultiplier: 0.5,

  spongeBathHygieneRestore: 45,
  spongeBathXp: 6,
  spongeBathCoins: 4,

  hearthWarmthRestore: 40,
  hearthXp: 6,

  blanketWarmthRestore: 100,
  blanketDurationSec: 20 * 60,
  blanketColdResistance: 0.9,
  blanketAngerRelief: 10,

  petMoodRestore: 12,
  petAngerRelief: 5,
  petXp: 4,
  petCoins: 3,

  kitchenAutoFeedThreshold: 45,
  kitchenAutoMealHungerRestore: 55,
  kitchenAutoToastHungerRestore: 35,
} as const;

export const INITIAL_STARTER_CONFIG = {
  defaultBeanName: 'Jelly Bean',
  defaultParentTitle: 'Mama',
  defaultFlavorId: 'classic_cherry',
  defaultRngSeed: 0x4a454c4c,
  initialApples: 5,
  initialJellyCoins: 25,
  initialBeanBucks: 0,
  initialWeatherDurationMs: 8 * 60 * 1000,
  maxNameLength: 24,
  maxParentTitleLength: 16,
  starterNeeds: {
    hunger: 75,
    warmth: 85,
    sleep: 80,
    hygiene: 85,
    mood: 80,
  },
} as const;

export const PARENT_TITLE_PRESETS = ['Mama', 'Papa', 'Captain'] as const;

export const RING0_TILE_IDS = [
  'plot_pad_0',
  'plot_pad_1',
  'plot_pad_2',
  'plot_pad_3',
  'plot_pad_4',
  'plot_pad_5',
  'plot_pad_6',
] as const;

/**
 * Polynomial XP curve tuned to scale smoothly from Level 1 to Level 1497+ (DESIGN.md §3.2).
 */
export function xpForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.floor(40 + 12 * safeLevel + 0.08 * safeLevel * safeLevel);
}

/**
 * Maps a Jelly Bean's numeric level to one of the 5 canonical Life Stages (DESIGN.md §3.2).
 */
export function stageForLevel(level: number): LifeStage {
  if (level >= 150) return 'legend';
  if (level >= 60) return 'career';
  if (level >= 30) return 'scholar';
  if (level >= 10) return 'sprout';
  return 'larva';
}
