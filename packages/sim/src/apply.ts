import { wake } from './advance.js';
import type { Action, ApplyResult, RejectCode } from './action.js';
import {
  BLANKET_WARMTH,
  FILL_HOLE_COST_BB,
  FOOD_VALUE,
  SPACE_COST_BB,
  SPACE_MOOD_GAIN,
  type ItemId,
} from './content.js';
import type { SimEvent } from './events.js';
import { clampMood, clampNeed } from './needs.js';
import type { PlayerState } from './state.js';

/**
 * Attempt one player intent at a given instant (§4.1).
 *
 * Never throws. A refusal is a value with a code the UI can branch on, because "you cannot
 * afford this" and "something broke" deserve very different screens. The caller is expected
 * to have advanced the save to `atMs` already; `apply` does not move the clock.
 */
export function apply(state: PlayerState, action: Action, atMs: number): ApplyResult {
  // Cloned per attempt so a rejection halfway through leaves the caller's save untouched.
  const next = JSON.parse(JSON.stringify(state)) as PlayerState;
  const events: SimEvent[] = [];

  switch (action.t) {
    case 'feed':
      return feed(next, events, action.item);
    case 'warm':
      return warm(next, events, action.item);
    case 'sleep':
      return sleep(next, events, atMs);
    case 'giveSpace':
      return giveSpace(next, events);
    case 'digHole':
      return digHole(next, events);
    case 'fillHole':
      return fillHole(next, events);
    default:
      // Everything else in the §4.4 union is a later phase. Refusing by name beats
      // pretending an intent succeeded and leaving the client's prediction to rot.
      return reject('NOT_UNLOCKED', `${action.t} is not part of the game yet.`);
  }
}

function reject(code: RejectCode, message: string): ApplyResult {
  return { ok: false, code, message };
}

function ok(state: PlayerState, events: SimEvent[]): ApplyResult {
  return { ok: true, state, events };
}

function take(state: PlayerState, item: ItemId): boolean {
  const held = state.inventory[item] ?? 0;
  if (held < 1) return false;
  if (held === 1) delete state.inventory[item];
  else state.inventory[item] = held - 1;
  return true;
}

/** Hungry `[C§5]`. The hamburger stand and its 12 jc alternative arrive with buildings. */
function feed(state: PlayerState, events: SimEvent[], item: ItemId): ApplyResult {
  const value = FOOD_VALUE[item];
  if (value === undefined) return reject('NOT_READY', 'Your Jelly Bean will not eat that.');
  if (!take(state, item)) return reject('NOT_READY', `You have no ${item.replace(/_/g, ' ')}.`);

  state.bean.needs.hunger = clampNeed(state.bean.needs.hunger + value);
  return ok(state, events);
}

/**
 * Cold `[C§5]`. ⚙ The blanket is consumed. §5.1 prices cold at "gathering time", which is
 * only a recurring cost if the blanket is; a permanent one would make warmth free forever
 * after a single afternoon of collecting feathers.
 */
function warm(state: PlayerState, events: SimEvent[], item: ItemId): ApplyResult {
  if (item !== 'blanket') return reject('NOT_READY', 'That will not keep anyone warm.');
  if (!take(state, item)) return reject('NOT_READY', 'You have no blanket. Knit one first.');

  state.bean.needs.warmth = clampNeed(BLANKET_WARMTH);
  return ok(state, events);
}

/**
 * Sleepy `[C§5]` — the one free resolution.
 *
 * ⚙ A toggle rather than a second action: tapping it while the Jelly Bean is asleep wakes
 * it, which keeps the §4.4 union as written. ⚙ No bed is required yet; the bed is a Phase 3
 * building and the gate lands with it.
 */
function sleep(state: PlayerState, events: SimEvent[], atMs: number): ApplyResult {
  if (state.bean.asleepSinceMs !== null) {
    wake(state);
    events.push({ t: 'woke', atMs });
    return ok(state, events);
  }

  state.bean.asleepSinceMs = atMs;
  return ok(state, events);
}

/**
 * Angry `[C§5]` — the expensive need, and the one the whole economy is built around.
 *
 * Fourteen bean bucks is canon: a player being 14 short is the game's most quoted moment
 * `[C§11]`. A new save has zero, on purpose. Do not make this affordable.
 */
function giveSpace(state: PlayerState, events: SimEvent[]): ApplyResult {
  if (state.wallet.beanBucks < SPACE_COST_BB) {
    return reject(
      'INSUFFICIENT_FUNDS',
      `You need ${SPACE_COST_BB} bean bucks to give your Jelly Bean space.`,
    );
  }

  state.wallet.beanBucks -= SPACE_COST_BB;
  state.counters.spacesGiven += 1;

  // Clamped to the ceiling, which is where the holes are waiting. A player who has been
  // digging pays 14 bean bucks for less mood than the number says, and is told nothing.
  state.bean.needs.mood = clampMood(state, state.bean.needs.mood + SPACE_MOOD_GAIN);
  return ok(state, events);
}

/**
 * Free, instant, unlimited, and satisfying `[C§5, C§9]`.
 *
 * It always succeeds. It costs nothing. It lowers the mood ceiling by 1.5, permanently,
 * and emits no event saying so — a player who digs while their Jelly Bean is angry is
 * making it worse and will attribute the mood drop to whatever else just happened.
 *
 * This is the game's best joke and it only works because nothing anywhere explains it.
 * Read CLAUDE.md before adding a tooltip, a stat page, an achievement, or a changelog line.
 */
function digHole(state: PlayerState, events: SimEvent[]): ApplyResult {
  state.bean.holes += 1;
  state.counters.holesDugTotal += 1;

  // The ceiling just dropped, so mood may have to come down with it. Silently.
  state.bean.needs.mood = clampMood(state, state.bean.needs.mood);
  return ok(state, events);
}

/** Twenty-five bean bucks buys back the 1.5 (§5.1). Also unexplained. */
function fillHole(state: PlayerState, events: SimEvent[]): ApplyResult {
  if (state.bean.holes < 1) return reject('NOT_READY', 'There is nothing to fill in.');
  if (state.wallet.beanBucks < FILL_HOLE_COST_BB) {
    return reject('INSUFFICIENT_FUNDS', `Filling a hole costs ${FILL_HOLE_COST_BB} bean bucks.`);
  }

  state.wallet.beanBucks -= FILL_HOLE_COST_BB;
  state.bean.holes -= 1;
  return ok(state, events);
}
