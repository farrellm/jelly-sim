/**
 * Save load/store (DESIGN.md §11, §14).
 *
 * The server stores the `GameState` blob and hands it back. It validates the shape and sanity
 * checks `lastTickAt`, but it deliberately does **not** re-simulate: the client is the sim
 * authority (DESIGN.md §13).
 */

import { saveRequestSchema, type GameState, type SaveResponse } from "@jelly/shared";
import { eq } from "drizzle-orm";
import { Router } from "express";

import type { AppDb } from "../db.js";
import { parseBody, sendError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { saves } from "../schema/index.js";

/** Tolerance for client clock skew before a save's `lastTickAt` is treated as bogus. */
const FUTURE_SKEW_TOLERANCE_MS = 5 * 60 * 1_000;

export function createSaveRouter(db: AppDb): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", (req, res) => {
    const row = db.select().from(saves).where(eq(saves.userId, req.userId!)).get();
    if (!row) {
      // No save yet — the client seeds a new game.
      res.status(204).end();
      return;
    }

    const body: SaveResponse = {
      state: JSON.parse(row.stateJson) as GameState,
      saveVersion: row.saveVersion,
    };
    res.json(body);
  });

  router.put("/", (req, res) => {
    const { state, baseVersion } = parseBody(saveRequestSchema, req.body);

    if (state.lastTickAt > Date.now() + FUTURE_SKEW_TOLERANCE_MS) {
      sendError(res, 400, "IMPLAUSIBLE_TIMESTAMP", "Save is timestamped in the future");
      return;
    }

    const userId = req.userId!;
    const now = Date.now();

    const result = db.transaction((tx) => {
      const existing = tx.select().from(saves).where(eq(saves.userId, userId)).get();

      if (!existing) {
        // First save for this account (or the row was removed) — accept it.
        tx.insert(saves)
          .values({
            userId,
            stateJson: JSON.stringify(state),
            saveVersion: 1,
            updatedAt: now,
          })
          .run();
        return { conflict: false as const, saveVersion: 1 };
      }

      if (existing.saveVersion !== baseVersion) {
        return {
          conflict: true as const,
          saveVersion: existing.saveVersion,
          serverState: JSON.parse(existing.stateJson) as GameState,
        };
      }

      const saveVersion = existing.saveVersion + 1;
      tx.update(saves)
        .set({ stateJson: JSON.stringify(state), saveVersion, updatedAt: now })
        .where(eq(saves.userId, userId))
        .run();
      return { conflict: false as const, saveVersion };
    });

    if (result.conflict) {
      res.status(409).json({
        error: {
          code: "SAVE_CONFLICT",
          message: "This save is based on an older version; reconcile with the server state",
        },
        serverState: result.serverState,
        saveVersion: result.saveVersion,
      });
      return;
    }

    res.json({ saveVersion: result.saveVersion });
  });

  return router;
}
