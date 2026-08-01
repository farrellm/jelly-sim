import { describe, expect, it } from "vitest";

import {
  ANGER_PER_CRITICAL_MOOD_PER_MIN,
  BASE_DECAY_PER_MIN,
  CRITICAL_MOOD,
  KITCHEN_HUNGER_DECAY_MULTIPLIER,
  MAX_OFFLINE_CATCHUP_MS,
  PLAY_MODE_DECAY_MULTIPLIER,
  STAGE_DECAY_MULTIPLIER,
  XP_PER_CARE_ACTION,
} from "./economy.js";
import { createNewGame, type GameState } from "./gameState.js";
import {
  applyAction,
  decayRatePerMin,
  moodCallouts,
  offlineCatchup,
  offlineCatchupSummary,
  tick,
} from "./sim.js";

const T0 = 1_700_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function game(overrides: (state: GameState) => GameState = (s) => s): GameState {
  return overrides(createNewGame("Beanoncé", T0));
}

describe("tick", () => {
  it("decays hunger, warmth and energy at the stage-adjusted rate", () => {
    const before = game();
    const after = tick(before, 10 * MINUTE);

    const expectedHunger =
      before.bean.moods.hunger -
      BASE_DECAY_PER_MIN.hunger * STAGE_DECAY_MULTIPLIER.larva * 10;

    expect(after.bean.moods.hunger).toBeCloseTo(expectedHunger, 6);
    expect(after.bean.moods.warmth).toBeLessThan(before.bean.moods.warmth);
    expect(after.bean.moods.energy).toBeLessThan(before.bean.moods.energy);
  });

  it("advances lastTickAt by exactly dtMs so ticks compose", () => {
    const before = game();
    const once = tick(before, 10 * MINUTE);
    const twice = tick(tick(before, 5 * MINUTE), 5 * MINUTE);

    expect(once.lastTickAt).toBe(T0 + 10 * MINUTE);
    expect(twice.lastTickAt).toBe(once.lastTickAt);
    expect(twice.bean.moods.hunger).toBeCloseTo(once.bean.moods.hunger, 6);
  });

  it("does not mutate the state it is given", () => {
    const before = game();
    const snapshot = structuredClone(before);

    tick(before, HOUR);

    expect(before).toEqual(snapshot);
  });

  it("ignores non-positive or non-finite deltas", () => {
    const before = game();

    expect(tick(before, 0)).toBe(before);
    expect(tick(before, -5_000)).toBe(before);
    expect(tick(before, Number.NaN)).toBe(before);
  });

  it("never lets a mood fall below zero", () => {
    const after = tick(game(), 30 * 24 * HOUR);

    expect(after.bean.moods.hunger).toBe(0);
    expect(after.bean.moods.warmth).toBe(0);
    expect(after.bean.moods.energy).toBe(0);
  });

  it("slows hunger decay once the bean has kitchen skills (CONCEPT §6)", () => {
    const plain = game();
    const cook = game((s) => ({ ...s, bean: { ...s.bean, skills: { ...s.bean.skills, kitchen: true } } }));

    expect(decayRatePerMin(cook, "hunger")).toBeCloseTo(
      decayRatePerMin(plain, "hunger") * KITCHEN_HUNGER_DECAY_MULTIPLIER,
      6,
    );
    expect(tick(cook, HOUR).bean.moods.hunger).toBeGreaterThan(tick(plain, HOUR).bean.moods.hunger);
  });

  it("makes baby mode harder than regular mode (CONCEPT §11)", () => {
    const regular = game();
    const baby = game((s) => ({ ...s, playMode: "baby" }));

    expect(decayRatePerMin(baby, "hunger")).toBeCloseTo(
      decayRatePerMin(regular, "hunger") * PLAY_MODE_DECAY_MULTIPLIER.baby,
      6,
    );
  });

  it("accrues anger once a need goes critical", () => {
    const neglected = game((s) => ({
      ...s,
      bean: { ...s.bean, moods: { hunger: CRITICAL_MOOD - 1, warmth: 90, energy: 90, happiness: 80 } },
    }));

    const after = tick(neglected, 10 * MINUTE);

    expect(after.bean.anger).toBeCloseTo(ANGER_PER_CRITICAL_MOOD_PER_MIN * 10, 6);
  });

  it("sheds anger while every need is comfortably met", () => {
    const calm = game((s) => ({
      ...s,
      bean: { ...s.bean, anger: 40, moods: { hunger: 95, warmth: 95, energy: 95, happiness: 60 } },
    }));

    expect(tick(calm, 10 * MINUTE).bean.anger).toBeLessThan(40);
  });

  it("drags happiness down as anger climbs", () => {
    const angry = game((s) => ({
      ...s,
      bean: { ...s.bean, anger: 90, moods: { hunger: 50, warmth: 50, energy: 50, happiness: 80 } },
    }));

    expect(tick(angry, 5 * MINUTE).bean.moods.happiness).toBeLessThan(80);
  });

  it("pays job income per tick", () => {
    const employed = game((s) => ({
      ...s,
      bean: { ...s.bean, job: { title: "Bubblegum Lab Assistant", incomePerTick: 0.5 } },
    }));

    // TICK_INTERVAL_MS is 1s, so a minute is 60 ticks.
    expect(tick(employed, MINUTE).wallet.jellyCoins).toBeCloseTo(
      employed.wallet.jellyCoins + 30,
      6,
    );
  });
});

describe("offlineCatchup", () => {
  it("applies the elapsed time and lands lastTickAt on now", () => {
    const before = game();
    const after = offlineCatchup(before, T0 + 2 * HOUR);

    expect(after.lastTickAt).toBe(T0 + 2 * HOUR);
    expect(after.bean.moods.hunger).toBeCloseTo(tick(before, 2 * HOUR).bean.moods.hunger, 6);
  });

  it("clamps the penalty for a long absence but still catches the clock up", () => {
    const before = game();
    const away = T0 + 7 * 24 * HOUR;
    const after = offlineCatchup(before, away);

    expect(after.lastTickAt).toBe(away);
    expect(after.stats.totalPlayMs).toBe(MAX_OFFLINE_CATCHUP_MS);
    expect(after.bean.moods.hunger).toBeCloseTo(
      tick(before, MAX_OFFLINE_CATCHUP_MS).bean.moods.hunger,
      6,
    );
  });

  it("just resyncs the clock when the save is from the future", () => {
    const before = game();
    const after = offlineCatchup(before, T0 - HOUR);

    expect(after.lastTickAt).toBe(T0 - HOUR);
    expect(after.bean.moods).toEqual(before.bean.moods);
  });

  it("reports how much of the absence was forgiven", () => {
    const summary = offlineCatchupSummary(game(), T0 + 12 * HOUR);

    expect(summary.elapsedMs).toBe(12 * HOUR);
    expect(summary.appliedMs).toBe(MAX_OFFLINE_CATCHUP_MS);
    expect(summary.forgivenMs).toBe(12 * HOUR - MAX_OFFLINE_CATCHUP_MS);
  });
});

describe("applyAction", () => {
  const hungry = game((s) => ({
    ...s,
    bean: { ...s.bean, moods: { hunger: 20, warmth: 20, energy: 20, happiness: 20 } },
  }));

  it("feeds the bean and grants xp", () => {
    const result = applyAction(hungry, { type: "feed" });

    expect(result.ok).toBe(true);
    expect(result.state.bean.moods.hunger).toBe(50);
    expect(result.state.bean.xp).toBe(hungry.bean.xp + XP_PER_CARE_ACTION);
  });

  it("knits a blanket for warmth and puts the bean to sleep for energy", () => {
    expect(applyAction(hungry, { type: "knitBlanket" }).state.bean.moods.warmth).toBe(55);
    expect(applyAction(hungry, { type: "sleep" }).state.bean.moods.energy).toBe(65);
  });

  it("caps a mood at 100", () => {
    const nearlyFull = game((s) => ({
      ...s,
      bean: { ...s.bean, moods: { ...s.bean.moods, hunger: 95 } },
    }));

    expect(applyAction(nearlyFull, { type: "feed" }).state.bean.moods.hunger).toBe(100);
  });

  it("rejects an action whose need is already full", () => {
    const stuffed = game((s) => ({
      ...s,
      bean: { ...s.bean, moods: { ...s.bean.moods, hunger: 100 } },
    }));
    const result = applyAction(stuffed, { type: "feed" });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: "moodAlreadyFull" });
    expect(result.state).toBe(stuffed);
  });

  it("does not mutate the state it is given", () => {
    const snapshot = structuredClone(hungry);

    applyAction(hungry, { type: "feed" });

    expect(hungry).toEqual(snapshot);
  });
});

describe("moodCallouts", () => {
  it("stays quiet while the bean is content", () => {
    expect(moodCallouts(game())).toEqual([]);
  });

  it("calls out every critical need", () => {
    const neglected = game((s) => ({
      ...s,
      bean: { ...s.bean, moods: { hunger: 5, warmth: 5, energy: 90, happiness: 10 } },
    }));

    expect(moodCallouts(neglected).map((c) => c.mood)).toEqual(["hunger", "warmth"]);
  });

  it("mentions anger once the bean is properly sulking", () => {
    const furious = game((s) => ({ ...s, bean: { ...s.bean, anger: 80 } }));

    expect(moodCallouts(furious).map((c) => c.mood)).toContain("anger");
  });
});
