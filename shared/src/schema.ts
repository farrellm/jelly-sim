/**
 * zod schemas shared by client and server (DESIGN.md §4, §13).
 *
 * The server validates every request body against these, and the client validates any save it
 * loads before hydrating the store.
 */

import { z } from "zod";
import type { GameState } from "./gameState.js";

const mood = z.number().min(0).max(100);

const jellyBeanSchema = z.object({
  name: z.string().min(1).max(24),
  stage: z.enum(["larva", "pupa", "sprout", "adult", "elder"]),
  level: z.number().int().min(1),
  xp: z.number().min(0),
  flavor: z.string().min(1),
  unlockedFlavors: z.array(z.string()),
  moods: z.object({
    hunger: mood,
    warmth: mood,
    energy: mood,
    happiness: mood,
  }),
  anger: mood,
  skills: z.object({
    kitchen: z.boolean(),
    trade: z.enum(["blacksmith"]).nullable(),
    hobby: z.enum(["swordsmith"]).nullable(),
  }),
  education: z.object({ inCollege: z.boolean(), graduated: z.boolean() }),
  job: z.object({ title: z.string().nullable(), incomePerTick: z.number().min(0) }),
});

const buildingSchema = z.object({
  id: z.string(),
  type: z.enum(["house", "toilet", "hamburgerStand", "farm", "workshop"]),
  plot: z.number().int().min(0),
  builtAt: z.number().int(),
});

const villageSchema = z.object({
  plots: z.number().int().min(1),
  buildings: z.array(buildingSchema),
  weather: z.enum(["clear", "rain"]),
  neighbors: z.number().int().min(0),
});

const walletSchema = z.object({
  jellyCoins: z.number().min(0),
  beanBucks: z.number().min(0),
  bonusBeans: z.number().min(0),
});

export const gameStateSchema: z.ZodType<GameState> = z.object({
  saveVersion: z.number().int().min(1),
  lastTickAt: z.number().int().min(0),
  playMode: z.enum(["regular", "baby"]),
  expansions: z.object({ viking: z.boolean() }),
  bean: jellyBeanSchema,
  village: villageSchema,
  wallet: walletSchema,
  quests: z.object({
    activeQuestIds: z.array(z.string()),
    completedQuestIds: z.array(z.string()),
  }),
  combat: z.object({
    candyCastleCleared: z.boolean(),
    watermelonWitchDefeated: z.boolean(),
    highestFloor: z.number().int().min(0),
  }),
  stats: z.object({
    totalPlayMs: z.number().min(0),
    holesDug: z.number().int().min(0),
  }),
});

/* ------------------------------------------------------------------ auth DTOs (DESIGN.md §11) */

export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, dashes or underscores");

export const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(128);

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export type RegisterRequest = z.infer<typeof registerSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;

export interface PublicUser {
  id: number;
  username: string;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

/* ------------------------------------------------------------------ save DTOs (DESIGN.md §11) */

export const saveRequestSchema = z.object({
  state: gameStateSchema,
  /** The `saveVersion` the client last saw; drives optimistic concurrency. */
  baseVersion: z.number().int().min(0),
});

export type SaveRequest = z.infer<typeof saveRequestSchema>;

export interface SaveResponse {
  state: GameState;
  saveVersion: number;
}

/** Body of the `409` returned when `baseVersion` is stale. */
export interface SaveConflictResponse {
  error: { code: "SAVE_CONFLICT"; message: string };
  serverState: GameState;
  saveVersion: number;
}

export interface ApiError {
  error: { code: string; message: string };
}
