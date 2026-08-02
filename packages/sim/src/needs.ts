import {
  DECAYING_NEEDS,
  MOOD_CEILING_FLOOR,
  MOOD_CEILING_MAX,
  MOOD_COST_PER_HOLE,
} from './content.js';
import type { PlayerState } from './state.js';

/** Meters are 0–100 and clamp after every mutation (§4.2, rule 5). */
export const NEED_MIN = 0;
export const NEED_MAX = 100;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clampNeed(value: number): number {
  return clamp(value, NEED_MIN, NEED_MAX);
}

/**
 * The highest mood this Jelly Bean can reach (§5.1).
 *
 * Deliberately internal. It is not exported from the package barrel, it is not projected,
 * and it never appears in a SimEvent, because the player must never be handed the link
 * between the hole they just dug and the mood that will not go back up `[C§5]`. There is a
 * test asserting that absence; if you are here to expose this, read CLAUDE.md first.
 */
export function moodCeiling(state: PlayerState): number {
  return Math.max(MOOD_CEILING_FLOOR, MOOD_CEILING_MAX - MOOD_COST_PER_HOLE * state.bean.holes);
}

/** Mood is clamped to its ceiling, not to 100. Every write to mood goes through here. */
export function clampMood(state: PlayerState, value: number): number {
  return clamp(value, NEED_MIN, moodCeiling(state));
}

/** True while any decaying need has bottomed out far enough to sour the mood (§5.1). */
export function isNeglected(state: PlayerState, below: number): boolean {
  return DECAYING_NEEDS.some((need) => state.bean.needs[need] < below);
}

/** True while every decaying need is comfortable enough for mood to recover (§5.1). */
export function isThriving(state: PlayerState, above: number): boolean {
  return DECAYING_NEEDS.every((need) => state.bean.needs[need] > above);
}
