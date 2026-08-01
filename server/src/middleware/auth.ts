/**
 * JWT verification (DESIGN.md §11, §13). Attaches `req.userId` on success.
 */

import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { JWT_EXPIRES_IN, env } from "../env.js";
import { sendError } from "../errors.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

interface JwtPayload {
  sub: string;
  username: string;
}

export function signToken(userId: number, username: string): string {
  return jwt.sign({ sub: String(userId), username } satisfies JwtPayload, env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    sendError(res, 401, "UNAUTHORIZED", "Missing bearer token");
    return;
  }

  try {
    const payload = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as JwtPayload;
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId)) {
      sendError(res, 401, "UNAUTHORIZED", "Malformed token");
      return;
    }
    req.userId = userId;
    next();
  } catch {
    sendError(res, 401, "UNAUTHORIZED", "Invalid or expired token");
  }
}
