/**
 * Content identifiers.
 *
 * DESIGN.md §5 is emphatic that game content is *data*, not code branches: decay tables,
 * prices, crop timers, and recipes all live in this file so balance can be retuned without
 * touching logic. Phase 0 ships only the identifier vocabulary — the tables themselves
 * arrive with the systems that read them (needs in Phase 1, economy and crops in Phase 2).
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
