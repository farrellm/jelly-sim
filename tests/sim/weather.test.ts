import { describe, expect, it } from 'vitest';
import { MODE_NEED_RATES } from '../../src/sim/constants';
import {
  applyOfflineCatchUp,
  createInitialState,
  dispatch,
  getActiveBean,
  tick,
} from '../../src/sim/engine';
import { getActiveMainQuestView } from '../../src/sim/quests';
import type { GameState, WeatherType } from '../../src/sim/types';
import {
  getWeatherEffects,
  rollNextWeather,
  rollWeatherDurationMs,
  tickWeather,
  WEATHER_CONFIG,
} from '../../src/sim/weather';
import { loadState, migrateState, saveState, type StorageLike } from '../../src/storage/persistence';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('PR-12 Dynamic Weather Scheduler & Chilly Wind Feathers', () => {
  it('deterministically schedules Sunny, Cozy Rain, and Chilly Wind cycles between 6 and 10 minutes', () => {
    const t0 = 1_700_000_000_000;
    const stateA = createInitialState({ nowMs: t0, seed: 2026 });
    const stateB = createInitialState({ nowMs: t0, seed: 2026 });

    expect(stateA.weather).toEqual(stateB.weather);
    expect(stateA.weather.current).toBe('sunny');
    expect(stateA.weather.forecast).not.toBe('sunny');
    expect(stateA.weather.nextChangeMs).toBe(t0 + WEATHER_CONFIG.initialDurationMs);

    // Validate duration rolls always stay within [6 min, 10 min]
    let rng = 98765;
    for (let i = 0; i < 40; i += 1) {
      const step = rollWeatherDurationMs(rng);
      rng = step.nextRngState;
      expect(step.durationMs).toBeGreaterThanOrEqual(WEATHER_CONFIG.minDurationMs);
      expect(step.durationMs).toBeLessThanOrEqual(WEATHER_CONFIG.maxDurationMs);
    }

    // Validate weather transitions always change state and cover all 3 weather types over time
    const seen = new Set<WeatherType>([stateA.weather.current]);
    let curA = stateA;
    let curB = stateB;
    for (let i = 0; i < 20; i += 1) {
      const expectedNext = curA.weather.forecast;
      const jumpMs = curA.weather.nextChangeMs;
      const dtSec = (jumpMs - curA.lastTickMs) / 1000;
      const prevWeather = curA.weather.current;

      curA = tick(curA, dtSec, jumpMs);
      curB = tick(curB, dtSec, jumpMs);

      expect(curA.weather.current).toBe(expectedNext);
      expect(curA.weather.current).not.toBe(prevWeather);
      expect(curA.weather.current).toBe(curB.weather.current);
      expect(curA.weather.nextChangeMs).toBe(curB.weather.nextChangeMs);
      expect(curA.weather.nextChangeMs - jumpMs).toBeGreaterThanOrEqual(WEATHER_CONFIG.minDurationMs);
      expect(curA.weather.nextChangeMs - jumpMs).toBeLessThanOrEqual(WEATHER_CONFIG.maxDurationMs);

      seen.add(curA.weather.current);
    }

    expect(seen.has('sunny')).toBe(true);
    expect(seen.has('cozy_rain')).toBe(true);
    expect(seen.has('chilly_wind')).toBe(true);
  });

  it('grants Cozy Rain +1.5/min mood buff, auto-waters existing crops, and reports weather effects', () => {
    const t0 = 1_700_000_000_000;
    const base = createInitialState({ nowMs: t0, onboarded: true, seed: 55 });

    expect(getWeatherEffects('cozy_rain')).toMatchObject({
      cropGrowthMultiplier: 2,
      autoWatersCrops: true,
      moodBoostPerMin: 1.5,
      spawnsFeathers: false,
    });
    expect(getWeatherEffects('chilly_wind')).toMatchObject({
      cropGrowthMultiplier: 1,
      autoWatersCrops: false,
      spawnsFeathers: true,
      coldWarmthDrainActive: true,
    });

    // Plant an unwatered Parsley in Sunny weather first
    let state: GameState = {
      ...base,
      currencies: { ...base.currencies, jellyCoins: 100 },
      weather: { ...base.weather, current: 'sunny', nextChangeMs: t0 + 3_600_000 },
      beans: base.beans.map((b) => ({
        ...b,
        needs: { hunger: 80, warmth: 80, sleep: 80, hygiene: 80, mood: 70 },
      })),
    };
    state = dispatch(
      state,
      { type: 'PLACE_BUILDING', buildingType: 'garden_plot', tileId: 'plot_pad_1' },
      t0,
    ).state;
    state = dispatch(state, { type: 'PLANT_CROP', tileId: 'plot_pad_1', cropId: 'parsley' }, t0).state;
    expect(state.island.tiles.plot_pad_1?.crop?.watered).toBe(false);

    // Compare 1 minute of Sunny vs 1 minute of Cozy Rain on identical bean & crop state
    const afterSunny = tick(state, 60, t0 + 60_000);
    const rainyStart: GameState = {
      ...state,
      weather: { ...state.weather, current: 'cozy_rain', nextChangeMs: t0 + 3_600_000 },
    };
    const afterRain = tick(rainyStart, 60, t0 + 60_000);

    // Cozy Rain auto-waters the crop AND grants an exact +1.5 mood boost over Sunny!
    expect(afterRain.island.tiles.plot_pad_1?.crop?.watered).toBe(true);
    expect(getActiveBean(afterRain).needs.mood - getActiveBean(afterSunny).needs.mood).toBeCloseTo(
      MODE_NEED_RATES.regular.cozyRainMoodBoostPerMin,
      5,
    );
  });

  it('spikes Warmth drain during Chilly Wind, spawns collectible Feathers, and completes Quest 5 end-to-end', () => {
    const t0 = 1_700_000_000_000;
    const base = createInitialState({ nowMs: t0, onboarded: true, seed: 777 });
    let state: GameState = {
      ...base,
      weather: {
        ...base.weather,
        current: 'chilly_wind',
        forecast: 'sunny',
        nextChangeMs: t0 + 10 * 60 * 1000,
        driftingFeathers: [],
        featherSpawnCooldownSec: 0,
        featherSeq: 0,
      },
      quests: {
        ...base.quests,
        completedIds: ['q1_welcome', 'q2_survive', 'q3_toilet', 'q4_green_thumb'],
        activeQuestId: 'q5_bundle_up',
        drBubblegumAtDoor: false,
      },
      beans: base.beans.map((b) => ({
        ...b,
        needs: { ...b.needs, warmth: 80 },
      })),
    };

    // Tick 60 seconds in Chilly Wind -> Warmth drops by exact 3.5/min & 5 drifting feathers spawn (capped at maxActiveFeathers = 5)
    let now = t0;
    for (let i = 0; i < 6; i += 1) {
      now += 10_000;
      state = tick(state, 10, now);
    }

    expect(getActiveBean(state).needs.warmth).toBeCloseTo(
      80 - MODE_NEED_RATES.regular.warmthColdPerMin,
      5,
    );
    expect(state.weather.driftingFeathers).toHaveLength(WEATHER_CONFIG.maxActiveFeathers);

    // Collect all 5 drifting feathers!
    for (let i = 0; i < 5; i += 1) {
      const featherId = state.weather.driftingFeathers[0]!.id;
      const collected = dispatch(state, { type: 'COLLECT_FEATHER', featherId }, now + i * 100);
      expect(collected.events).toContainEqual({
        type: 'FEATHER_COLLECTED',
        featherId,
        totalFeathers: i + 1,
        xpGained: WEATHER_CONFIG.featherCollectXp,
      });
      state = collected.state;
    }

    expect(state.inventory.feathers).toBe(5);
    expect(state.quests.counters.feathersGathered).toBe(5);
    expect(state.weather.driftingFeathers).toHaveLength(0);

    // Collecting when no feathers remain is cleanly rejected
    const emptyCollect = dispatch(state, { type: 'COLLECT_FEATHER' }, now + 600);
    expect(emptyCollect.events[0]).toMatchObject({
      type: 'ACTION_REJECTED',
      actionType: 'COLLECT_FEATHER',
    });

    // Knit a Cozy Feather Blanket -> completes Quest 5 ("Bundle Up!") and summons Dr. Bubblegum!
    const knitted = dispatch(state, { type: 'KNIT_BLANKET' }, now + 1_000);
    state = knitted.state;
    expect(state.inventory.blankets).toBe(1);
    expect(getActiveMainQuestView(state)?.progress.completed).toBe(true);
    expect(state.quests.drBubblegumAtDoor).toBe(true);
    expect(knitted.events).toContainEqual({
      type: 'DR_BUBBLEGUM_KNOCKED',
      questId: 'q5_bundle_up',
      questTitle: 'Bundle Up!',
      reason: 'quest_ready',
    });

    // Drape the Knitted Blanket onto the bean -> Warmth jumps to 100 and cold drain is cut by 90%!
    state = dispatch(state, { type: 'USE_BLANKET' }, now + 2_000).state;
    expect(getActiveBean(state).needs.warmth).toBe(100);
    const afterColdMin = tick(state, 60, now + 62_000);
    expect(getActiveBean(afterColdMin).needs.warmth).toBeCloseTo(
      100 - MODE_NEED_RATES.regular.warmthColdPerMin * 0.1,
      5,
    );
  });

  it('prunes expired feathers, clears feathers when Chilly Wind ends, and emits WEATHER_CHANGED', () => {
    const t0 = 1_700_000_000_000;
    const base = createInitialState({ nowMs: t0, onboarded: true, seed: 303 });
    const chilly: GameState = {
      ...base,
      weather: {
        current: 'chilly_wind',
        forecast: 'cozy_rain',
        nextChangeMs: t0 + 60_000,
        driftingFeathers: [
          {
            id: 'feather-old',
            spawnedAtMs: t0 - 40_000,
            expiresAtMs: t0 + 5_000,
            laneX: 0.2,
            laneZ: -0.3,
          },
        ],
        featherSpawnCooldownSec: 12,
        featherSeq: 1,
      },
    };

    // After 6 seconds, feather-old expires cleanly
    const afterExpire = tickWeather(chilly, 6, t0 + 6_000, { isOffline: false });
    expect(afterExpire.weather.driftingFeathers.some((f) => f.id === 'feather-old')).toBe(false);

    // At t0 + 60s, weather transitions from chilly_wind -> cozy_rain, emits WEATHER_CHANGED, and clears feathers
    const transitioned = tickWeather(chilly, 60, t0 + 60_000, { isOffline: false });
    expect(transitioned.weather.current).toBe('cozy_rain');
    expect(transitioned.weather.driftingFeathers).toHaveLength(0);
    expect(transitioned.weatherChangedEvent).toMatchObject({
      type: 'WEATHER_CHANGED',
      previous: 'chilly_wind',
      current: 'cozy_rain',
    });
  });

  it('catches up weather schedule cleanly offline and persists/migrates weather state losslessly', () => {
    const t0 = 1_700_000_000_000;
    const storage = createMemoryStorage();
    let state = createInitialState({ nowMs: t0, onboarded: true, seed: 88 });

    // Force Chilly Wind with an active drifting feather and verify lossless persistence
    state = {
      ...state,
      weather: {
        current: 'chilly_wind',
        forecast: 'sunny',
        nextChangeMs: t0 + 8 * 60 * 1000,
        driftingFeathers: [
          {
            id: 'feather-1',
            spawnedAtMs: t0,
            expiresAtMs: t0 + 45_000,
            laneX: -0.4,
            laneZ: 0.5,
          },
        ],
        featherSpawnCooldownSec: 9,
        featherSeq: 1,
      },
    };

    saveState(state, { storage, idb: null });
    const reloaded = loadState('regular', { storage, idb: null });
    expect(reloaded.state).toEqual(state);

    // Offline catch-up for 2 hours advances weather clock past safeNowMs and clears stale feathers
    const laterMs = t0 + 2 * 3600 * 1000;
    const caughtUp = applyOfflineCatchUp(reloaded.state, laterMs);
    expect(caughtUp.state.weather.nextChangeMs).toBeGreaterThan(laterMs);
    expect(caughtUp.state.weather.driftingFeathers).toHaveLength(0);

    // Legacy v1 save without forecast/driftingFeathers migrates gracefully without corruption
    const legacyV1 = {
      ...createInitialState({ nowMs: t0, onboarded: true }),
      weather: { current: 'cozy_rain', nextChangeMs: t0 + 300_000 },
    };
    const migrated = migrateState(legacyV1, 'regular', t0);
    expect(migrated).not.toBeNull();
    expect(migrated?.state.weather.current).toBe('cozy_rain');
    expect(migrated?.state.weather.forecast).not.toBe('cozy_rain');
    expect(migrated?.state.weather.driftingFeathers).toEqual([]);
    expect(rollNextWeather('sunny', 123).weather).not.toBe('sunny');
  });
});
