import {
  BARK_FOR_NEED,
  BARK_LINES,
  BARK_PRIORITY,
  BARK_THRESHOLD,
  FILL_HOLE_COST_BB,
  FOOD_VALUE,
  MOOD_PROGRESS_GATE,
  SPACE_COST_BB,
  type BarkId,
  type FlavorId,
  type ItemId,
  type NeedId,
  type Stage,
} from './content.js';
import type { PlayerState } from './state.js';

export interface ProjectedBark {
  id: BarkId;
  need: NeedId;
  text: string;
}

/**
 * What the UI reads. Derived on every read, never persisted (§4.1).
 *
 * The rule that governs this type: a field exists here because a screen draws it. Nothing
 * is exposed "in case it is useful", and in particular nothing here reveals the mood
 * ceiling or connects it to `holes`. `holes` is a count. It sits next to nothing.
 */
export interface ProjectedView {
  name: string;
  flavor: FlavorId;
  stage: Stage;
  level: number;

  /** Rounded for display. The save keeps the fractions; a meter does not need them. */
  needs: Record<NeedId, number>;

  /** The loudest standing complaint, or null if the Jelly Bean is content. */
  bark: ProjectedBark | null;

  asleep: boolean;
  /** How long it has been asleep, for the animation. Null while awake. */
  asleepForMs: number | null;

  /** A number. Nothing else. */
  holes: number;

  wallet: { jellyCoins: number; beanBucks: number; bonusBeans: number };

  /**
   * What the care row can actually do right now, so buttons disable themselves instead of
   * inviting a tap that will be refused.
   */
  can: { feed: boolean; warm: boolean; giveSpace: boolean; fillHole: boolean; dig: boolean };

  /** True while a bottomed-out need is stalling progression (§5.1). Never says which. */
  stalled: boolean;
}

/** Derived, never stored: what the UI reads (§4.1). */
export function project(state: PlayerState, atMs: number): ProjectedView {
  const { bean, wallet } = state;

  return {
    name: bean.name,
    flavor: bean.flavor,
    stage: bean.stage,
    level: state.progress.level,

    needs: {
      hunger: Math.round(bean.needs.hunger),
      warmth: Math.round(bean.needs.warmth),
      rest: Math.round(bean.needs.rest),
      mood: Math.round(bean.needs.mood),
    },

    bark: currentBark(state),

    asleep: bean.asleepSinceMs !== null,
    asleepForMs: bean.asleepSinceMs === null ? null : Math.max(0, atMs - bean.asleepSinceMs),

    holes: bean.holes,

    wallet: { ...wallet },

    can: {
      feed: Object.keys(FOOD_VALUE).some((item) => (state.inventory[item as ItemId] ?? 0) > 0),
      warm: (state.inventory.blanket ?? 0) > 0,
      giveSpace: wallet.beanBucks >= SPACE_COST_BB,
      fillHole: bean.holes > 0 && wallet.beanBucks >= FILL_HOLE_COST_BB,
      // Digging is free and unlimited. It is never unavailable, and it never says why it
      // is worth doing, because it is not.
      dig: true,
    },

    stalled: bean.needs.mood < MOOD_PROGRESS_GATE,
  };
}

/**
 * The bark the bubble should be showing.
 *
 * Distinct from the `bark` SimEvents `advance` emits: those are the moments a need crossed
 * the line and are what the audio layer plays, while this is the standing complaint the
 * bubble keeps on screen until it is resolved.
 *
 * The line is chosen from the save's own PRNG state without advancing it — `project` is
 * pure and returns no state, so it has nothing to advance. The same save always shows the
 * same line, which is also what stops the bubble flickering between two of them every
 * second the ticker runs.
 */
function currentBark(state: PlayerState): ProjectedBark | null {
  for (const need of BARK_PRIORITY) {
    if (state.bean.needs[need] >= BARK_THRESHOLD) continue;
    // A sleeping Jelly Bean does not complain about being sleepy.
    if (need === 'rest' && state.bean.asleepSinceMs !== null) continue;

    const id = BARK_FOR_NEED[need];
    const lines = BARK_LINES[id];
    const index = (state.rng[0] >>> 0) % lines.length;
    return { id, need, text: lines[index] ?? lines[0] ?? '' };
  }

  return null;
}
