/**
 * Username/password auth (DESIGN.md §11).
 */

import { loginSchema, registerSchema, type AuthResponse } from "@jelly/shared";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { Router } from "express";

import type { AppDb } from "../db.js";
import { BCRYPT_ROUNDS } from "../env.js";
import { ApiError, parseBody, sendError } from "../errors.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { users } from "../schema/index.js";

export function createAuthRouter(db: AppDb): Router {
  const router = Router();

  router.post("/register", async (req, res) => {
    const { username, password } = parseBody(registerSchema, req.body);

    const existing = db.select().from(users).where(eq(users.username, username)).get();
    if (existing) {
      throw new ApiError(409, "USERNAME_TAKEN", "That username is already taken");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const created = db
      .insert(users)
      .values({ username, passwordHash, createdAt: Date.now() })
      .returning({ id: users.id, username: users.username })
      .get();

    const body: AuthResponse = {
      token: signToken(created.id, created.username),
      user: { id: created.id, username: created.username },
    };
    res.status(201).json(body);
  });

  router.post("/login", async (req, res) => {
    const { username, password } = parseBody(loginSchema, req.body);

    const user = db.select().from(users).where(eq(users.username, username)).get();
    // Compare even when the user is missing so timing doesn't leak account existence.
    const matches = await bcrypt.compare(password, user?.passwordHash ?? "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    if (!user || !matches) {
      sendError(res, 401, "INVALID_CREDENTIALS", "Wrong username or password");
      return;
    }

    const body: AuthResponse = {
      token: signToken(user.id, user.username),
      user: { id: user.id, username: user.username },
    };
    res.json(body);
  });

  router.get("/me", requireAuth, (req, res) => {
    const user = db.select().from(users).where(eq(users.id, req.userId!)).get();
    if (!user) {
      sendError(res, 401, "UNAUTHORIZED", "User no longer exists");
      return;
    }
    res.json({ user: { id: user.id, username: user.username } });
  });

  return router;
}
