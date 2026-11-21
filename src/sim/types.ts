export type GameMode = 'regular' | 'baby';
export type SaveSlotId = 'regular' | 'baby';
export type WeatherType = 'sunny' | 'cozy_rain' | 'chilly_wind';
export type LifeStage = 'larva' | 'sprout' | 'scholar' | 'career' | 'legend';
export type NeedName = 'hunger' | 'warmth' | 'sleep' | 'hygiene' | 'mood';
export type BeanMoodCueType = 'hungry' | 'cold' | 'sleepy' | 'hygiene' | 'angry';

export type BuildingType =
  | 'starter_house'
  | 'toilet'
  | 'garden_plot'
  | 'hamburger_stand'
  | 'quiet_space_corner'
  | 'kitchen_annex'
  | 'feather_loom'
  | 'jelly_college'
  | 'villager_cottage'
  | 'blacksmith_forge'
  | 'apple_tree';

export interface BeanNeeds {
  hunger: number;
  warmth: number;
  sleep: number;
  hygiene: number;
  mood: number;
}

export interface JellyBeanEntity {
  id: string;
  name: string;
  stage: LifeStage;
  level: number;
  xp: number;
  flavorId: string;
  needs: BeanNeeds;
  anger: number;
  isSleeping: boolean;
  blanketRemainingSec: number;
  trade: string | null;
  hobby: string | null;
  hatId: string | null;
  tileId: string;
}

export type CropId = 'parsley' | 'tomato' | 'candy_cane' | 'hundred_beans';
export type CropGrowthStage = 'sprout' | 'mid' | 'ripe';

export interface CropState {
  cropId: CropId;
  plantedAtMs: number;
  growthSeconds: number;
  watered: boolean;
}

export interface TileState {
  id: string;
  ring: 0 | 1 | 2 | 3;
  building: BuildingType | null;
  buildingTier: number;
  crop: CropState | null;
  /** Accumulated passive Jelly Coins waiting to be collected (e.g. Hamburger Stand). */
  pendingCoins?: number;
  /** Remaining cooldown seconds before the next free burger can be grabbed. */
  burgerCooldownSec?: number;
  /** Remaining regrow seconds for a perennial Apple Tree (0 = 3 Apples ready to harvest). */
  appleRegrowSec?: number;
}

export interface DriftingFeather {
  id: string;
  spawnedAtMs: number;
  expiresAtMs: number;
  /** Normalized island spawn hint in [-1, 1] for 3D feather drift rendering. */
  laneX: number;
  laneZ: number;
}

export interface WeatherState {
  current: WeatherType;
  nextChangeMs: number;
  /** Upcoming weather shown by the manual weather forecast indicator (DESIGN.md §3.6). */
  forecast: WeatherType;
  /** Active drifting feathers spawned during Chilly Wind. */
  driftingFeathers: DriftingFeather[];
  /** Seconds remaining until the next drifting feather spawns during Chilly Wind. */
  featherSpawnCooldownSec: number;
  /** Monotonic counter for deterministic drifting feather IDs. */
  featherSeq: number;
}

export interface SwordItem {
  id: string;
  tier: string;
  attackBonus: number;
  craftedAtMs: number;
}

export type RadiantTaskTemplateId =
  | 'radiant_feed_apples'
  | 'radiant_pet_bean'
  | 'radiant_toilet_habit'
  | 'radiant_stand_coins'
  | 'radiant_nap_time';

export interface QuestProgressCounters {
  applesFed: number;
  timesSlept: number;
  toiletUses: number;
  standCoinsCollected: number;
  petsGiven: number;
  holesDug: number;
  feathersGathered: number;
  blanketsKnitted: number;
  parsleyHarvested: number;
  tomatoesHarvested: number;
  candyCanesHarvested: number;
  hundredBeansHarvested: number;
  gardenCheckIns: number;
  gumdropRunsCompleted: number;
  bonusBeansRedeemed: number;
  witchDefeatedCount: number;
}

export interface RadiantTaskState {
  id: string;
  index: number;
  templateId: RadiantTaskTemplateId;
  baseline: number;
  targetDelta: number;
  rewardJellyCoins: number;
  rewardBeanBucks: number;
  rewardXp: number;
}

export interface QuestsState {
  completedIds: string[];
  activeQuestId: string | null;
  drBubblegumAtDoor: boolean;
  radiantCompletedCount: number;
  activeRadiantTask: RadiantTaskState | null;
  counters: QuestProgressCounters;
}

export interface GameSettings {
  soundEnabled: boolean;
  soothingSoundsMode: boolean;
  screenTimeReminder: boolean;
  lowPowerMode: boolean;
}

export interface GameState {
  schemaVersion: number;
  slotId: SaveSlotId;
  mode: GameMode;
  onboarded: boolean;
  parentTitle: string;
  createdAtMs: number;
  lastTickMs: number;
  sessionPlaySeconds: number;
  rngState: number;
  currencies: {
    jellyCoins: number;
    beanBucks: number;
    bonusBeans: number;
  };
  island: {
    unlockedRing: 0 | 1 | 2 | 3;
    vikingPierUnlocked: boolean;
    tiles: Record<string, TileState>;
    dugHoles: string[];
  };
  beans: JellyBeanEntity[];
  activeBeanId: string;
  inventory: {
    apples: number;
    parsley: number;
    tomatoes: number;
    candyCanes: number;
    feathers: number;
    blankets: number;
    swords: SwordItem[];
  };
  unlocks: {
    kitchenSkills: boolean;
    timeZoneDial: boolean;
    vikingPack: boolean;
    flavors: string[];
    trophies: string[];
  };
  weather: WeatherState;
  quests: QuestsState;
  social: {
    friendsGiftedCount: number;
    redeemedGiftNonces: string[];
  };
  settings: GameSettings;
}

export interface BeanSpeechCue {
  cue: BeanMoodCueType;
  message: string;
}

export type SimAction =
  | { type: 'COMPLETE_ONBOARDING'; beanName: string; parentTitle: string }
  | { type: 'FEED_APPLE'; beanId?: string }
  | { type: 'BUY_APPLE'; quantity?: number }
  | { type: 'TOGGLE_SLEEP'; beanId?: string; sleeping?: boolean }
  | { type: 'SPONGE_BATH'; beanId?: string }
  | { type: 'USE_BLANKET'; beanId?: string }
  | { type: 'WARM_BY_HEARTH'; beanId?: string }
  | { type: 'PET_BEAN'; beanId?: string }
  | { type: 'SELECT_BEAN'; beanId: string }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<GameSettings> }
  | { type: 'PLACE_BUILDING'; buildingType: BuildingType; tileId: string }
  | { type: 'UPGRADE_HOUSE'; tileId?: string }
  | { type: 'USE_TOILET'; beanId?: string }
  | { type: 'COLLECT_STAND_INCOME'; tileId?: string }
  | { type: 'GRAB_FREE_BURGER'; tileId?: string; beanId?: string }
  | { type: 'PLANT_CROP'; tileId: string; cropId: CropId }
  | { type: 'WATER_CROP'; tileId: string }
  | { type: 'HARVEST_CROP'; tileId: string }
  | { type: 'HARVEST_APPLE_TREE'; tileId?: string }
  | { type: 'CHECK_IN_GARDEN' }
  | { type: 'COLLECT_FEATHER'; featherId?: string }
  | { type: 'KNIT_BLANKET' }
  | { type: 'CLAIM_QUEST_REWARD'; questId?: string }
  | { type: 'REQUEST_RADIANT_TASK' };

export type SimEvent =
  | { type: 'ONBOARDING_COMPLETED'; beanName: string; parentTitle: string }
  | { type: 'FED_APPLE'; beanId: string; xpGained: number; coinsGained: number }
  | { type: 'BOUGHT_APPLES'; quantity: number; coinsSpent: number }
  | { type: 'SLEEP_CHANGED'; beanId: string; isSleeping: boolean }
  | { type: 'SPONGE_BATH_DONE'; beanId: string; xpGained: number; coinsGained: number }
  | { type: 'BLANKET_EQUIPPED'; beanId: string; durationSeconds: number }
  | { type: 'WARMED_BY_HEARTH'; beanId: string; xpGained: number }
  | { type: 'BEAN_PETTED'; beanId: string; xpGained: number; coinsGained: number }
  | {
      type: 'BUILDING_PLACED';
      buildingType: BuildingType;
      tileId: string;
      coinsSpent: number;
      bucksSpent: number;
      xpGained: number;
    }
  | {
      type: 'HOUSE_UPGRADED';
      tileId: string;
      newTier: number;
      coinsSpent: number;
      xpGained: number;
    }
  | { type: 'TOILET_USED'; beanId: string; tileId: string; xpGained: number; coinsGained: number }
  | { type: 'STAND_INCOME_COLLECTED'; tileId: string; coinsCollected: number }
  | { type: 'BURGER_EATEN'; beanId: string; tileId: string; xpGained: number }
  | {
      type: 'CROP_PLANTED';
      tileId: string;
      cropId: CropId;
      coinsSpent: number;
      autoWatered: boolean;
    }
  | { type: 'CROP_WATERED'; tileId: string; cropId: CropId; xpGained: number }
  | {
      type: 'CROP_HARVESTED';
      tileId: string;
      cropId: CropId;
      coinsGained: number;
      xpGained: number;
      itemYield: number;
      miniBeanBurstCount: number;
      sproutedBeanId: string | null;
    }
  | { type: 'APPLE_TREE_HARVESTED'; tileId: string; applesGained: number; xpGained: number }
  | { type: 'VILLAGER_SPROUTED'; beanId: string; beanName: string; tileId: string }
  | {
      type: 'WEATHER_CHANGED';
      previous: WeatherType;
      current: WeatherType;
      nextForecast: WeatherType;
      nextChangeMs: number;
    }
  | { type: 'FEATHER_COLLECTED'; featherId: string; totalFeathers: number; xpGained: number }
  | {
      type: 'BLANKET_KNITTED';
      feathersSpent: number;
      totalBlankets: number;
      usedLoom: boolean;
      xpGained: number;
      coinsGained: number;
    }
  | {
      type: 'DR_BUBBLEGUM_KNOCKED';
      questId: string;
      questTitle: string;
      reason: 'welcome' | 'quest_ready';
    }
  | {
      type: 'QUEST_COMPLETED';
      questId: string;
      questTitle: string;
      coinsGained: number;
      bucksGained: number;
      xpGained: number;
      nextQuestId: string | null;
    }
  | { type: 'RADIANT_TASK_ASSIGNED'; taskId: string; title: string }
  | { type: 'LEVEL_UP'; beanId: string; newLevel: number; newStage: LifeStage }
  | { type: 'ACTION_REJECTED'; actionType: SimAction['type']; reason: string };

export interface DispatchResult {
  state: GameState;
  events: SimEvent[];
}

export interface OfflineCatchUpSummary {
  elapsedSeconds: number;
  cappedSeconds: number;
  wasCapped: boolean;
  sleptRestored: boolean;
  autoCookedMeals: number;
  coinsEarned: number;
  cropsRipened: number;
}

export interface OfflineCatchUpResult {
  state: GameState;
  summary: OfflineCatchUpSummary;
}
