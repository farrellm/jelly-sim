import { describe, expect, it } from 'vitest';
import {
  BABY_MODE_XP_MULTIPLIER,
  FLAVOR_DEFS,
  MILESTONE_LEVEL_1497,
  REGULAR_XP_MULTIPLIER,
} from '../../src/engine/constants';
import {
  awardXp,
  canUnlockFlavor,
  computeXpGain,
  createInitialGameState,
  getEffectiveHour,
  getFlavorById,
  getFlavorsInTimeWindow,
  getLevelFromXp,
  getLevelProgress,
  getLifeStageForLevel,
  getXpMultiplier,
  isFlavorAvailableAtHour,
  isWithinTimeWindow,
  totalXpForLevel,
  xpForNextLevel,
} from '../../src/engine/progression';

describe('Progression XP curve & Level 1497+ scaling', () => {
  it('computes floor(25 * L^1.15) per level', () => {
    expect(xpForNextLevel(1)).toBe(25);
    expect(xpForNextLevel(2)).toBe(Math.floor(25 * Math.pow(2, 1.15)));
    expect(xpForNextLevel(10)).toBe(Math.floor(25 * Math.pow(10, 1.15)));
    expect(xpForNextLevel(MILESTONE_LEVEL_1497)).toBe(
      Math.floor(25 * Math.pow(MILESTONE_LEVEL_1497, 1.15)),
    );
  });

  it('maps total XP back to exact levels from Lv 1 through Lv 1497+ and beyond', () => {
    expect(totalXpForLevel(1)).toBe(0);
    expect(getLevelFromXp(0)).toBe(1);
    expect(getLevelFromXp(24)).toBe(1);
    expect(getLevelFromXp(25)).toBe(2);

    const testLevels = [1, 2, 9, 10, 49, 50, 199, 200, 999, 1000, 1497, 1500, 2050];
    for (const level of testLevels) {
      const exactThreshold = totalXpForLevel(level);
      expect(Number.isSafeInteger(exactThreshold)).toBe(true);
      expect(getLevelFromXp(exactThreshold)).toBe(level);

      if (level > 1) {
        expect(getLevelFromXp(exactThreshold - 1)).toBe(level - 1);
      }
      const nextThreshold = totalXpForLevel(level + 1);
      expect(getLevelFromXp(nextThreshold - 1)).toBe(level);
    }
  });

  it('computes accurate level progress ratios', () => {
    const lv10Start = totalXpForLevel(10);
    const lv10Span = xpForNextLevel(10);
    const halfWay = lv10Start + Math.floor(lv10Span / 2);

    const progress = getLevelProgress(halfWay);
    expect(progress.level).toBe(10);
    expect(progress.nextLevelXp).toBe(lv10Span);
    expect(progress.currentLevelXp).toBe(Math.floor(lv10Span / 2));
    expect(progress.progressRatio).toBeGreaterThan(0.49);
    expect(progress.progressRatio).toBeLessThanOrEqual(0.5);
  });
});

describe('Life stage transitions', () => {
  it('maps level boundaries to the 5 life stages', () => {
    expect(getLifeStageForLevel(1)).toBe('larva');
    expect(getLifeStageForLevel(9)).toBe('larva');
    expect(getLifeStageForLevel(10)).toBe('sprout');
    expect(getLifeStageForLevel(49)).toBe('sprout');
    expect(getLifeStageForLevel(50)).toBe('scholar');
    expect(getLifeStageForLevel(199)).toBe('scholar');
    expect(getLifeStageForLevel(200)).toBe('citizen');
    expect(getLifeStageForLevel(999)).toBe('citizen');
    expect(getLifeStageForLevel(1000)).toBe('elder');
    expect(getLifeStageForLevel(MILESTONE_LEVEL_1497)).toBe('elder');
    expect(getLifeStageForLevel(2500)).toBe('elder');
  });
});

describe('Baby Mode 1.5x XP multiplier & awardXp', () => {
  it('applies 1.0x XP in Regular Mode and 1.5x XP in Baby Mode', () => {
    expect(getXpMultiplier('regular')).toBe(REGULAR_XP_MULTIPLIER);
    expect(getXpMultiplier('baby')).toBe(BABY_MODE_XP_MULTIPLIER);

    expect(computeXpGain(100, 'regular')).toBe(100);
    expect(computeXpGain(100, 'baby')).toBe(150);
    expect(computeXpGain(0, 'baby')).toBe(0);
  });

  it('awards 1.5x XP in Baby Mode and triggers level-ups, stage evolution, and milestone flavors', () => {
    const regularStart = createInitialGameState({ mode: 'regular', nowMs: 1_700_000_000_000 });
    const babyStart = createInitialGameState({ mode: 'baby', nowMs: 1_700_000_000_000 });

    const regularRes = awardXp(regularStart, 20);
    const babyRes = awardXp(babyStart, 20);

    expect(regularRes.xpGained).toBe(20);
    expect(regularRes.newLevel).toBe(1);
    expect(regularRes.leveledUp).toBe(false);

    expect(babyRes.xpGained).toBe(30);
    expect(babyRes.newLevel).toBe(2);
    expect(babyRes.leveledUp).toBe(true);
    // Original state remains untouched (immutable)
    expect(babyStart.xp).toBe(0);
    expect(babyStart.level).toBe(1);

    // Jump straight to Lv 10 (Sprout) and verify evolution + free flavor unlocks
    const sproutXp = totalXpForLevel(10);
    const sproutRes = awardXp(regularStart, sproutXp);
    expect(sproutRes.newLevel).toBe(10);
    expect(sproutRes.previousStage).toBe('larva');
    expect(sproutRes.newStage).toBe('sprout');
    expect(sproutRes.evolved).toBe(true);
    expect(sproutRes.newlyUnlockedFlavorIds).toContain('butter_popcorn');
    expect(sproutRes.newlyUnlockedFlavorIds).toContain('berry_blue');

    // Jump to Lv 1497 and verify legendary flavor unlock
    const elder1497Xp = totalXpForLevel(MILESTONE_LEVEL_1497);
    const legendRes = awardXp(regularStart, elder1497Xp);
    expect(legendRes.newLevel).toBe(MILESTONE_LEVEL_1497);
    expect(legendRes.newStage).toBe('elder');
    expect(legendRes.newlyUnlockedFlavorIds).toContain('legendary_1497_starlight');
  });
});

describe('Flavor definitions & Time-Zone World Clock metadata', () => {
  it('supports standard and midnight-wrapping time windows', () => {
    expect(isWithinTimeWindow({ startHour: 5, endHour: 9 }, 5)).toBe(true);
    expect(isWithinTimeWindow({ startHour: 5, endHour: 9 }, 9)).toBe(true);
    expect(isWithinTimeWindow({ startHour: 5, endHour: 9 }, 10)).toBe(false);

    // Overnight window 22..3
    expect(isWithinTimeWindow({ startHour: 22, endHour: 3 }, 22)).toBe(true);
    expect(isWithinTimeWindow({ startHour: 22, endHour: 3 }, 0)).toBe(true);
    expect(isWithinTimeWindow({ startHour: 22, endHour: 3 }, 3)).toBe(true);
    expect(isWithinTimeWindow({ startHour: 22, endHour: 3 }, 4)).toBe(false);
    expect(isWithinTimeWindow({ startHour: 22, endHour: 3 }, 21)).toBe(false);
  });

  it('unlocks timed flavors only during matching hours or via World Clock Dial offset', () => {
    const midnightLicorice = getFlavorById('midnight_licorice');
    expect(midnightLicorice).toBeDefined();
    expect(midnightLicorice?.timeWindow).toEqual({ startHour: 22, endHour: 3 });

    // Local midday (12:00)
    const noonLocal = new Date(2026, 5, 1, 12, 0, 0).getTime();
    expect(getEffectiveHour(noonLocal, 0)).toBe(12);
    expect(isFlavorAvailableAtHour(midnightLicorice!, 12)).toBe(false);
    expect(isFlavorAvailableAtHour(midnightLicorice!, 23)).toBe(true);

    const baseState = createInitialGameState({ nowMs: noonLocal });
    const highLevelState = {
      ...baseState,
      level: 35,
      stage: getLifeStageForLevel(35),
      currencies: { ...baseState.currencies, beanBucks: 20 },
    };

    // At noon without World Clock offset, midnight licorice is unavailable
    expect(canUnlockFlavor(midnightLicorice!, highLevelState, noonLocal)).toBe(false);

    // If World Clock Dial is NOT unlocked, timeZoneOffsetHours is ignored
    expect(
      canUnlockFlavor(
        midnightLicorice!,
        { ...highLevelState, timeZoneOffsetHours: 11 },
        noonLocal,
      ),
    ).toBe(false);

    // With World Clock Dial unlocked and +11h shift (12 + 11 = 23:00), it becomes unlockable!
    const shiftedState = {
      ...highLevelState,
      worldClockDialUnlocked: true,
      timeZoneOffsetHours: 11,
    };
    expect(canUnlockFlavor(midnightLicorice!, shiftedState, noonLocal)).toBe(true);
    expect(getFlavorsInTimeWindow(shiftedState, noonLocal).map((f) => f.id)).toContain(
      'midnight_licorice',
    );
  });

  it('ensures all flavor definitions have unique IDs and valid colors', () => {
    const ids = new Set(FLAVOR_DEFS.map((f) => f.id));
    expect(ids.size).toBe(FLAVOR_DEFS.length);
    for (const flavor of FLAVOR_DEFS) {
      expect(flavor.primaryColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(flavor.secondaryColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
