/**
 * Express app factory (DESIGN.md §11). Kept separate from `index.ts` so tests can mount the API
 * against an in-memory database without listening on a port.
 */

import cors from "cors";
import express, { type Express } from "express";
import rateLimit from "express-rate-limit";

import type { AppDb } from "./db.js";
import { env } from "./env.js";
import { errorHandler, sendError } from "./errors.js";
import { createAuthRouter } from "./routes/auth.js";
import { createSaveRouter } from "./routes/save.js";

/** Slow credential stuffing without getting in a real player's way (DESIGN.md §13). */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: env.NODE_ENV === "test" ? 1_000 : 50,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts; try again later" } },
});

export function createApp(db: AppDb): Express {
  const app = express();

  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.use(cors({ origin: env.isProduction ? env.CLIENT_ORIGIN : true }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authLimiter, createAuthRouter(db));
  app.use("/api/save", createSaveRouter(db));

  app.use("/api", (_req, res) => {
    sendError(res, 404, "NOT_FOUND", "No such endpoint");
  });

  app.use(errorHandler);
  return app;
}
