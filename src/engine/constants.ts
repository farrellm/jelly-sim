import type {
  BuildingType,
  CropDef,
  CropId,
  FlavorDef,
  FoodDef,
  FoodItemId,
  LifeStageGate,
  WeatherType,
} from './types';

export const GAME_STATE_VERSION = 1;

export const MIN_METER_VALUE = 0;
export const MAX_METER_VALUE = 100;

/** Offline catch-up cap (12 hours) and reduced offline decay multiplier. */
export const MAX_OFFLINE_MS = 12 * 60 * 60 * 1000;
export const OFFLINE_DECAY_FACTOR = 0.35;

/** Mode multipliers: Baby Mode is explicitly "a lot harder than regular mode". */
export const REGULAR_DECAY_MULTIPLIER = 1.0;
export const BABY_MODE_DECAY_MULTIPLIER = 2.0;
export const REGULAR_XP_MULTIPLIER = 1.0;
export const BABY_MODE_XP_MULTIPLIER = 1.5;

/** Thresholds for needs & anger mechanics. */
export const LOW_NEED_ANGER_THRESHOLD = 25;
export const ANGRY_STATE_THRESHOLD = 50;
export const DIG_HOLE_ANGER_REDUCTION = 18;
export const MAX_DIG_SPOTS = 6;
export const MAX_GARDEN_PLOTS = 4;
export const MAX_NEIGHBOR_COTTAGES = 3;

/** "Give It Space" Bean Bucks scaling & anger mitigation. */
export const GIVE_SPACE_BASE_BEAN_BUCKS = 14;
export const GIVE_SPACE_COST_STEP = 4;
export const GIVE_SPACE_ANGER_REDUCTION_PER_TIER = 0.1;
export const GIVE_SPACE_MAX_ANGER_REDUCTION = 0.8;

/** Gathering & crafting constants. */
export const FEATHERS_PER_BLANKET = 3;
export const BLANKET_WARMTH_RESTORE = 55;
export const BLANKET_WARM_BUFF_MS = 3 * 60 * 1000;
export const HEART_OF_GOLD_DURATION_MS = 15 * 60 * 1000;
export const SUGAR_RUSH_DURATION_MS = 60 * 1000;

/** Base need decay per minute in Regular Mode. */
export const NEED_DECAY_PER_MINUTE = {
  hunger: 2.2,
  warmthSunny: 0.4,
  warmthRainOutside: 4.5,
  energyAwake: 1.5,
  energySleepRegen: 15.0,
  hygiene: 1.8,
  angerPerLowNeed: 4.0,
  angerCalmDecay: 1.2,
} as const;

/** Weather cycle durations (4-8 minutes). */
export const WEATHER_CYCLE_ORDER: readonly WeatherType[] = ['sunny', 'breezy', 'rain'];
export const WEATHER_MIN_DURATION_MS = 4 * 60 * 1000;
export const WEATHER_MAX_DURATION_MS = 8 * 60 * 1000;
export const DEFAULT_WEATHER_DURATION_MS = 5 * 60 * 1000;

/** Progression milestones. */
export const XP_CURVE_BASE = 25;
export const XP_CURVE_EXPONENT = 1.15;
export const MILESTONE_LEVEL_1497 = 1497;
export const VIKING_UNLOCK_LEVEL = 150;
export const VIKING_UNLOCK_BEAN_BUCKS = 50;
export const WORLD_CLOCK_DIAL_BEAN_BUCKS = 20;

export const LIFE_STAGE_GATES: readonly LifeStageGate[] = [
  {
    stage: 'larva',
    label: 'Larva',
    minLevel: 1,
    maxLevel: 9,
    description: 'Legless, translucent squishy bean-grub with high need dependency.',
  },
  {
    stage: 'sprout',
    label: 'Sprout',
    minLevel: 10,
    maxLevel: 49,
    description: 'Stubby arms and feet sprout; can play Mini-Games and gather feathers.',
  },
  {
    stage: 'scholar',
    label: 'Scholar',
    minLevel: 50,
    maxLevel: 199,
    description: 'Eligible for Jelly College, Kitchen Skills, and Candy Castle scouting.',
  },
  {
    stage: 'citizen',
    label: 'Citizen',
    minLevel: 200,
    maxLevel: 999,
    description: 'Graduated Jelly Bean able to hold Jobs and live self-sufficiently.',
  },
  {
    stage: 'elder',
    label: 'Elder',
    minLevel: 1000,
    maxLevel: null,
    description: 'Legendary island artisan reaching Level 1497+ and Viking mastery.',
  },
] as const;

export const FOOD_DEFS: Readonly<Record<FoodItemId, FoodDef>> = {
  apple: {
    id: 'apple',
    name: 'Apple',
    hungerRestore: 20,
    angerReduction: 4,
    coinCost: 5,
    grantsSugarRushMs: 0,
  },
  parsley: {
    id: 'parsley',
    name: 'Parsley',
    hungerRestore: 15,
    angerReduction: 12,
    coinCost: 6,
    grantsSugarRushMs: 0,
  },
  tomato: {
    id: 'tomato',
    name: 'Tomato',
    hungerRestore: 25,
    angerReduction: 6,
    coinCost: 10,
    grantsSugarRushMs: 0,
  },
  candy_cane: {
    id: 'candy_cane',
    name: 'Candy Cane',
    hungerRestore: 30,
    angerReduction: 10,
    coinCost: 16,
    grantsSugarRushMs: SUGAR_RUSH_DURATION_MS,
  },
  hamburger: {
    id: 'hamburger',
    name: 'Hamburger',
    hungerRestore: 60,
    angerReduction: 15,
    coinCost: 24,
    grantsSugarRushMs: 0,
  },
  lunch: {
    id: 'lunch',
    name: 'Full Lunch',
    hungerRestore: 80,
    angerReduction: 20,
    coinCost: 34,
    grantsSugarRushMs: 0,
  },
};

export const CROP_DEFS: Readonly<Record<CropId, CropDef>> = {
  parsley: {
    id: 'parsley',
    name: 'Parsley',
    growthMs: 30 * 1000,
    seedCost: 4,
    harvestAmount: 2,
    coinBonus: 4,
    xpReward: 12,
  },
  tomato: {
    id: 'tomato',
    name: 'Tomatoes',
    growthMs: 90 * 1000,
    seedCost: 8,
    harvestAmount: 2,
    coinBonus: 10,
    xpReward: 24,
  },
  candy_cane: {
    id: 'candy_cane',
    name: 'Candy Cane',
    growthMs: 3 * 60 * 1000,
    seedCost: 15,
    harvestAmount: 1,
    coinBonus: 18,
    xpReward: 45,
  },
  jelly_bean_bush: {
    id: 'jelly_bean_bush',
    name: '100-Jelly-Bean Bush',
    growthMs: 5 * 60 * 1000,
    seedCost: 25,
    harvestAmount: 100,
    coinBonus: 55,
    xpReward: 120,
  },
};

export interface BuildingCostDef {
  readonly type: BuildingType;
  readonly name: string;
  readonly jellyCoins: number;
  readonly beanBucks: number;
  readonly requiresKitchenSkills: boolean;
}

export const BUILDING_COSTS: Readonly<Record<BuildingType, BuildingCostDef>> = {
  house: {
    type: 'house',
    name: 'Starter House',
    jellyCoins: 0,
    beanBucks: 0,
    requiresKitchenSkills: false,
  },
  toilet: {
    type: 'toilet',
    name: 'Toilet',
    jellyCoins: 25,
    beanBucks: 0,
    requiresKitchenSkills: false,
  },
  garden_plot: {
    type: 'garden_plot',
    name: 'Garden Plot',
    jellyCoins: 15,
    beanBucks: 0,
    requiresKitchenSkills: false,
  },
  craft_bench: {
    type: 'craft_bench',
    name: 'Knit & Craft Bench',
    jellyCoins: 40,
    beanBucks: 0,
    requiresKitchenSkills: false,
  },
  neighbor_cottage: {
    type: 'neighbor_cottage',
    name: 'Neighbor Cottage',
    jellyCoins: 60,
    beanBucks: 0,
    requiresKitchenSkills: false,
  },
  hamburger_stand: {
    type: 'hamburger_stand',
    name: 'Hamburger Stand',
    jellyCoins: 80,
    beanBucks: 0,
    requiresKitchenSkills: true,
  },
  college: {
    type: 'college',
    name: 'Jelly College',
    jellyCoins: 120,
    beanBucks: 10,
    requiresKitchenSkills: false,
  },
  viking_forge: {
    type: 'viking_forge',
    name: 'Viking Longhouse & Forge',
    jellyCoins: 0,
    beanBucks: VIKING_UNLOCK_BEAN_BUCKS,
    requiresKitchenSkills: false,
  },
};

export const NEIGHBOR_ROSTER: readonly { readonly id: string; readonly name: string; readonly color: string }[] = [
  { id: 'berry', name: 'Berry', color: '#7c5cff' },
  { id: 'pip', name: 'Pip', color: '#38d399' },
  { id: 'mochi', name: 'Mochi', color: '#ff8ec7' },
] as const;

export const BONUS_BEAN_ECONOMY = {
  giftCostPerFriendCoins: 5,
  friendsRequiredForBonusBean: 3,
  giftCooldownMs: 5 * 60 * 1000,
  oneBonusBeanToJellyCoins: 30,
  threeBonusBeansToBeanBucks: 10,
} as const;

export const FLAVOR_DEFS: readonly FlavorDef[] = [
  {
    id: 'classic_cherry',
    name: 'Classic Cherry',
    description: 'Sweet, glossy ruby jelly — the original island bean.',
    primaryColor: '#ff476f',
    secondaryColor: '#ff9eb5',
    unlockLevel: 1,
    beanBuckCost: 0,
    timeWindow: null,
    blastName: 'Cherry Pop',
  },
  {
    id: 'butter_popcorn',
    name: 'Buttered Popcorn',
    description: 'Divisively delicious golden sheen straight from the arcade.',
    primaryColor: '#ffd447',
    secondaryColor: '#fff3b0',
    unlockLevel: 5,
    beanBuckCost: 0,
    timeWindow: null,
    blastName: 'Kernel Burst',
  },
  {
    id: 'berry_blue',
    name: 'Blueberry Splash',
    description: 'Cool cobalt glaze unlocked as your bean sprouts limbs.',
    primaryColor: '#3b82f6',
    secondaryColor: '#93c5fd',
    unlockLevel: 10,
    beanBuckCost: 0,
    timeWindow: null,
    requiredStage: 'sprout',
    blastName: 'Berry Wave',
  },
  {
    id: 'sour_lime',
    name: 'Zesty Sour Lime',
    description: 'Tangy neon-green coat with extra bounce.',
    primaryColor: '#65d639',
    secondaryColor: '#d9f99d',
    unlockLevel: 20,
    beanBuckCost: 6,
    timeWindow: null,
    blastName: 'Citrus Zing',
  },
  {
    id: 'sunrise_citrus',
    name: 'Sunrise Citrus',
    description: 'Only shimmers onto the island during early morning hours (5:00–9:59).',
    primaryColor: '#ff8c42',
    secondaryColor: '#ffe066',
    unlockLevel: 8,
    beanBuckCost: 4,
    timeWindow: { startHour: 5, endHour: 9 },
    blastName: 'Dawn Flare',
  },
  {
    id: 'high_noon_mango',
    name: 'High-Noon Mango',
    description: 'Radiant tropical glaze appearing under midday sun (11:00–14:59).',
    primaryColor: '#ffaa00',
    secondaryColor: '#ffdd88',
    unlockLevel: 15,
    beanBuckCost: 5,
    timeWindow: { startHour: 11, endHour: 14 },
    blastName: 'Solar Tropics',
  },
  {
    id: 'sunset_peach',
    name: 'Sunset Peach',
    description: 'Velvety dusk gradient available during golden hour (17:00–20:59).',
    primaryColor: '#ff6b8b',
    secondaryColor: '#ffb26b',
    unlockLevel: 25,
    beanBuckCost: 6,
    timeWindow: { startHour: 17, endHour: 20 },
    blastName: 'Dusk Gleam',
  },
  {
    id: 'midnight_licorice',
    name: 'Midnight Licorice',
    description: 'Starlight-flecked obsidian jelly seen only late at night (22:00–3:59).',
    primaryColor: '#26213d',
    secondaryColor: '#a78bfa',
    unlockLevel: 30,
    beanBuckCost: 8,
    timeWindow: { startHour: 22, endHour: 3 },
    blastName: 'Starlight Lash',
  },
  {
    id: 'marshmallow_gold',
    name: 'Marshmallow Heart',
    description: 'Crunchy pastel exterior, golden marshmallow core — Dr. Bubblegum’s favorite.',
    primaryColor: '#ff9ebb',
    secondaryColor: '#ffd700',
    unlockLevel: 50,
    beanBuckCost: 12,
    timeWindow: null,
    requiredStage: 'scholar',
    blastName: 'Gold Heartbeat',
  },
  {
    id: 'watermelon_fizz',
    name: 'Watermelon Fizz',
    description: 'Striped emerald-and-pink trophy glaze from Candy Castle.',
    primaryColor: '#ff3b7f',
    secondaryColor: '#34d399',
    unlockLevel: 75,
    beanBuckCost: 15,
    timeWindow: null,
    requiredStage: 'scholar',
    blastName: 'Melon Seed Volley',
  },
  {
    id: 'viking_frost_berry',
    name: 'Svoldaar Frostberry',
    description: 'Glacial sapphire sheen forged for the Ice Giant’s Palace.',
    primaryColor: '#38bdf8',
    secondaryColor: '#e0f2fe',
    unlockLevel: 200,
    beanBuckCost: 20,
    timeWindow: null,
    requiredStage: 'citizen',
    blastName: 'Fjord Shatter',
  },
  {
    id: 'legendary_1497_starlight',
    name: 'Legend 1497 Prismatic',
    description: 'Mythic cosmic jelly reserved for true Level 1497+ island legends.',
    primaryColor: '#c084fc',
    secondaryColor: '#fde047',
    unlockLevel: 1497,
    beanBuckCost: 0,
    timeWindow: null,
    requiredStage: 'elder',
    blastName: 'Infinite Bean Nova',
  },
] as const;
