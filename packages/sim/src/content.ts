/**
 * Content identifiers.
 *
 * DESIGN.md §5 is emphatic that game content is *data*, not code branches: decay tables,
 * prices, crop timers, and recipes all live in this file so balance can be retuned without
 * touching logic. Phase 1 adds the needs and care tables; the economy and crop tables
 * arrive with the systems that read them in Phase 2.
 */

/** DESIGN.md §5.6. The ladder is larva → sprout → jellyling → adult → elder. */
export const STAGES = ['larva', 'sprout', 'jellyling', 'adult', 'elder'] as const;
export type Stage = (typeof STAGES)[number];

export const WEATHERS = ['clear', 'rain', 'fog', 'sun'] as const;
export type Weather = (typeof WEATHERS)[number];

/**
 * Flavors unlock by level on a widening curve — about 62 of them by level 1497 (§5.6).
 * Only the ones canon names outright exist yet.
 */
export type FlavorId = 'original' | 'candy_cane' | 'watermelon' | (string & {});

export const CROPS = ['parsley', 'tomato', 'candy_cane', 'jelly_bean'] as const;
export type CropId = (typeof CROPS)[number];

export const NODE_KINDS = ['feather', 'wood', 'sugar'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export type ItemId = CropId | NodeKind | 'blanket' | 'hamburger' | 'sword';

export type RecipeId = 'blanket' | 'hamburger' | 'sword';

export type BuildingId =
  | 'bed'
  | 'toilet'
  | 'house'
  | 'hamburger_stand'
  | 'kitchen'
  | 'farm_plot'
  | 'workshop'
  | 'college'
  | 'shop';

export type SkillId =
  'gathering_1' | 'gathering_2' | 'kitchen' | 'crafting_1' | 'crafting_2' | 'combat_1' | 'combat_2';

/** §5.5. Chosen at graduation, alongside a hobby; either can be retrained for 2 500 jc. */
export type TradeId = 'farmer' | 'cook' | 'blacksmith' | 'merchant';
export type HobbyId = 'swordsmith' | 'gardener' | 'musician' | 'baker';

export type GameId = 'bean_sort' | 'gumdrop_match' | 'burger_stack';

export type DungeonId = 'candy_castle';

export type QuestId = string;

/* -------------------------------------------------------------------------- *
 * Needs & care (§5.1)
 * -------------------------------------------------------------------------- */

/** The three decaying meters. Mood is the fourth need but is derived, not decayed. */
export const DECAYING_NEEDS = ['hunger', 'warmth', 'rest'] as const;
export type DecayingNeed = (typeof DECAYING_NEEDS)[number];

export type NeedId = DecayingNeed | 'mood';

/**
 * Points lost per real hour, by life stage (§5.1). Larva decays fastest on purpose: it is
 * what makes escaping the larva stage feel like the milestone `[C§4]` says it is.
 */
export const NEED_DECAY_PER_HOUR: Record<Stage, Record<DecayingNeed, number>> = {
  larva: { hunger: 33.3, warmth: 25.0, rest: 16.7 },
  sprout: { hunger: 20.0, warmth: 16.7, rest: 14.3 },
  jellyling: { hunger: 14.3, warmth: 12.5, rest: 12.5 },
  adult: { hunger: 12.5, warmth: 10.0, rest: 10.0 },
  elder: { hunger: 10.0, warmth: 8.3, rest: 12.5 },
};

/** Decay modifiers (§5.1). */
export const WET_WEATHER_WARMTH_MULTIPLIER = 1.4;
export const SLEEPING_HUNGER_MULTIPLIER = 0.5;
export const BABY_DECAY_MULTIPLIER = 4.0;

/** Weather that makes being cold worse. */
export const WET_WEATHERS: readonly Weather[] = ['rain', 'fog'];

/**
 * Rest recovered per hour while asleep (§5.1).
 *
 * ⚙ Net, not a race against decay: sleeping suspends rest decay entirely. Every stage
 * loses rest at 10/h or more, so a +10/h that had to overcome decay would mean the one
 * free resolution in the game never resolved anything. A larva sleeps ten hours to refill
 * from nothing, which is slow — and it is free, and it works while the app is closed.
 */
export const SLEEP_REST_PER_HOUR = 10;

/** Mood, which is derived from the other three and from the hole count (§5.1). */
export const MOOD_NEGLECT_PER_HOUR = -8;
export const MOOD_RECOVERY_PER_HOUR = 5;
/** Neglect applies while *any* decaying need is below this. */
export const MOOD_NEGLECT_BELOW = 20;
/** Recovery applies while *all* decaying needs are above this. */
export const MOOD_RECOVERY_ABOVE = 60;
export const MOOD_CEILING_MAX = 100;
export const MOOD_CEILING_FLOOR = 20;

/**
 * What one hole costs, permanently, off the mood ceiling `[C§5]`.
 *
 * This is the game's best joke and its most load-bearing design decision. Digging is free,
 * instant, unlimited and satisfying; the player's folk theory is that it helps; it does the
 * opposite. Nothing in the UI, in a projected view, or in a SimEvent may ever link the two —
 * there are tests asserting the *absence* of that link. Read CLAUDE.md before touching this.
 */
export const MOOD_COST_PER_HOLE = 1.5;

/**
 * Progression stalls below this mood: quest acceptance, stage advancement, and passive
 * trade production all gate on it. Bottoming out stalls a Jelly Bean; it never kills one.
 */
export const MOOD_PROGRESS_GATE = 30;

/** A need at or below this is worth shouting about (§5.1 barks). */
export const BARK_THRESHOLD = 30;

/* -------------------------------------------------------------------------- *
 * Care costs (§5.1, §5.2)
 * -------------------------------------------------------------------------- */

/**
 * The canon price `[C§11]`. Space is deliberately priced so a player with nothing must
 * grind roughly 5–7 mini-games to afford it — being 14 short is the game's most quoted
 * moment. Do not tune this away.
 */
export const SPACE_COST_BB = 14;
export const SPACE_MOOD_GAIN = 40;

/** Filling a hole buys back the 1.5 (§5.1). */
export const FILL_HOLE_COST_BB = 25;

/** Hunger restored per unit of food. Crops join this table in Phase 2. */
export const FOOD_VALUE: Partial<Record<ItemId, number>> = {
  hamburger: 40,
};

/** Warmth after wrapping up in a blanket. The blanket is consumed; the feathers were the cost. */
export const BLANKET_WARMTH = 100;

/* -------------------------------------------------------------------------- *
 * Barks (§5.1, §10.6)
 * -------------------------------------------------------------------------- */

export const BARK_IDS = ['hungry', 'cold', 'sleepy', 'angry'] as const;
export type BarkId = (typeof BARK_IDS)[number];

/** Which need each bark speaks for, and the order they get to speak in. */
export const BARK_FOR_NEED: Record<NeedId, BarkId> = {
  hunger: 'hungry',
  warmth: 'cold',
  rest: 'sleepy',
  mood: 'angry',
};

/** Most urgent first: a hungry Jelly Bean out-shouts a sleepy one. */
export const BARK_PRIORITY: readonly NeedId[] = ['hunger', 'warmth', 'rest', 'mood'];

/**
 * The lines themselves. The Jelly Bean broadcasts its state by shouting, and the barks are
 * the interface — players know what their Jelly Bean needs before they have looked at the
 * screen `[C§5]`. Everything here but the angry line is verbatim canon.
 */
export const BARK_LINES: Record<BarkId, readonly string[]> = {
  hungry: ['Jelly Bean hungry!', 'Mama! Feed me!'],
  cold: ['Jelly Bean cold. Papa help.'],
  sleepy: ['Jelly Bean, sleep, sleep.'],
  // ✳ CONCEPT.md §5 gives anger a mood indicator but no line; this one is extrapolated.
  angry: ['Jelly Bean need space.'],
};
