/**
 * Tunable economy and simulation constants (DESIGN.md §7, §8).
 *
 * Everything a designer would want to balance lives here, not inside `sim.ts`.
 */

import type { LifeStage, Mood } from "./gameState.js";

/** Logic tick cadence the client aims for. Animations run independently. */
export const TICK_INTERVAL_MS = 1_000;

/**
 * Mood points lost per minute at the baseline (`regular` mode, adult stage).
 * Happiness is not decayed directly — it follows from the other needs and anger.
 */
export const BASE_DECAY_PER_MIN: Record<Mood, number> = {
  hunger: 1.2,
  warmth: 0.9,
  energy: 0.7,
  happiness: 0,
};

/** Younger beans are needier. Multiplies `BASE_DECAY_PER_MIN`. */
export const STAGE_DECAY_MULTIPLIER: Record<LifeStage, number> = {
  larva: 1.4,
  pupa: 1.2,
  sprout: 1.0,
  adult: 0.9,
  elder: 1.1,
};

/** Baby mode "is a lot harder than regular mode" (CONCEPT §11). */
export const PLAY_MODE_DECAY_MULTIPLIER = {
  regular: 1,
  baby: 1.6,
} as const;

/** Kitchen skills make the bean self-sufficient at mealtimes (CONCEPT §6). */
export const KITCHEN_HUNGER_DECAY_MULTIPLIER = 0.5;

/** Below this a mood is "critical": the bean calls out and anger starts building. */
export const CRITICAL_MOOD = 25;

/** At or above this on every mood, the bean is content and calms down. */
export const CONTENT_MOOD = 60;

/** Anger points gained per minute for each mood that is currently critical. */
export const ANGER_PER_CRITICAL_MOOD_PER_MIN = 2.5;

/** Anger points shed per minute while every mood is at or above `CONTENT_MOOD`. */
export const ANGER_DECAY_PER_MIN = 1.5;

/** Happiness tracks the average of the tended needs, dragged down by anger. */
export const HAPPINESS_ANGER_WEIGHT = 0.6;

/** How fast happiness eases toward its target, per minute. */
export const HAPPINESS_APPROACH_PER_MIN = 12;

/**
 * Offline decay is capped so a week away doesn't nuke the bean (DESIGN.md §7).
 */
export const MAX_OFFLINE_CATCHUP_MS = 8 * 60 * 60 * 1_000;

/** Effects of the M1 care actions (DESIGN.md §7 table). */
export const ACTION_EFFECTS = {
  feed: { mood: "hunger", amount: 30, jellyCoins: 0 },
  knitBlanket: { mood: "warmth", amount: 35, jellyCoins: 0 },
  sleep: { mood: "energy", amount: 45, jellyCoins: 0 },
} as const satisfies Record<string, { mood: Mood; amount: number; jellyCoins: number }>;

/** XP granted for tending a need. */
export const XP_PER_CARE_ACTION = 2;

/**
 * Cost table (DESIGN.md §8). Only `GIVE_SPACE_COST_BEAN_BUCKS` is fixed by CONCEPT — the rest
 * are tunable and get wired up in M2 alongside the village builder.
 */
export const COSTS = {
  /** CONCEPT §4: giving the Jelly Bean space costs 14 bean bucks. */
  giveSpaceBeanBucks: 14,
  toiletJellyCoins: 50,
  hamburgerStandJellyCoins: 120,
  extraPlotJellyCoins: 200,
} as const;

export const MOOD_FLOOR = 0;
export const MOOD_CEILING = 100;

export function clampMood(value: number): number {
  return Math.min(MOOD_CEILING, Math.max(MOOD_FLOOR, value));
}
