export type GameMode = 'regular' | 'baby';

export type LifeStage = 'larva' | 'sprout' | 'scholar' | 'citizen' | 'elder';

export type WeatherType = 'sunny' | 'breezy' | 'rain';

export type FoodItemId =
  | 'apple'
  | 'parsley'
  | 'tomato'
  | 'candy_cane'
  | 'hamburger'
  | 'lunch';

export type CropId = 'parsley' | 'tomato' | 'candy_cane' | 'jelly_bean_bush';

export type BuildingType =
  | 'house'
  | 'toilet'
  | 'garden_plot'
  | 'hamburger_stand'
  | 'college'
  | 'neighbor_cottage'
  | 'craft_bench'
  | 'viking_forge';

export type CourseId = 'kitchen_skills' | 'botany' | 'combat_arts';

export type JobId =
  | 'unemployed'
  | 'hamburger_chef'
  | 'master_gardener'
  | 'scholar'
  | 'blacksmith';

export interface Needs {
  readonly hunger: number;
  readonly warmth: number;
  readonly energy: number;
  readonly hygiene: number;
  /** 0 = calm/happy, 100 = furious tantrum. */
  readonly anger: number;
}

export interface WeatherState {
  readonly current: WeatherType;
  readonly remainingMs: number;
  readonly totalDurationMs: number;
}

export interface Inventory {
  readonly foods: Readonly<Record<FoodItemId, number>>;
  readonly feathers: number;
  readonly blankets: number;
  readonly seeds: Readonly<Record<CropId, number>>;
  readonly jellyBeansHarvested: number;
}

export interface BuildingSlot {
  readonly id: string;
  readonly type: BuildingType | null;
  readonly built: boolean;
  readonly level: number;
  readonly builtAt: number | null;
}

export interface CropSlot {
  readonly id: string;
  readonly unlocked: boolean;
  readonly cropId: CropId | null;
  readonly plantedAt: number | null;
  readonly elapsedGrowthMs: number;
  readonly requiredGrowthMs: number;
  readonly watered: boolean;
  readonly readyToHarvest: boolean;
}

export interface DigSpot {
  readonly id: string;
  readonly dug: boolean;
  readonly dugAt: number | null;
}

export interface QuestState {
  readonly activeQuestId: string | null;
  readonly completedQuestIds: readonly string[];
  readonly progress: Readonly<Record<string, number>>;
  readonly bubblegumAtDoor: boolean;
  readonly dailyTaskId: string | null;
  readonly dailyTaskProgress: number;
  readonly dailyTaskCompletedAt: number | null;
}

export interface FlavorTimeWindow {
  /** Inclusive local hour (0-23). Supports wrap-around (e.g. 22 to 3). */
  readonly startHour: number;
  /** Inclusive local hour (0-23). */
  readonly endHour: number;
}

export interface FlavorDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly unlockLevel: number;
  readonly beanBuckCost: number;
  readonly timeWindow: FlavorTimeWindow | null;
  readonly requiredStage?: LifeStage;
  readonly blastName: string;
}

export interface LifeStageGate {
  readonly stage: LifeStage;
  readonly label: string;
  readonly minLevel: number;
  readonly maxLevel: number | null;
  readonly description: string;
}

export interface FoodDef {
  readonly id: FoodItemId;
  readonly name: string;
  readonly hungerRestore: number;
  readonly angerReduction: number;
  readonly coinCost: number;
  readonly grantsSugarRushMs: number;
}

export interface CropDef {
  readonly id: CropId;
  readonly name: string;
  readonly growthMs: number;
  readonly seedCost: number;
  readonly harvestAmount: number;
  readonly coinBonus: number;
  readonly xpReward: number;
}

export interface Currencies {
  readonly jellyCoins: number;
  readonly beanBucks: number;
  readonly bonusBeans: number;
}

export interface CollegeState {
  readonly enrolled: boolean;
  readonly completedCourses: readonly CourseId[];
  readonly activeCourse: CourseId | null;
  readonly courseProgressMs: number;
  readonly currentJob: JobId;
  readonly swordsmithLevel: number;
  readonly blacksmithLevel: number;
}

export interface VillageState {
  readonly neighborIds: readonly string[];
  readonly giftedNeighborIds: readonly string[];
  readonly lastGiftCycleAt: number | null;
}

export interface BuffState {
  readonly sugarRushUntil: number | null;
  readonly heartOfGoldUntil: number | null;
  readonly blanketWarmedUntil: number | null;
}

export interface GameSettings {
  readonly muted: boolean;
  readonly batterySaver: boolean;
}

export interface GameState {
  readonly version: number;
  readonly beanName: string;
  readonly mode: GameMode;
  readonly initialized: boolean;
  readonly createdAt: number;
  readonly lastTickAt: number;
  readonly xp: number;
  readonly level: number;
  readonly stage: LifeStage;
  readonly prestigeCount: number;
  readonly currencies: Currencies;
  readonly needs: Needs;
  readonly isSleeping: boolean;
  readonly isIndoors: boolean;
  readonly spaceTier: number;
  readonly weather: WeatherState;
  readonly inventory: Inventory;
  readonly buildings: readonly BuildingSlot[];
  readonly crops: readonly CropSlot[];
  readonly digSpots: readonly DigSpot[];
  readonly looseFeathers: number;
  readonly equippedFlavorId: string;
  readonly unlockedFlavorIds: readonly string[];
  readonly worldClockDialUnlocked: boolean;
  readonly timeZoneOffsetHours: number;
  readonly college: CollegeState;
  readonly village: VillageState;
  readonly quests: QuestState;
  readonly buffs: BuffState;
  readonly candyCastleCleared: boolean;
  readonly vikingExpansionUnlocked: boolean;
  readonly unlockedBadgeIds: readonly string[];
  readonly settings: GameSettings;
}
