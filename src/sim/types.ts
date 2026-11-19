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

export interface CropState {
  cropId: string;
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
}

export interface SwordItem {
  id: string;
  tier: string;
  attackBonus: number;
  craftedAtMs: number;
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
  weather: {
    current: WeatherType;
    nextChangeMs: number;
  };
  quests: {
    completedIds: string[];
    activeQuestId: string | null;
    drBubblegumAtDoor: boolean;
  };
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
  | { type: 'UPDATE_SETTINGS'; settings: Partial<GameSettings> };

export type SimEvent =
  | { type: 'ONBOARDING_COMPLETED'; beanName: string; parentTitle: string }
  | { type: 'FED_APPLE'; beanId: string; xpGained: number; coinsGained: number }
  | { type: 'BOUGHT_APPLES'; quantity: number; coinsSpent: number }
  | { type: 'SLEEP_CHANGED'; beanId: string; isSleeping: boolean }
  | { type: 'SPONGE_BATH_DONE'; beanId: string; xpGained: number; coinsGained: number }
  | { type: 'BLANKET_EQUIPPED'; beanId: string; durationSeconds: number }
  | { type: 'WARMED_BY_HEARTH'; beanId: string; xpGained: number }
  | { type: 'BEAN_PETTED'; beanId: string; xpGained: number; coinsGained: number }
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
}

export interface OfflineCatchUpResult {
  state: GameState;
  summary: OfflineCatchUpSummary;
}
