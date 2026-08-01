/**
 * The simulation (DESIGN.md §7).
 *
 * Every function here is **pure**: it takes a `GameState` and returns a new one, never mutating
 * the input. The client runs these on a timer; the server imports the same module if it ever
 * needs to validate a save. Put game rules here, not in the UI.
 */

import {
  ANGER_DECAY_PER_MIN,
  ANGER_PER_CRITICAL_MOOD_PER_MIN,
  ACTION_EFFECTS,
  BASE_DECAY_PER_MIN,
  CONTENT_MOOD,
  CRITICAL_MOOD,
  HAPPINESS_ANGER_WEIGHT,
  HAPPINESS_APPROACH_PER_MIN,
  KITCHEN_HUNGER_DECAY_MULTIPLIER,
  MAX_OFFLINE_CATCHUP_MS,
  PLAY_MODE_DECAY_MULTIPLIER,
  STAGE_DECAY_MULTIPLIER,
  TICK_INTERVAL_MS,
  XP_PER_CARE_ACTION,
  clampMood,
} from "./economy.js";
import { ANGRY_CALLOUT, MOOD_INFO } from "./content.js";
import type { GameState, Mood } from "./gameState.js";

/** The needs that decay on their own. Happiness is derived from them plus anger. */
const DECAYING_MOODS = ["hunger", "warmth", "energy"] as const satisfies readonly Mood[];

/** Anger at or above this makes the bean sulk visibly. */
export const SULKING_ANGER = 50;

/**
 * Care actions (DESIGN.md §7). M1 ships the three needs-tending actions; `giveSpace` and
 * `digHoles` join this union in M2.
 */
export type CareAction = { type: "feed" } | { type: "knitBlanket" } | { type: "sleep" };

export type ActionFailure =
  | "moodAlreadyFull"
  | "insufficientJellyCoins"
  | "insufficientBeanBucks";

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; error: ActionFailure };

/** Per-minute decay for one mood, accounting for stage, play mode and kitchen skills. */
export function decayRatePerMin(state: GameState, mood: Mood): number {
  const base = BASE_DECAY_PER_MIN[mood];
  if (base === 0) return 0;

  let rate =
    base * STAGE_DECAY_MULTIPLIER[state.bean.stage] * PLAY_MODE_DECAY_MULTIPLIER[state.playMode];

  // Kitchen skills make the bean self-sufficient at mealtimes (CONCEPT §6).
  if (mood === "hunger" && state.bean.skills.kitchen) {
    rate *= KITCHEN_HUNGER_DECAY_MULTIPLIER;
  }
  return rate;
}

/**
 * Advance the simulation by `dtMs`. Decays needs, accrues or sheds anger, settles happiness and
 * pays job income. `lastTickAt` moves forward by exactly `dtMs` so repeated ticks compose.
 */
export function tick(state: GameState, dtMs: number): GameState {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return state;

  const minutes = dtMs / 60_000;

  const moods = { ...state.bean.moods };
  for (const mood of DECAYING_MOODS) {
    moods[mood] = clampMood(moods[mood] - decayRatePerMin(state, mood) * minutes);
  }

  const criticalCount = DECAYING_MOODS.filter((mood) => moods[mood] < CRITICAL_MOOD).length;
  const allContent = DECAYING_MOODS.every((mood) => moods[mood] >= CONTENT_MOOD);

  let anger = state.bean.anger;
  if (criticalCount > 0) {
    anger += criticalCount * ANGER_PER_CRITICAL_MOOD_PER_MIN * minutes;
  } else if (allContent) {
    anger -= ANGER_DECAY_PER_MIN * minutes;
  }
  anger = clampMood(anger);

  moods.happiness = approach(
    moods.happiness,
    happinessTarget(moods, anger),
    HAPPINESS_APPROACH_PER_MIN * minutes,
  );

  const ticks = dtMs / TICK_INTERVAL_MS;
  const earned = state.bean.job.incomePerTick * ticks;

  return {
    ...state,
    lastTickAt: state.lastTickAt + dtMs,
    bean: { ...state.bean, moods, anger },
    wallet: { ...state.wallet, jellyCoins: state.wallet.jellyCoins + earned },
    stats: { ...state.stats, totalPlayMs: state.stats.totalPlayMs + dtMs },
  };
}

/**
 * Catch the save up to `now` in one step, clamping the penalty so a long absence doesn't nuke
 * the bean (DESIGN.md §7). Time beyond the cap is forgiven, not simulated.
 */
export function offlineCatchup(state: GameState, now: number = Date.now()): GameState {
  const elapsed = now - state.lastTickAt;
  if (elapsed <= 0) return { ...state, lastTickAt: now };

  const applied = Math.min(elapsed, MAX_OFFLINE_CATCHUP_MS);
  return { ...tick(state, applied), lastTickAt: now };
}

/** How long the player was away, and how much of that the sim will actually charge them for. */
export function offlineCatchupSummary(
  state: GameState,
  now: number = Date.now(),
): { elapsedMs: number; appliedMs: number; forgivenMs: number } {
  const elapsedMs = Math.max(0, now - state.lastTickAt);
  const appliedMs = Math.min(elapsedMs, MAX_OFFLINE_CATCHUP_MS);
  return { elapsedMs, appliedMs, forgivenMs: elapsedMs - appliedMs };
}

/** Apply a care action. Rejects rather than wasting the action when the need is already full. */
export function applyAction(state: GameState, action: CareAction): ActionResult {
  const effect = ACTION_EFFECTS[action.type];
  const current = state.bean.moods[effect.mood];

  if (current >= 100) {
    return { ok: false, state, error: "moodAlreadyFull" };
  }
  if (effect.jellyCoins > state.wallet.jellyCoins) {
    return { ok: false, state, error: "insufficientJellyCoins" };
  }

  const moods = { ...state.bean.moods };
  moods[effect.mood] = clampMood(current + effect.amount);
  moods.happiness = approach(
    moods.happiness,
    happinessTarget(moods, state.bean.anger),
    HAPPINESS_APPROACH_PER_MIN,
  );

  return {
    ok: true,
    state: {
      ...state,
      bean: { ...state.bean, moods, xp: state.bean.xp + XP_PER_CARE_ACTION },
      wallet: { ...state.wallet, jellyCoins: state.wallet.jellyCoins - effect.jellyCoins },
    },
  };
}

export interface Callout {
  mood: Mood | "anger";
  message: string;
}

/** What the Jelly Bean is currently shouting at you (CONCEPT §4). */
export function moodCallouts(state: GameState): Callout[] {
  const callouts: Callout[] = [];
  for (const mood of DECAYING_MOODS) {
    if (state.bean.moods[mood] < CRITICAL_MOOD) {
      callouts.push({ mood, message: MOOD_INFO[mood].callout });
    }
  }
  if (state.bean.anger >= SULKING_ANGER) {
    callouts.push({ mood: "anger", message: ANGRY_CALLOUT });
  }
  return callouts;
}

function happinessTarget(moods: Record<Mood, number>, anger: number): number {
  const needsAverage =
    DECAYING_MOODS.reduce((sum, mood) => sum + moods[mood], 0) / DECAYING_MOODS.length;
  return clampMood(needsAverage - HAPPINESS_ANGER_WEIGHT * anger);
}

/** Move `from` toward `to` by at most `maxStep`. */
function approach(from: number, to: number, maxStep: number): number {
  const delta = to - from;
  if (Math.abs(delta) <= maxStep) return clampMood(to);
  return clampMood(from + Math.sign(delta) * maxStep);
}
