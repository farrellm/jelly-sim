import { describe, expect, it } from "vitest";

import { COSTS } from "./economy.js";
import { SAVE_VERSION, createNewGame } from "./gameState.js";
import { SaveMigrationError, migrateSave } from "./migrations.js";
import { gameStateSchema, registerSchema, saveRequestSchema } from "./schema.js";

describe("migrateSave", () => {
  it("round-trips a current save through JSON", () => {
    const state = createNewGame("Jelly Belly");
    const restored = migrateSave(JSON.parse(JSON.stringify(state)));

    expect(restored).toEqual(state);
  });

  it("rejects a save from a newer build", () => {
    const state = { ...createNewGame("Future Bean"), saveVersion: SAVE_VERSION + 1 };

    expect(() => migrateSave(state)).toThrow(SaveMigrationError);
  });

  it("rejects a save with no migration path", () => {
    const state = { ...createNewGame("Ancient Bean"), saveVersion: 0 };

    expect(() => migrateSave(state)).toThrow(/No migration from save version 0/);
  });

  it("rejects a structurally invalid save", () => {
    const broken = { ...createNewGame("Broken Bean"), wallet: { jellyCoins: -5 } };

    expect(() => migrateSave(broken)).toThrow(SaveMigrationError);
  });

  it("rejects a non-object", () => {
    expect(() => migrateSave(null)).toThrow(SaveMigrationError);
    expect(() => migrateSave("nope")).toThrow(SaveMigrationError);
  });
});

describe("schemas", () => {
  it("accepts a fresh game state", () => {
    expect(gameStateSchema.safeParse(createNewGame("Sprinkles")).success).toBe(true);
  });

  it("enforces username and password rules", () => {
    expect(registerSchema.safeParse({ username: "papa", password: "jellybean1" }).success).toBe(true);
    expect(registerSchema.safeParse({ username: "no", password: "jellybean1" }).success).toBe(false);
    expect(registerSchema.safeParse({ username: "papa", password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ username: "bad name", password: "jellybean1" }).success).toBe(
      false,
    );
  });

  it("requires a baseVersion on a save request", () => {
    const state = createNewGame("Sprinkles");

    expect(saveRequestSchema.safeParse({ state, baseVersion: 0 }).success).toBe(true);
    expect(saveRequestSchema.safeParse({ state }).success).toBe(false);
  });
});

describe("economy constants", () => {
  it("keeps giving the Jelly Bean space at 14 bean bucks (CONCEPT §4)", () => {
    expect(COSTS.giveSpaceBeanBucks).toBe(14);
  });
});
