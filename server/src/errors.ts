/**
 * Uniform error shape `{ error: { code, message } }` (DESIGN.md §11).
 */

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

/** Parse a request body, throwing a 400 `ApiError` with the first zod issue. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".");
    throw new ApiError(
      400,
      "INVALID_BODY",
      where ? `${where}: ${issue?.message}` : (issue?.message ?? "Invalid request body"),
    );
  }
  return parsed.data;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }
  console.error("[jelly-sim] unhandled error:", err);
  sendError(res, 500, "INTERNAL_ERROR", "Something went wrong");
}
