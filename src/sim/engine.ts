import {
  CARE_ACTIONS,
  CURRENT_SCHEMA_VERSION,
  INITIAL_STARTER_CONFIG,
  MAX_OFFLINE_SECONDS,
  NEED_MAX,
  NEED_MIN,
  OFFLINE_STEP_SECONDS,
  RING0_TILE_IDS,
  stageForLevel,
  xpForLevel,
} from './constants';
import { clamp, getNeedFloor, tickBeanNeeds } from './needs';
import { normalizeSeed } from './rng';
import {
  collectStandIncome,
  getHouseHearthWarmthBonus,
  grabFreeBurger,
  placeBuilding,
  tickVillageBuildings,
  upgradeHouse,
  useToilet,
} from './village';
import type {
  DispatchResult,
  GameMode,
  GameState,
  JellyBeanEntity,
  LifeStage,
  OfflineCatchUpResult,
  SaveSlotId,
  SimAction,
  SimEvent,
  TileState,
} from './types';

export interface CreateInitialStateOptions {
  slotId?: SaveSlotId;
  mode?: GameMode;
  nowMs?: number;
  seed?: number;
  beanName?: string;
  parentTitle?: string;
  onboarded?: boolean;
}

export function sanitizeLabel(input: string, fallback: string, maxLength: number): string {
  const cleaned = input.replace(/\s+/g, ' ').trim().slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function createStarterTiles(): Record<string, TileState> {
  const tiles: Record<string, TileState> = {};
  for (const padId of RING0_TILE_IDS) {
    tiles[padId] = {
      id: padId,
      ring: 0,
      building: padId === 'plot_pad_0' ? 'starter_house' : null,
      buildingTier: padId === 'plot_pad_0' ? 1 : 0,
      crop: null,
    };
  }
  return tiles;
}

export function createInitialState(options: CreateInitialStateOptions = {}): GameState {
  const slotId: SaveSlotId = options.slotId ?? options.mode ?? 'regular';
  const mode: GameMode = options.mode ?? slotId;
  const nowMs = options.nowMs ?? Date.now();
  const beanName = sanitizeLabel(
    options.beanName ?? INITIAL_STARTER_CONFIG.defaultBeanName,
    INITIAL_STARTER_CONFIG.defaultBeanName,
    INITIAL_STARTER_CONFIG.maxNameLength,
  );
  const parentTitle = sanitizeLabel(
    options.parentTitle ?? INITIAL_STARTER_CONFIG.defaultParentTitle,
    INITIAL_STARTER_CONFIG.defaultParentTitle,
    INITIAL_STARTER_CONFIG.maxParentTitleLength,
  );

  const starterBean: JellyBeanEntity = {
    id: 'bean-1',
    name: beanName,
    stage: 'larva',
    level: 1,
    xp: 0,
    flavorId: INITIAL_STARTER_CONFIG.defaultFlavorId,
    needs: { ...INITIAL_STARTER_CONFIG.starterNeeds },
    anger: 0,
    isSleeping: false,
    blanketRemainingSec: 0,
    trade: null,
    hobby: null,
    hatId: null,
    tileId: 'plot_pad_0',
  };

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    slotId,
    mode,
    onboarded: options.onboarded ?? false,
    parentTitle,
    createdAtMs: nowMs,
    lastTickMs: nowMs,
    sessionPlaySeconds: 0,
    rngState: normalizeSeed(options.seed ?? INITIAL_STARTER_CONFIG.defaultRngSeed),
    currencies: {
      jellyCoins: INITIAL_STARTER_CONFIG.initialJellyCoins,
      beanBucks: INITIAL_STARTER_CONFIG.initialBeanBucks,
      bonusBeans: 0,
    },
    island: {
      unlockedRing: 0,
      vikingPierUnlocked: false,
      tiles: createStarterTiles(),
      dugHoles: [],
    },
    beans: [starterBean],
    activeBeanId: starterBean.id,
    inventory: {
      apples: INITIAL_STARTER_CONFIG.initialApples,
      parsley: 0,
      tomatoes: 0,
      candyCanes: 0,
      feathers: 0,
      blankets: 0,
      swords: [],
    },
    unlocks: {
      kitchenSkills: false,
      timeZoneDial: false,
      vikingPack: false,
      flavors: [INITIAL_STARTER_CONFIG.defaultFlavorId],
      trophies: [],
    },
    weather: {
      current: 'sunny',
      nextChangeMs: nowMs + INITIAL_STARTER_CONFIG.initialWeatherDurationMs,
    },
    quests: {
      completedIds: [],
      activeQuestId: 'q1_welcome',
      drBubblegumAtDoor: true,
    },
    social: {
      friendsGiftedCount: 0,
      redeemedGiftNonces: [],
    },
    settings: {
      soundEnabled: true,
      soothingSoundsMode: false,
      screenTimeReminder: true,
      lowPowerMode: false,
    },
  };
}

export function getActiveBean(state: GameState): JellyBeanEntity {
  const found = state.beans.find((bean) => bean.id === state.activeBeanId);
  if (found) {
    return found;
  }
  const first = state.beans[0];
  if (!first) {
    throw new Error('GameState invariant violated: beans array must not be empty');
  }
  return first;
}

export function awardBeanXp(
  bean: JellyBeanEntity,
  xpGain: number,
): { bean: JellyBeanEntity; leveledUp: boolean; newLevel: number; newStage: LifeStage } {
  const safeGain = Math.max(0, Math.floor(xpGain));
  if (safeGain === 0) {
    return { bean, leveledUp: false, newLevel: bean.level, newStage: bean.stage };
  }

  let level = bean.level;
  let xp = bean.xp + safeGain;
  let leveledUp = false;

  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level += 1;
    leveledUp = true;
  }

  const stage = stageForLevel(level);
  return {
    bean: {
      ...bean,
      level,
      xp,
      stage,
    },
    leveledUp,
    newLevel: level,
    newStage: stage,
  };
}

function updateBeanById(
  beans: JellyBeanEntity[],
  targetId: string,
  updater: (bean: JellyBeanEntity) => JellyBeanEntity,
): JellyBeanEntity[] {
  return beans.map((bean) => (bean.id === targetId ? updater(bean) : bean));
}

function resolveTargetBean(state: GameState, requestedId?: string): JellyBeanEntity | null {
  if (!requestedId) {
    return getActiveBean(state);
  }
  return state.beans.find((bean) => bean.id === requestedId) ?? null;
}

/**
 * Pure state reducer for all player-initiated actions.
 */
export function dispatch(state: GameState, action: SimAction, nowMs?: number): DispatchResult {
  const nextLastTickMs = nowMs !== undefined ? Math.max(state.lastTickMs, nowMs) : state.lastTickMs;
  const floor = getNeedFloor(state.mode);
  const events: SimEvent[] = [];

  switch (action.type) {
    case 'COMPLETE_ONBOARDING': {
      const target = getActiveBean(state);
      const beanName = sanitizeLabel(
        action.beanName,
        INITIAL_STARTER_CONFIG.defaultBeanName,
        INITIAL_STARTER_CONFIG.maxNameLength,
      );
      const parentTitle = sanitizeLabel(
        action.parentTitle,
        INITIAL_STARTER_CONFIG.defaultParentTitle,
        INITIAL_STARTER_CONFIG.maxParentTitleLength,
      );

      events.push({ type: 'ONBOARDING_COMPLETED', beanName, parentTitle });
      return {
        state: {
          ...state,
          onboarded: true,
          parentTitle,
          lastTickMs: nextLastTickMs,
          beans: updateBeanById(state.beans, target.id, (b) => ({ ...b, name: beanName })),
        },
        events,
      };
    }

    case 'FEED_APPLE': {
      const target = resolveTargetBean(state, action.beanId);
      if (!target) {
        events.push({
          type: 'ACTION_REJECTED',
          actionType: action.type,
          reason: 'Bean not found',
        });
        return { state, events };
      }

      if (state.inventory.apples <= 0) {
        events.push({
          type: 'ACTION_REJECTED',
          actionType: action.type,
          reason: 'No apples in inventory',
        });
        return { state, events };
      }

      const fedBean: JellyBeanEntity = {
        ...target,
        isSleeping: false,
        anger: clamp(target.anger - CARE_ACTIONS.appleAngerRelief, NEED_MIN, NEED_MAX),
        needs: {
          ...target.needs,
          hunger: clamp(target.needs.hunger + CARE_ACTIONS.appleHungerRestore, floor, NEED_MAX),
          mood: clamp(target.needs.mood + CARE_ACTIONS.appleMoodBonus, floor, NEED_MAX),
        },
      };

      const xpResult = awardBeanXp(fedBean, CARE_ACTIONS.appleFeedXp);
      events.push({
        type: 'FED_APPLE',
        beanId: target.id,
        xpGained: CARE_ACTIONS.appleFeedXp,
        coinsGained: CARE_ACTIONS.appleFeedCoins,
      });
      if (xpResult.leveledUp) {
        events.push({
          type: 'LEVEL_UP',
          beanId: target.id,
          newLevel: xpResult.newLevel,
          newStage: xpResult.newStage,
        });
      }

      return {
        state: {
          ...state,
          lastTickMs: nextLastTickMs,
          currencies: {
            ...state.currencies,
            jellyCoins: state.currencies.jellyCoins + CARE_ACTIONS.appleFeedCoins,
          },
          inventory: {
            ...state.inventory,
            apples: state.inventory.apples - 1,
          },
          beans: updateBeanById(state.beans, target.id, () => xpResult.bean),
        },
        events,
      };
    }

    case 'BUY_APPLE': {
      const quantity = Math.max(1, Math.floor(action.quantity ?? 1));
      const totalCost = quantity * CARE_ACTIONS.appleShopCost;
      if (state.currencies.jellyCoins < totalCost) {
        events.push({
          type: 'ACTION_REJECTED',
          actionType: action.type,
          reason: 'Not enough Jelly Coins',
        });
        return { state, events };
      }

      events.push({ type: 'BOUGHT_APPLES', quantity, coinsSpent: totalCost });
      return {
        state: {
          ...state,
          lastTickMs: nextLastTickMs,
          currencies: {
            ...state.currencies,
            jellyCoins: state.currencies.jellyCoins - totalCost,
          },
          inventory: {
            ...state.inventory,
            apples: state.inventory.apples + quantity,
          },
        },
        events,
      };
    }

    case 'TOGGLE_SLEEP': {
      const target = resolveTargetBean(state, action.beanId);
      if (!target) {
        events.push({
          type: 'ACTION_REJECTED',
          actionType: action.type,
          reason: 'Bean not found',
        });
        return { state, events };
      }

      const nextSleeping = action.sleeping ?? !target.isSleeping;
      events.push({ type: 'SLEEP_CHANGED', beanId: target.id, isSleeping: nextSleeping });
      return {
        state: {
          ...state,
          lastTickMs: nextLastTickMs,
          beans: updateBeanById(state.beans, target.id, (b) => ({
            ...b,
            isSleeping: nextSleeping,
          })),
        },
        events,
      };
    }

    case 'SPONGE_BATH': {
      const target = resolveTargetBean(state, action.beanId);
      if (!target) {
        events.push({
          type: 'ACTION_REJECTED',
          actionType: action.type,
          reason: 'Bean not found',
        });
        return { state, events };
      }

      const cleanedBean: JellyBeanEntity = {
        ...target,
        isSleeping: false,
        needs: {
          ...target.needs,
          hygiene: clamp(
            target.needs.hygiene + CARE_ACTIONS.spongeBathHygieneRestore,
            floor,
            NEED_MAX,
          ),
        },
      };

      const xpResult = awardBeanXp(cleanedBean, CARE_ACTIONS.spongeBathXp);
      events.push({
        type: 'SPONGE_BATH_DONE',
        beanId: target.id,
        xpGained: CARE_ACTIONS.spongeBathXp,
        coinsGained: CARE_ACTIONS.spongeBathCoins,
      });
      if (xpResult.leveledUp) {
        events.push({
          type: 'LEVEL_UP',
          beanId: target.id,
          newLevel: xpResult.newLevel,
          newStage: xpResult.newStage,
        });
      }

      return {
        state: {
          ...state,
          lastTickMs: nextLastTickMs,
          currencies: {
            ...state.currencies,
            jellyCoins: state.currencies.jellyCoins + CARE_ACTIONS.spongeBathCoins,
          },
          beans: updateBeanById(state.beans, target.id, () => xpResult.bean),
        },
        events,
      };
    }

    case 'USE_BLANKET': {
      const target = resolveTargetBean(state, action.beanId);
      if (!target) {
        events.push({
          type: 'ACTION_REJECTED',
          actionType: action.type,
          reason: 'Bean not found',
        });
        return { state, events };
      }

      if (state.inventory.blankets <= 0) {
        events.push({
          type: 'ACTION_REJECTED',
          actionType: action.type,
          reason: 'No knitted blankets in inventory',
        });
        return { state, events };
      }

      events.push({
        type: 'BLANKET_EQUIPPED',
        beanId: target.id,
        durationSeconds: CARE_ACTIONS.blanketDurationSec,
      });

      return {
        state: {
          ...state,
          lastTickMs: nextLastTickMs,
          inventory: {
            ...state.inventory,
            blankets: state.inventory.blankets - 1,
          },
          beans: updateBeanById(state.beans, target.id, (b) => ({
            ...b,
            blanketRemainingSec: CARE_ACTIONS.blanketDurationSec,
            anger: clamp(b.anger - CARE_ACTIONS.blanketAngerRelief, NEED_MIN, NEED_MAX),
            needs: {
              ...b.needs,
              warmth: CARE_ACTIONS.blanketWarmthRestore,
            },
          })),
        },
        events,
      };
    }

    case 'WARM_BY_HEARTH': {
      const target = resolveTargetBean(state, action.beanId);
      if (!target) {
        events.push({
          type: 'ACTION_REJECTED',
          actionType: action.type,
          reason: 'Bean not found',
        });
        return { state, events };
      }

      const hearthBonus = getHouseHearthWarmthBonus(state);
      const warmedBean: JellyBeanEntity = {
        ...target,
        needs: {
          ...target.needs,
          warmth: clamp(
            target.needs.warmth + CARE_ACTIONS.hearthWarmthRestore + hearthBonus,
            floor,
            NEED_MAX,
          ),
        },
      };

      const xpResult = awardBeanXp(warmedBean, CARE_ACTIONS.hearthXp);
      events.push({
        type: 'WARMED_BY_HEARTH',
        beanId: target.id,
        xpGained: CARE_ACTIONS.hearthXp,
      });
      if (xpResult.leveledUp) {
        events.push({
          type: 'LEVEL_UP',
          beanId: target.id,
          newLevel: xpResult.newLevel,
          newStage: xpResult.newStage,
        });
      }

      return {
        state: {
          ...state,
          lastTickMs: nextLastTickMs,
          beans: updateBeanById(state.beans, target.id, () => xpResult.bean),
        },
        events,
      };
    }

    case 'PET_BEAN': {
      const target = resolveTargetBean(state, action.beanId);
      if (!target) {
        events.push({
          type: 'ACTION_REJECTED',
          actionType: action.type,
          reason: 'Bean not found',
        });
        return { state, events };
      }

      const happyBean: JellyBeanEntity = {
        ...target,
        anger: clamp(target.anger - CARE_ACTIONS.petAngerRelief, NEED_MIN, NEED_MAX),
        needs: {
          ...target.needs,
          mood: clamp(target.needs.mood + CARE_ACTIONS.petMoodRestore, floor, NEED_MAX),
        },
      };

      const xpResult = awardBeanXp(happyBean, CARE_ACTIONS.petXp);
      events.push({
        type: 'BEAN_PETTED',
        beanId: target.id,
        xpGained: CARE_ACTIONS.petXp,
        coinsGained: CARE_ACTIONS.petCoins,
      });
      if (xpResult.leveledUp) {
        events.push({
          type: 'LEVEL_UP',
          beanId: target.id,
          newLevel: xpResult.newLevel,
          newStage: xpResult.newStage,
        });
      }

      return {
        state: {
          ...state,
          lastTickMs: nextLastTickMs,
          currencies: {
            ...state.currencies,
            jellyCoins: state.currencies.jellyCoins + CARE_ACTIONS.petCoins,
          },
          beans: updateBeanById(state.beans, target.id, () => xpResult.bean),
        },
        events,
      };
    }

    case 'SELECT_BEAN': {
      const exists = state.beans.some((bean) => bean.id === action.beanId);
      if (!exists) {
        events.push({
          type: 'ACTION_REJECTED',
          actionType: action.type,
          reason: 'Bean not found',
        });
        return { state, events };
      }
      return {
        state: {
          ...state,
          lastTickMs: nextLastTickMs,
          activeBeanId: action.beanId,
        },
        events,
      };
    }

    case 'UPDATE_SETTINGS': {
      return {
        state: {
          ...state,
          lastTickMs: nextLastTickMs,
          settings: {
            ...state.settings,
            ...action.settings,
          },
        },
        events,
      };
    }

    case 'PLACE_BUILDING': {
      return placeBuilding(state, action.buildingType, action.tileId, nowMs);
    }

    case 'UPGRADE_HOUSE': {
      return upgradeHouse(state, action.tileId, nowMs);
    }

    case 'USE_TOILET': {
      return useToilet(state, action.beanId, nowMs);
    }

    case 'COLLECT_STAND_INCOME': {
      return collectStandIncome(state, action.tileId, nowMs);
    }

    case 'GRAB_FREE_BURGER': {
      return grabFreeBurger(state, action.tileId, action.beanId, nowMs);
    }
  }
}

/**
 * Advances active play simulation deterministically by `dtSeconds`.
 */
export function tick(state: GameState, dtSeconds: number, nowMs?: number): GameState {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    return nowMs !== undefined && nowMs > state.lastTickMs
      ? { ...state, lastTickMs: nowMs }
      : state;
  }

  const nextBeans = state.beans.map((bean) =>
    tickBeanNeeds(bean, dtSeconds, {
      mode: state.mode,
      weather: state.weather.current,
      isOffline: false,
    }),
  );

  const villageStep = tickVillageBuildings(state, dtSeconds);

  const nextLastTickMs =
    nowMs !== undefined ? Math.max(state.lastTickMs, nowMs) : state.lastTickMs + Math.round(dtSeconds * 1000);

  return {
    ...state,
    lastTickMs: nextLastTickMs,
    sessionPlaySeconds: state.sessionPlaySeconds + dtSeconds,
    island: villageStep.changed
      ? {
          ...state.island,
          tiles: villageStep.tiles,
        }
      : state.island,
    beans: nextBeans,
  };
}

/**
 * Simulates elapsed offline time cleanly in coarse steps, capped at 12 hours.
 * Enforces the Regular Mode cozy safety floor (`10`) so a Jelly Bean never dies.
 */
export function applyOfflineCatchUp(state: GameState, nowMs: number): OfflineCatchUpResult {
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : state.lastTickMs;
  const rawElapsedSec = Math.max(0, (safeNowMs - state.lastTickMs) / 1000);
  const wasCapped = rawElapsedSec > MAX_OFFLINE_SECONDS;
  const cappedSeconds = Math.min(rawElapsedSec, MAX_OFFLINE_SECONDS);

  if (cappedSeconds <= 0) {
    return {
      state: {
        ...state,
        lastTickMs: Math.max(state.lastTickMs, safeNowMs),
      },
      summary: {
        elapsedSeconds: rawElapsedSec,
        cappedSeconds: 0,
        wasCapped: false,
        sleptRestored: false,
        autoCookedMeals: 0,
        coinsEarned: 0,
      },
    };
  }

  let beans = state.beans.map((b) => ({ ...b, needs: { ...b.needs } }));
  const inventory = { ...state.inventory };
  let tiles = state.island.tiles;
  const floor = getNeedFloor(state.mode);

  let sleptRestored = false;
  let autoCookedMeals = 0;
  let totalCoinsAccrued = 0;

  let remainingSec = cappedSeconds;
  while (remainingSec > 0) {
    const stepSec = Math.min(OFFLINE_STEP_SECONDS, remainingSec);
    remainingSec -= stepSec;

    // Accrue passive Hamburger Stand Jelly Coins & tick burger cooldowns offline
    const villageStep = tickVillageBuildings(
      {
        ...state,
        inventory,
        island: {
          ...state.island,
          tiles,
        },
      },
      stepSec,
    );
    if (villageStep.changed) {
      tiles = villageStep.tiles;
    }
    totalCoinsAccrued += villageStep.coinsAccrued;

    beans = beans.map((bean) => {
      if (bean.isSleeping) {
        sleptRestored = true;
      }

      let stepped = tickBeanNeeds(bean, stepSec, {
        mode: state.mode,
        weather: state.weather.current,
        isOffline: true,
      });

      // Kitchen Skills autonomous cooking during offline catch-up (DESIGN.md §6.4).
      if (
        state.unlocks.kitchenSkills &&
        stepped.needs.hunger < CARE_ACTIONS.kitchenAutoFeedThreshold
      ) {
        let hungerBoost: number = CARE_ACTIONS.kitchenAutoToastHungerRestore;
        if (inventory.tomatoes > 0) {
          inventory.tomatoes -= 1;
          hungerBoost = CARE_ACTIONS.kitchenAutoMealHungerRestore;
        } else if (inventory.apples > 0) {
          inventory.apples -= 1;
          hungerBoost = CARE_ACTIONS.kitchenAutoMealHungerRestore;
        } else if (inventory.parsley > 0) {
          inventory.parsley -= 1;
          hungerBoost = CARE_ACTIONS.kitchenAutoMealHungerRestore;
        }

        autoCookedMeals += 1;
        stepped = {
          ...stepped,
          needs: {
            ...stepped.needs,
            hunger: clamp(stepped.needs.hunger + hungerBoost, floor, NEED_MAX),
          },
        };
      }

      return stepped;
    });
  }

  // Wake beans that finished a peaceful offline rest (>= 40s away).
  if (sleptRestored && cappedSeconds >= 40) {
    beans = beans.map((bean) =>
      bean.isSleeping && bean.needs.sleep >= NEED_MAX ? { ...bean, isSleeping: false } : bean,
    );
  }

  return {
    state: {
      ...state,
      lastTickMs: safeNowMs,
      island: tiles !== state.island.tiles ? { ...state.island, tiles } : state.island,
      inventory,
      beans,
    },
    summary: {
      elapsedSeconds: rawElapsedSec,
      cappedSeconds,
      wasCapped,
      sleptRestored,
      autoCookedMeals,
      coinsEarned: Math.floor(totalCoinsAccrued),
    },
  };
}
