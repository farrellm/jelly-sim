import {
  BABY_MODE_XP_MULTIPLIER,
  DEFAULT_WEATHER_DURATION_MS,
  FLAVOR_DEFS,
  GAME_STATE_VERSION,
  LIFE_STAGE_GATES,
  MAX_DIG_SPOTS,
  MAX_GARDEN_PLOTS,
  REGULAR_XP_MULTIPLIER,
  XP_CURVE_BASE,
  XP_CURVE_EXPONENT,
} from './constants';
import type {
  BuildingSlot,
  CropSlot,
  DigSpot,
  FlavorDef,
  FlavorTimeWindow,
  GameMode,
  GameState,
  LifeStage,
  LifeStageGate,
} from './types';

const PRECOMPUTED_MAX_LEVEL = 2000;

/**
 * Cumulative total XP required to reach `level` (index 1 === 0).
 * Precomputed through level 2000 so Lv 1..1497+ queries are instant.
 */
const CUMULATIVE_XP_TABLE: number[] = (() => {
  const table: number[] = [0, 0];
  let runningTotal = 0;
  for (let level = 1; level < PRECOMPUTED_MAX_LEVEL; level += 1) {
    runningTotal += Math.floor(XP_CURVE_BASE * Math.pow(level, XP_CURVE_EXPONENT));
    table.push(runningTotal);
  }
  return table;
})();

const STAGE_ORDER: readonly LifeStage[] = ['larva', 'sprout', 'scholar', 'citizen', 'elder'];

/**
 * XP required to advance from `level` to `level + 1`.
 * Formula from DESIGN.md: `floor(25 * L^1.15)`.
 */
export function xpForNextLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.floor(XP_CURVE_BASE * Math.pow(safeLevel, XP_CURVE_EXPONENT));
}

/**
 * Cumulative XP required to reach `level` (Level 1 requires 0 XP).
 * Supports levels past 1497+ smoothly without overflow.
 */
export function totalXpForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  if (safeLevel <= PRECOMPUTED_MAX_LEVEL) {
    return CUMULATIVE_XP_TABLE[safeLevel] ?? 0;
  }
  let total = CUMULATIVE_XP_TABLE[PRECOMPUTED_MAX_LEVEL] ?? 0;
  for (let l = PRECOMPUTED_MAX_LEVEL; l < safeLevel; l += 1) {
    total += xpForNextLevel(l);
  }
  return total;
}

/**
 * Resolves current integer level (>= 1) from cumulative XP.
 */
export function getLevelFromXp(totalXp: number): number {
  const safeXp = Math.max(0, Math.floor(totalXp));
  const maxCachedXp = CUMULATIVE_XP_TABLE[PRECOMPUTED_MAX_LEVEL] ?? 0;

  if (safeXp < maxCachedXp) {
    let low = 1;
    let high = PRECOMPUTED_MAX_LEVEL;
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      const midXp = CUMULATIVE_XP_TABLE[mid] ?? 0;
      if (midXp <= safeXp) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  }

  let level = PRECOMPUTED_MAX_LEVEL;
  let threshold = maxCachedXp;
  while (true) {
    const nextThreshold = threshold + xpForNextLevel(level);
    if (safeXp < nextThreshold) {
      return level;
    }
    threshold = nextThreshold;
    level += 1;
  }
}

export interface LevelProgress {
  readonly level: number;
  readonly currentLevelXp: number;
  readonly nextLevelXp: number;
  readonly progressRatio: number;
}

/**
 * Returns level and progress toward the next level for HUD gauges.
 */
export function getLevelProgress(totalXp: number): LevelProgress {
  const safeXp = Math.max(0, Math.floor(totalXp));
  const level = getLevelFromXp(safeXp);
  const levelStartXp = totalXpForLevel(level);
  const nextLevelXp = xpForNextLevel(level);
  const currentLevelXp = Math.max(0, safeXp - levelStartXp);
  const progressRatio = nextLevelXp > 0 ? Math.min(1, currentLevelXp / nextLevelXp) : 1;

  return {
    level,
    currentLevelXp,
    nextLevelXp,
    progressRatio,
  };
}

/**
 * Maps a numeric level to its LifeStage (`larva` -> `elder`).
 */
export function getLifeStageForLevel(level: number): LifeStage {
  const safeLevel = Math.max(1, Math.floor(level));
  for (let i = LIFE_STAGE_GATES.length - 1; i >= 0; i -= 1) {
    const gate = LIFE_STAGE_GATES[i];
    if (gate && safeLevel >= gate.minLevel) {
      return gate.stage;
    }
  }
  return 'larva';
}

export function getLifeStageGate(stage: LifeStage): LifeStageGate {
  const found = LIFE_STAGE_GATES.find((gate) => gate.stage === stage);
  return found ?? LIFE_STAGE_GATES[0]!;
}

export function stageMeetsRequirement(current: LifeStage, required?: LifeStage): boolean {
  if (!required) return true;
  return STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(required);
}

/**
 * Returns XP multiplier for the active game mode (Baby Mode rewards 1.5x XP).
 */
export function getXpMultiplier(mode: GameMode): number {
  return mode === 'baby' ? BABY_MODE_XP_MULTIPLIER : REGULAR_XP_MULTIPLIER;
}

export function computeXpGain(baseXp: number, mode: GameMode): number {
  if (baseXp <= 0) return 0;
  return Math.round(baseXp * getXpMultiplier(mode));
}

export interface AwardXpResult {
  readonly state: GameState;
  readonly xpGained: number;
  readonly previousLevel: number;
  readonly newLevel: number;
  readonly leveledUp: boolean;
  readonly previousStage: LifeStage;
  readonly newStage: LifeStage;
  readonly evolved: boolean;
  readonly newlyUnlockedFlavorIds: readonly string[];
}

/**
 * Awards XP (applying mode multiplier), advances level/life stage, and
 * auto-unlocks free non-timed milestone flavors when reached.
 */
export function awardXp(state: GameState, baseXp: number): AwardXpResult {
  const xpGained = computeXpGain(baseXp, state.mode);
  const previousLevel = state.level;
  const previousStage = state.stage;

  if (xpGained <= 0) {
    return {
      state,
      xpGained: 0,
      previousLevel,
      newLevel: previousLevel,
      leveledUp: false,
      previousStage,
      newStage: previousStage,
      evolved: false,
      newlyUnlockedFlavorIds: [],
    };
  }

  const nextTotalXp = state.xp + xpGained;
  const newLevel = getLevelFromXp(nextTotalXp);
  const newStage = getLifeStageForLevel(newLevel);

  const newlyUnlockedFlavorIds: string[] = [];
  for (const flavor of FLAVOR_DEFS) {
    if (
      flavor.beanBuckCost === 0 &&
      flavor.timeWindow === null &&
      !state.unlockedFlavorIds.includes(flavor.id) &&
      newLevel >= flavor.unlockLevel &&
      stageMeetsRequirement(newStage, flavor.requiredStage)
    ) {
      newlyUnlockedFlavorIds.push(flavor.id);
    }
  }

  const unlockedFlavorIds =
    newlyUnlockedFlavorIds.length > 0
      ? [...state.unlockedFlavorIds, ...newlyUnlockedFlavorIds]
      : state.unlockedFlavorIds;

  const nextState: GameState = {
    ...state,
    xp: nextTotalXp,
    level: newLevel,
    stage: newStage,
    unlockedFlavorIds,
  };

  return {
    state: nextState,
    xpGained,
    previousLevel,
    newLevel,
    leveledUp: newLevel > previousLevel,
    previousStage,
    newStage,
    evolved: newStage !== previousStage,
    newlyUnlockedFlavorIds,
  };
}

export function getFlavorById(flavorId: string): FlavorDef | undefined {
  return FLAVOR_DEFS.find((flavor) => flavor.id === flavorId);
}

/**
 * Normalizes any integer/float hour into `[0, 23]`.
 */
export function normalizeHour(hour: number): number {
  const floored = Math.floor(hour);
  return ((floored % 24) + 24) % 24;
}

/**
 * Checks if `hour` (0-23) falls inside a FlavorTimeWindow, supporting overnight wrap-around.
 */
export function isWithinTimeWindow(window: FlavorTimeWindow, hour: number): boolean {
  const h = normalizeHour(hour);
  const start = normalizeHour(window.startHour);
  const end = normalizeHour(window.endHour);

  if (start <= end) {
    return h >= start && h <= end;
  }
  return h >= start || h <= end;
}

/**
 * Computes the island's effective hour using local device clock + World Clock Dial offset.
 */
export function getEffectiveHour(nowMs: number, timeZoneOffsetHours: number): number {
  const localHour = new Date(nowMs).getHours();
  return normalizeHour(localHour + timeZoneOffsetHours);
}

export function isFlavorAvailableAtHour(flavor: FlavorDef, hour: number): boolean {
  if (flavor.timeWindow === null) return true;
  return isWithinTimeWindow(flavor.timeWindow, hour);
}

/**
 * Determines whether a flavor can currently be unlocked/purchased by the player.
 */
export function canUnlockFlavor(
  flavor: FlavorDef,
  state: GameState,
  nowMs: number,
): boolean {
  if (state.unlockedFlavorIds.includes(flavor.id)) {
    return false;
  }
  if (state.level < flavor.unlockLevel) {
    return false;
  }
  if (!stageMeetsRequirement(state.stage, flavor.requiredStage)) {
    return false;
  }
  if (state.currencies.beanBucks < flavor.beanBuckCost) {
    return false;
  }
  const effectiveOffset = state.worldClockDialUnlocked ? state.timeZoneOffsetHours : 0;
  const effectiveHour = getEffectiveHour(nowMs, effectiveOffset);
  return isFlavorAvailableAtHour(flavor, effectiveHour);
}

/**
 * Lists all FlavorDefs currently visible/available for the given island clock hour.
 */
export function getFlavorsInTimeWindow(state: GameState, nowMs: number): readonly FlavorDef[] {
  const effectiveOffset = state.worldClockDialUnlocked ? state.timeZoneOffsetHours : 0;
  const effectiveHour = getEffectiveHour(nowMs, effectiveOffset);
  return FLAVOR_DEFS.filter((flavor) => isFlavorAvailableAtHour(flavor, effectiveHour));
}

export interface InitialStateOptions {
  readonly beanName?: string;
  readonly mode?: GameMode;
  readonly nowMs?: number;
  readonly initialized?: boolean;
}

export function createInitialGameState(options: InitialStateOptions = {}): GameState {
  const nowMs = options.nowMs ?? Date.now();
  const mode = options.mode ?? 'regular';
  const beanName = options.beanName?.trim() || 'Jelly Bean';
  const initialized = options.initialized ?? false;

  const starterBuildings: BuildingSlot[] = [
    {
      id: 'house',
      type: 'house',
      built: true,
      level: 1,
      builtAt: nowMs,
    },
    ...Array.from({ length: 8 }, (_, index): BuildingSlot => ({
      id: `pad_${index + 1}`,
      type: null,
      built: false,
      level: 0,
      builtAt: null,
    })),
  ];

  const cropSlots: CropSlot[] = Array.from({ length: MAX_GARDEN_PLOTS }, (_, index): CropSlot => ({
    id: `plot_${index}`,
    unlocked: false,
    cropId: null,
    plantedAt: null,
    elapsedGrowthMs: 0,
    requiredGrowthMs: 0,
    watered: false,
    readyToHarvest: false,
  }));

  const digSpots: DigSpot[] = Array.from({ length: MAX_DIG_SPOTS }, (_, index): DigSpot => ({
    id: `spot_${index}`,
    dug: false,
    dugAt: null,
  }));

  return {
    version: GAME_STATE_VERSION,
    beanName,
    mode,
    initialized,
    createdAt: nowMs,
    lastTickAt: nowMs,
    xp: 0,
    level: 1,
    stage: 'larva',
    prestigeCount: 0,
    currencies: {
      jellyCoins: 20,
      beanBucks: 5,
      bonusBeans: 0,
    },
    needs: {
      hunger: 80,
      warmth: 85,
      energy: 90,
      hygiene: 85,
      anger: 0,
    },
    isSleeping: false,
    isIndoors: false,
    spaceTier: 0,
    weather: {
      current: 'sunny',
      remainingMs: DEFAULT_WEATHER_DURATION_MS,
      totalDurationMs: DEFAULT_WEATHER_DURATION_MS,
    },
    inventory: {
      foods: {
        apple: 2,
        parsley: 0,
        tomato: 0,
        candy_cane: 0,
        hamburger: 0,
        lunch: 0,
      },
      feathers: 0,
      blankets: 0,
      seeds: {
        parsley: 1,
        tomato: 0,
        candy_cane: 0,
        jelly_bean_bush: 0,
      },
      jellyBeansHarvested: 0,
    },
    buildings: starterBuildings,
    crops: cropSlots,
    digSpots,
    looseFeathers: 0,
    equippedFlavorId: 'classic_cherry',
    unlockedFlavorIds: ['classic_cherry'],
    worldClockDialUnlocked: false,
    timeZoneOffsetHours: 0,
    college: {
      enrolled: false,
      completedCourses: [],
      activeCourse: null,
      courseProgressMs: 0,
      currentJob: 'unemployed',
      swordsmithLevel: 0,
      blacksmithLevel: 0,
    },
    village: {
      neighborIds: [],
      giftedNeighborIds: [],
      lastGiftCycleAt: null,
    },
    quests: {
      activeQuestId: 'intro_plot',
      completedQuestIds: [],
      progress: {},
      bubblegumAtDoor: true,
      dailyTaskId: null,
      dailyTaskProgress: 0,
      dailyTaskCompletedAt: null,
    },
    buffs: {
      sugarRushUntil: null,
      heartOfGoldUntil: null,
      blanketWarmedUntil: null,
    },
    candyCastleCleared: false,
    vikingExpansionUnlocked: false,
    unlockedBadgeIds: [],
    settings: {
      muted: false,
      batterySaver: false,
    },
  };
}
