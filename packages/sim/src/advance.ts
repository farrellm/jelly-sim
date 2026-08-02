import {
  BABY_DECAY_MULTIPLIER,
  BARK_FOR_NEED,
  BARK_LINES,
  BARK_PRIORITY,
  BARK_THRESHOLD,
  DECAYING_NEEDS,
  MOOD_NEGLECT_BELOW,
  MOOD_NEGLECT_PER_HOUR,
  MOOD_RECOVERY_ABOVE,
  MOOD_RECOVERY_PER_HOUR,
  NEED_DECAY_PER_HOUR,
  SLEEP_REST_PER_HOUR,
  SLEEPING_HUNGER_MULTIPLIER,
  WET_WEATHERS,
  WET_WEATHER_WARMTH_MULTIPLIER,
  type DecayingNeed,
  type NeedId,
} from './content.js';
import type { SimEvent } from './events.js';
import { clampMood, clampNeed, isNeglected, isThriving } from './needs.js';
import { nextInt } from './rng.js';
import type { PlayerState } from './state.js';
import { MAX_CATCHUP_MS, MS_PER_HOUR, MS_PER_TICK, utcDayKey } from './time.js';

/** A tick is a minute, and every rate in content.ts is per hour. */
const TICKS_PER_HOUR = MS_PER_HOUR / MS_PER_TICK;

export interface AdvanceResult {
  state: PlayerState;
  events: SimEvent[];
}

/**
 * Fast-forward a save from its own last simulated instant to `toMs` (§4.3).
 *
 * ⚙ **Whole ticks only.** The step is a fixed sim minute and `advance` consumes as many
 * whole ones as fit; the sub-minute remainder stays unconsumed rather than being rounded
 * away. That is what makes the §13.1 composition property exact for an *arbitrary* split
 * point — `advance(advance(s, m), b)` equals `advance(s, b)` for any m, not just for ones
 * that happen to land on a minute boundary. Multi-device play depends on it.
 *
 * ⚙ **Two arguments, not three.** DESIGN.md §4.1 originally specified
 * `advance(state, fromMs, toMs)`, but the start instant cannot be a parameter: the only
 * value that can be trusted to say what has already been simulated is the save's own
 * `worldMs`, and honouring a caller-supplied `fromMs` is exactly what would discard the
 * carried remainder and break composition at a non-boundary split. A parameter that must
 * be ignored to stay correct is better not taken.
 *
 * Time never runs backwards here: a client whose clock is behind the server's gets a
 * no-op, not a rewind.
 */
export function advance(state: PlayerState, toMs: number): AdvanceResult {
  const events: SimEvent[] = [];

  // The save is a jsonb blob by construction, so a JSON round-trip is a lossless clone —
  // and one that cannot silently carry a class instance or an undefined into the database.
  const next = JSON.parse(JSON.stringify(state)) as PlayerState;

  // §4.3: an absence longer than a month is simulated as a month. A player returning after
  // a year finds a very hungry Jelly Bean rather than a request that timed out.
  if (toMs - next.worldMs > MAX_CATCHUP_MS) next.worldMs = toMs - MAX_CATCHUP_MS;

  const steps = Math.floor((toMs - next.worldMs) / MS_PER_TICK);
  if (steps <= 0) return { state: next, events };

  for (let step = 0; step < steps; step += 1) {
    tick(next, events);
  }

  return { state: next, events };
}

/** One sim minute, in the order §4.3 lays out. Mutates `state` in place; it is a clone. */
function tick(state: PlayerState, events: SimEvent[]): void {
  const before: Record<NeedId, number> = { ...state.bean.needs };

  // 1. Advance the world clock. Weather and the day phase join this step in Phase 3.
  state.worldMs += MS_PER_TICK;
  rollDay(state);

  // 2. Decay the three meters that decay.
  decay(state);

  // 3. Kitchen-skill auto-feed — Phase 4.

  // 4. Mood, which is derived rather than decayed.
  updateMood(state);

  // 5. Crop and gathering timers — Phase 2.
  // 6. Passive trade production — Phase 4.
  // 7. Adventure energy regen — Phase 5.

  // 8. Say something about it.
  emitBarks(state, before, events);
}

/** Daily counters key off a UTC day (§5.3, §5.10), so they reset when the key changes. */
function rollDay(state: PlayerState): void {
  const dayKey = utcDayKey(state.worldMs);
  if (dayKey === state.daily.dayKey) return;
  state.daily = { dayKey, minigamePlays: {}, giftsSent: 0 };
}

function decay(state: PlayerState): void {
  const { bean } = state;
  const rates = NEED_DECAY_PER_HOUR[bean.stage];
  const asleep = bean.asleepSinceMs !== null;
  const modeMultiplier = state.mode === 'baby' ? BABY_DECAY_MULTIPLIER : 1;
  const wet = WET_WEATHERS.includes(state.island.weather);

  for (const need of DECAYING_NEEDS) {
    // ⚙ Sleeping suspends rest decay rather than racing it. §5.1 says sleep restores
    // "+10/h while asleep", but every stage loses rest at 10/h or more, so read as a race
    // the one free resolution in the game could never resolve anything.
    if (need === 'rest' && asleep) continue;

    let perHour = rates[need] * modeMultiplier;
    if (need === 'warmth' && wet) perHour *= WET_WEATHER_WARMTH_MULTIPLIER;
    if (need === 'hunger' && asleep) perHour *= SLEEPING_HUNGER_MULTIPLIER;
    bean.needs[need] = clampNeed(bean.needs[need] - perHour / TICKS_PER_HOUR);
  }

  if (!asleep) return;

  // Sleeping is the one thing that fills a meter without the player spending anything. The
  // gain is not scaled by baby mode: babies decay faster, they do not sleep worse.
  bean.needs.rest = clampNeed(bean.needs.rest + SLEEP_REST_PER_HOUR / TICKS_PER_HOUR);
  if (bean.needs.rest >= 100) wake(state);
}

/** The Jelly Bean gets up on its own once it has slept enough. */
export function wake(state: PlayerState): void {
  state.bean.asleepSinceMs = null;
}

function updateMood(state: PlayerState): void {
  const { needs } = state.bean;

  // Neglect and recovery are mutually exclusive: one need below 20 cannot coexist with
  // every need above 60. In between, mood simply holds.
  let delta = 0;
  if (isNeglected(state, MOOD_NEGLECT_BELOW)) delta = MOOD_NEGLECT_PER_HOUR / TICKS_PER_HOUR;
  else if (isThriving(state, MOOD_RECOVERY_ABOVE)) delta = MOOD_RECOVERY_PER_HOUR / TICKS_PER_HOUR;

  // The clamp is where the ceiling bites. Nothing downstream is told why.
  needs.mood = clampMood(state, needs.mood + delta);
}

/**
 * Bark on the way *down* through the threshold, not on every tick below it.
 *
 * Crossing-based emission means the sim needs no throttle state in the save, and a
 * fourteen-hour catch-up produces the handful of barks that actually happened rather than
 * 840 copies of the same complaint. §10.6's one-bark-per-need-per-five-minutes rule is a
 * playback concern and lives in the client's audio layer.
 */
function emitBarks(state: PlayerState, before: Record<NeedId, number>, events: SimEvent[]): void {
  for (const need of BARK_PRIORITY) {
    const now = state.bean.needs[need];
    if (before[need] < BARK_THRESHOLD || now >= BARK_THRESHOLD) continue;

    const id = BARK_FOR_NEED[need];
    const lines = BARK_LINES[id];
    const draw = nextInt(state.rng, lines.length);
    state.rng = draw.state;

    events.push({
      t: 'bark',
      id,
      need,
      text: lines[draw.value] ?? lines[0] ?? '',
      atMs: state.worldMs,
    });
  }
}

/** Exported for the tests that assert the decay table is applied as written. */
export function decayPerHour(state: PlayerState, need: DecayingNeed): number {
  const base = NEED_DECAY_PER_HOUR[state.bean.stage][need];
  const modeMultiplier = state.mode === 'baby' ? BABY_DECAY_MULTIPLIER : 1;
  const wet = need === 'warmth' && WET_WEATHERS.includes(state.island.weather);
  const asleep = need === 'hunger' && state.bean.asleepSinceMs !== null;

  return (
    base *
    modeMultiplier *
    (wet ? WET_WEATHER_WARMTH_MULTIPLIER : 1) *
    (asleep ? SLEEPING_HUNGER_MULTIPLIER : 1)
  );
}
