import { INITIAL_STARTER_CONFIG, MODE_NEED_RATES, stageForLevel, xpForLevel } from './constants';
import { nextInt, nextRandom } from './rng';
import type {
  DispatchResult,
  DriftingFeather,
  GameState,
  JellyBeanEntity,
  LifeStage,
  SimEvent,
  WeatherState,
  WeatherType,
} from './types';

/**
 * Dynamic Weather & Chilly Wind Feather configuration (DESIGN.md §3.1, §3.6).
 * Weather shifts deterministically every 6–10 real minutes.
 */
export const WEATHER_CONFIG = {
  minDurationMs: 6 * 60 * 1000,
  maxDurationMs: 10 * 60 * 1000,
  initialDurationMs: INITIAL_STARTER_CONFIG.initialWeatherDurationMs,

  /** Cozy Rain grants 2x crop growth speed and auto-waters planted crops. */
  cozyRainCropSpeedMultiplier: 2,
  /** Cozy Rain grants +1.5/min cozy Mood buff. */
  cozyRainMoodBoostPerMin: MODE_NEED_RATES.regular.cozyRainMoodBoostPerMin,

  /** Chilly Wind spawns collectible drifting Feathers periodically. */
  featherSpawnIntervalSec: 10,
  featherLifetimeMs: 65 * 1000,
  maxActiveFeathers: 5,
  featherCollectXp: 5,
} as const;

export interface WeatherEffectSummary {
  weather: WeatherType;
  label: string;
  description: string;
  cropGrowthMultiplier: number;
  autoWatersCrops: boolean;
  moodBoostPerMin: number;
  spawnsFeathers: boolean;
  coldWarmthDrainActive: boolean;
}

export interface WeatherTickResult {
  weather: WeatherState;
  rngState: number;
  changed: boolean;
  weatherChangedEvent: Extract<SimEvent, { type: 'WEATHER_CHANGED' }> | null;
}

const WEATHER_EFFECTS: Readonly<Record<WeatherType, WeatherEffectSummary>> = {
  sunny: {
    weather: 'sunny',
    label: 'Sunny',
    description: 'Warm island sunshine with balanced growth and cozy breezes.',
    cropGrowthMultiplier: 1,
    autoWatersCrops: false,
    moodBoostPerMin: 0,
    spawnsFeathers: false,
    coldWarmthDrainActive: false,
  },
  cozy_rain: {
    weather: 'cozy_rain',
    label: 'Cozy Rain',
    description: 'Soft cozy rain auto-waters crops, doubles growth speed (2x), and boosts Mood!',
    cropGrowthMultiplier: WEATHER_CONFIG.cozyRainCropSpeedMultiplier,
    autoWatersCrops: true,
    moodBoostPerMin: WEATHER_CONFIG.cozyRainMoodBoostPerMin,
    spawnsFeathers: false,
    coldWarmthDrainActive: false,
  },
  chilly_wind: {
    weather: 'chilly_wind',
    label: 'Chilly Wind',
    description: 'Brisk breeze drains Warmth faster and blows collectible Feathers across the island!',
    cropGrowthMultiplier: 1,
    autoWatersCrops: false,
    moodBoostPerMin: 0,
    spawnsFeathers: true,
    coldWarmthDrainActive: true,
  },
};

const MAX_SEQUENTIAL_TRANSITIONS = 24;

function awardWeatherXp(
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
    bean: { ...bean, level, xp, stage },
    leveledUp,
    newLevel: level,
    newStage: stage,
  };
}

export function getWeatherEffects(weather: WeatherType): WeatherEffectSummary {
  return WEATHER_EFFECTS[weather];
}

/**
 * Deterministically picks the next weather state, always transitioning to a
 * different state so Sunny, Cozy Rain, and Chilly Wind cycle naturally.
 */
export function rollNextWeather(
  current: WeatherType,
  rngState: number,
): { weather: WeatherType; nextRngState: number } {
  const roll = nextRandom(rngState);
  let weather: WeatherType;

  if (current === 'sunny') {
    weather = roll.value < 0.55 ? 'cozy_rain' : 'chilly_wind';
  } else if (current === 'cozy_rain') {
    weather = roll.value < 0.6 ? 'sunny' : 'chilly_wind';
  } else {
    weather = roll.value < 0.65 ? 'sunny' : 'cozy_rain';
  }

  return { weather, nextRngState: roll.nextState };
}

/**
 * Deterministically rolls a weather duration between 6 and 10 real minutes (DESIGN.md §3.6).
 */
export function rollWeatherDurationMs(
  rngState: number,
): { durationMs: number; nextRngState: number } {
  const step = nextInt(rngState, WEATHER_CONFIG.minDurationMs, WEATHER_CONFIG.maxDurationMs);
  return { durationMs: step.value, nextRngState: step.nextState };
}

/**
 * Creates the initial sunny weather state plus its deterministically forecasted next weather.
 */
export function createInitialWeatherState(
  nowMs: number,
  rngState: number,
): { weather: WeatherState; nextRngState: number } {
  const nextForecast = rollNextWeather('sunny', rngState);
  return {
    weather: {
      current: 'sunny',
      nextChangeMs: nowMs + WEATHER_CONFIG.initialDurationMs,
      forecast: nextForecast.weather,
      driftingFeathers: [],
      featherSpawnCooldownSec: 0,
      featherSeq: 0,
    },
    nextRngState: nextForecast.nextRngState,
  };
}

function createDriftingFeather(
  seq: number,
  nowMs: number,
  rngState: number,
): { feather: DriftingFeather; nextRngState: number } {
  const rollX = nextRandom(rngState);
  const rollZ = nextRandom(rollX.nextState);
  const laneX = Math.round((rollX.value * 1.7 - 0.85) * 1000) / 1000;
  const laneZ = Math.round((rollZ.value * 1.7 - 0.85) * 1000) / 1000;

  return {
    feather: {
      id: `feather-${seq}`,
      spawnedAtMs: nowMs,
      expiresAtMs: nowMs + WEATHER_CONFIG.featherLifetimeMs,
      laneX,
      laneZ,
    },
    nextRngState: rollZ.nextState,
  };
}

/**
 * Advances the deterministic weather scheduler and manages Chilly Wind drifting Feathers.
 */
export function tickWeather(
  state: GameState,
  dtSeconds: number,
  nowMs: number,
  options?: { isOffline?: boolean },
): WeatherTickResult {
  const isOffline = options?.isOffline ?? false;
  const prevWeather = state.weather;
  let current = prevWeather.current;
  let forecast = prevWeather.forecast;
  let nextChangeMs = prevWeather.nextChangeMs;
  let driftingFeathers = prevWeather.driftingFeathers;
  let featherSpawnCooldownSec = prevWeather.featherSpawnCooldownSec;
  let featherSeq = prevWeather.featherSeq;
  let rngState = state.rngState;
  let changed = false;
  let weatherChangedEvent: Extract<SimEvent, { type: 'WEATHER_CHANGED' }> | null = null;

  // 1. Check deterministic weather cycle transitions when wall clock reaches nextChangeMs.
  if (Number.isFinite(nowMs) && nowMs >= nextChangeMs) {
    const originalWeather = current;
    let transitions = 0;

    while (nowMs >= nextChangeMs && transitions < MAX_SEQUENTIAL_TRANSITIONS) {
      current = forecast !== current ? forecast : rollNextWeather(current, rngState).weather;
      const nextForecastStep = rollNextWeather(current, rngState);
      rngState = nextForecastStep.nextRngState;
      forecast = nextForecastStep.weather;

      const durStep = rollWeatherDurationMs(rngState);
      rngState = durStep.nextRngState;
      nextChangeMs += durStep.durationMs;
      transitions += 1;
    }

    // If returning after a multi-hour/multi-day gap, anchor nextChangeMs cleanly ahead of nowMs.
    if (nowMs >= nextChangeMs) {
      const durStep = rollWeatherDurationMs(rngState);
      rngState = durStep.nextRngState;
      nextChangeMs = nowMs + durStep.durationMs;
    }

    if (current !== 'chilly_wind' && driftingFeathers.length > 0) {
      driftingFeathers = [];
    }
    if (current !== originalWeather) {
      featherSpawnCooldownSec = 0;
      weatherChangedEvent = {
        type: 'WEATHER_CHANGED',
        previous: originalWeather,
        current,
        nextForecast: forecast,
        nextChangeMs,
      };
    }
    changed = true;
  }

  // 2. Prune expired drifting feathers (or clear them if weather is not Chilly Wind).
  if (current !== 'chilly_wind') {
    if (driftingFeathers.length > 0) {
      driftingFeathers = [];
      changed = true;
    }
    if (featherSpawnCooldownSec !== 0) {
      featherSpawnCooldownSec = 0;
      changed = true;
    }
  } else {
    const surviving = driftingFeathers.filter((feather) => feather.expiresAtMs > nowMs);
    if (surviving.length !== driftingFeathers.length) {
      driftingFeathers = surviving;
      changed = true;
    }

    // 3. During active Chilly Wind play, spawn drifting collectible feathers periodically.
    if (!isOffline && Number.isFinite(dtSeconds) && dtSeconds > 0) {
      let nextCooldown = featherSpawnCooldownSec - dtSeconds;
      if (nextCooldown !== featherSpawnCooldownSec) {
        changed = true;
      }

      if (driftingFeathers.length < WEATHER_CONFIG.maxActiveFeathers && nextCooldown <= 0) {
        const nextFeathers = [...driftingFeathers];
        while (nextFeathers.length < WEATHER_CONFIG.maxActiveFeathers && nextCooldown <= 0) {
          featherSeq += 1;
          // Preserve accurate spawn timestamp when multiple spawns occur within a large dt step.
          const spawnOffsetMs = Math.max(0, Math.round(-nextCooldown * 1000));
          const spawnAtMs = Math.max(0, nowMs - spawnOffsetMs);
          const spawned = createDriftingFeather(featherSeq, spawnAtMs, rngState);
          rngState = spawned.nextRngState;
          if (spawned.feather.expiresAtMs > nowMs) {
            nextFeathers.push(spawned.feather);
          }
          nextCooldown += WEATHER_CONFIG.featherSpawnIntervalSec;
        }
        driftingFeathers = nextFeathers;
        changed = true;
      }

      featherSpawnCooldownSec = Math.max(0, nextCooldown);
    }
  }

  if (!changed) {
    return {
      weather: prevWeather,
      rngState: state.rngState,
      changed: false,
      weatherChangedEvent: null,
    };
  }

  return {
    weather: {
      current,
      nextChangeMs,
      forecast,
      driftingFeathers,
      featherSpawnCooldownSec,
      featherSeq,
    },
    rngState,
    changed: true,
    weatherChangedEvent,
  };
}

/**
 * Collects a drifting Feather during Chilly Wind, adding it to inventory and awarding XP.
 */
export function collectDriftingFeather(
  state: GameState,
  featherId?: string,
  nowMs?: number,
): DispatchResult {
  const nextLastTickMs = nowMs !== undefined ? Math.max(state.lastTickMs, nowMs) : state.lastTickMs;
  const events: SimEvent[] = [];

  const activeFeathers = state.weather.driftingFeathers;
  const target = featherId
    ? activeFeathers.find((f) => f.id === featherId)
    : activeFeathers[0];

  if (!target) {
    events.push({
      type: 'ACTION_REJECTED',
      actionType: 'COLLECT_FEATHER',
      reason:
        state.weather.current === 'chilly_wind'
          ? 'No drifting feathers on screen right now'
          : 'Feathers drift in during Chilly Wind weather',
    });
    return { state, events };
  }

  const remainingFeathers = activeFeathers.filter((f) => f.id !== target.id);
  const totalFeathers = state.inventory.feathers + 1;

  const activeBean =
    state.beans.find((b) => b.id === state.activeBeanId) ?? state.beans[0] ?? null;
  let nextBeans = state.beans;
  const xpGained = activeBean ? WEATHER_CONFIG.featherCollectXp : 0;

  events.push({
    type: 'FEATHER_COLLECTED',
    featherId: target.id,
    totalFeathers,
    xpGained,
  });

  if (activeBean) {
    const xpResult = awardWeatherXp(activeBean, xpGained);
    nextBeans = state.beans.map((b) => (b.id === activeBean.id ? xpResult.bean : b));
    if (xpResult.leveledUp) {
      events.push({
        type: 'LEVEL_UP',
        beanId: activeBean.id,
        newLevel: xpResult.newLevel,
        newStage: xpResult.newStage,
      });
    }
  }

  return {
    state: {
      ...state,
      lastTickMs: nextLastTickMs,
      inventory: {
        ...state.inventory,
        feathers: totalFeathers,
      },
      weather: {
        ...state.weather,
        driftingFeathers: remainingFeathers,
      },
      beans: nextBeans,
    },
    events,
  };
}
