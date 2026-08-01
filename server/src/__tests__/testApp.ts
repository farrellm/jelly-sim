import { createNewGame, type GameState } from "@jelly/shared";
import type { Express } from "express";
import request from "supertest";

import { createApp } from "../app.js";
import { createDatabase, runMigrations } from "../db.js";

export interface TestContext {
  app: Express;
  close: () => void;
}

export function createTestApp(): TestContext {
  const { db, close } = createDatabase(":memory:");
  runMigrations(db);
  return { app: createApp(db), close };
}

export async function registerUser(
  app: Express,
  username = "papa",
  password = "jellybean1",
): Promise<string> {
  const res = await request(app).post("/api/auth/register").send({ username, password });
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token as string;
}

export function sampleState(overrides: Partial<GameState> = {}): GameState {
  return { ...createNewGame("Beanoncé", 1_700_000_000_000), ...overrides };
}
