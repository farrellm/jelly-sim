import {
  ANGRY_THRESHOLD,
  CALM_NEED_THRESHOLD,
  CARE_ACTIONS,
  CRITICAL_NEED_THRESHOLD,
  LOW_NEED_THRESHOLD,
  MEGA_TANTRUM_THRESHOLD,
  MODE_NEED_RATES,
  NEED_MAX,
  NEED_MIN,
  REGULAR_OFFLINE_ANGER_CAP,
} from './constants';
import type { BeanSpeechCue, GameMode, JellyBeanEntity, WeatherType } from './types';

export interface NeedsTickOptions {
  mode: GameMode;
  weather: WeatherType;
  isOffline: boolean;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function getNeedFloor(mode: GameMode): number {
  return MODE_NEED_RATES[mode].needFloor;
}

export function isBeanAngry(bean: JellyBeanEntity): boolean {
  return bean.anger >= ANGRY_THRESHOLD;
}

export function isMegaTantrum(bean: JellyBeanEntity, mode: GameMode): boolean {
  return mode === 'baby' && bean.anger >= MEGA_TANTRUM_THRESHOLD;
}

/**
 * Advances a single Jelly Bean's 5 continuous needs, blanket timer, and anger state
 * by `dtSeconds` in a pure, deterministic manner.
 */
export function tickBeanNeeds(
  bean: JellyBeanEntity,
  dtSeconds: number,
  options: NeedsTickOptions,
): JellyBeanEntity {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    return bean;
  }

  const rates = MODE_NEED_RATES[options.mode];
  const floor = rates.needFloor;
  const dtMinutes = dtSeconds / 60;
  const decayScale = bean.isSleeping ? CARE_ACTIONS.sleepingOtherDecayMultiplier : 1;

  const hunger = clamp(
    bean.needs.hunger - rates.hungerPerMin * dtMinutes * decayScale,
    floor,
    NEED_MAX,
  );

  // Warmth accounts for Chilly Wind weather and active Knitted Feather Blanket protection.
  const baseWarmthRate =
    options.weather === 'chilly_wind' ? rates.warmthColdPerMin : rates.warmthPerMin;

  let nextBlanketRemainingSec = bean.blanketRemainingSec;
  let effectiveWarmthMinutes = dtMinutes;
  if (bean.blanketRemainingSec > 0) {
    const coveredSec = Math.min(bean.blanketRemainingSec, dtSeconds);
    const uncoveredSec = dtSeconds - coveredSec;
    effectiveWarmthMinutes =
      (coveredSec * (1 - CARE_ACTIONS.blanketColdResistance) + uncoveredSec) / 60;
    nextBlanketRemainingSec = Math.max(0, bean.blanketRemainingSec - dtSeconds);
  }

  const warmth = clamp(
    bean.needs.warmth - baseWarmthRate * effectiveWarmthMinutes * decayScale,
    floor,
    NEED_MAX,
  );

  const hygiene = clamp(
    bean.needs.hygiene - rates.hygienePerMin * dtMinutes * decayScale,
    floor,
    NEED_MAX,
  );

  let sleep: number;
  let nextIsSleeping = bean.isSleeping;
  if (bean.isSleeping) {
    if (options.isOffline) {
      // Offline tucked-in sleep performs a full peaceful rest.
      sleep = NEED_MAX;
    } else {
      sleep = clamp(
        bean.needs.sleep + CARE_ACTIONS.sleepActiveRestorePerSec * dtSeconds,
        floor,
        NEED_MAX,
      );
      if (sleep >= NEED_MAX) {
        nextIsSleeping = false;
      }
    }
  } else {
    sleep = clamp(bean.needs.sleep - rates.sleepPerMin * dtMinutes, floor, NEED_MAX);
  }

  // Mood drifts toward the average of the other four needs, modified by Cozy Rain & Baby Mode.
  const avgOtherNeeds = (hunger + warmth + sleep + hygiene) / 4;
  const moodDiff = avgOtherNeeds - bean.needs.mood;
  const maxMoodDrift = rates.moodDriftPerMin * dtMinutes;
  const moodAfterDrift = bean.needs.mood + clamp(moodDiff, -maxMoodDrift, maxMoodDrift);
  const rainBoost =
    options.weather === 'cozy_rain' ? rates.cozyRainMoodBoostPerMin * dtMinutes : 0;
  const babyDecay = rates.moodBaseDecayPerMin * dtMinutes;
  const mood = clamp(moodAfterDrift - babyDecay + rainBoost, floor, NEED_MAX);

  // Anger climbs when any core need is critical (< 20), and cools when all are comfortable (>= 40).
  const hasCriticalNeed =
    hunger < CRITICAL_NEED_THRESHOLD ||
    warmth < CRITICAL_NEED_THRESHOLD ||
    sleep < CRITICAL_NEED_THRESHOLD ||
    hygiene < CRITICAL_NEED_THRESHOLD;
  const allNeedsCalm =
    hunger >= CALM_NEED_THRESHOLD &&
    warmth >= CALM_NEED_THRESHOLD &&
    sleep >= CALM_NEED_THRESHOLD &&
    hygiene >= CALM_NEED_THRESHOLD;

  let nextAnger = bean.anger;
  if (hasCriticalNeed) {
    nextAnger += rates.angerClimbPerMin * dtMinutes;
  } else if (allNeedsCalm) {
    nextAnger -= rates.angerDecayPerMin * dtMinutes;
  }

  const maxAnger =
    options.mode === 'regular' && options.isOffline ? REGULAR_OFFLINE_ANGER_CAP : NEED_MAX;
  nextAnger = clamp(nextAnger, NEED_MIN, maxAnger);

  return {
    ...bean,
    isSleeping: nextIsSleeping,
    blanketRemainingSec: nextBlanketRemainingSec,
    anger: nextAnger,
    needs: {
      hunger,
      warmth,
      sleep,
      hygiene,
      mood,
    },
  };
}

/**
 * Returns the highest-priority canonical speech cue for a Jelly Bean's current state,
 * or null if all needs are comfortable.
 */
export function getBeanSpeechCue(
  bean: JellyBeanEntity,
  parentTitle: string,
  mode: GameMode = 'regular',
): BeanSpeechCue | null {
  const title = parentTitle.trim() || 'Mama';

  if (isMegaTantrum(bean, mode)) {
    return {
      cue: 'angry',
      message: `${title}! MEGA TANTRUM!!`,
    };
  }

  if (bean.needs.hunger < LOW_NEED_THRESHOLD) {
    return {
      cue: 'hungry',
      message:
        bean.needs.hunger < CRITICAL_NEED_THRESHOLD
          ? `${title}! Feed me!`
          : 'Jelly Bean hungry!',
    };
  }

  if (bean.needs.warmth < LOW_NEED_THRESHOLD) {
    return {
      cue: 'cold',
      message: `Jelly Bean cold. ${title} help.`,
    };
  }

  if (bean.needs.sleep < LOW_NEED_THRESHOLD) {
    return {
      cue: 'sleepy',
      message: "I'm so sleepy. Jellybean, sleep, sleep.",
    };
  }

  if (bean.needs.hygiene < LOW_NEED_THRESHOLD) {
    return {
      cue: 'hygiene',
      message: 'Jelly Bean needs a toilet!',
    };
  }

  if (isBeanAngry(bean)) {
    return {
      cue: 'angry',
      message: 'Jelly Bean is angry at you!',
    };
  }

  return null;
}
