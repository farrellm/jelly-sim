/**
 * REST client for the save/auth API (DESIGN.md §11). Adds the bearer token and normalises the
 * server's `{ error: { code, message } }` shape into thrown errors.
 */

import type { AuthResponse, GameState, PublicUser, SaveResponse } from "@jelly/shared";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Thrown when `PUT /api/save` reports that our `baseVersion` is stale (DESIGN.md §14). */
export class SaveConflictError extends Error {
  constructor(
    readonly serverState: GameState,
    readonly saveVersion: number,
  ) {
    super("Save conflict");
  }
}

/** Thrown when the request never reached the server — the caller falls back to local state. */
export class NetworkError extends Error {}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  token?: string | null;
  keepalive?: boolean;
}

async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      keepalive: options.keepalive,
    });
  } catch (cause) {
    throw new NetworkError(cause instanceof Error ? cause.message : "Network request failed");
  }

  if (response.status === 409 && path === "/api/save") {
    const body = (await response.json()) as { serverState: GameState; saveVersion: number };
    throw new SaveConflictError(body.serverState, body.saveVersion);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? `Request failed (${response.status})`,
    );
  }

  return response;
}

export const api = {
  async register(username: string, password: string): Promise<AuthResponse> {
    const res = await request("/api/auth/register", {
      method: "POST",
      body: { username, password },
    });
    return (await res.json()) as AuthResponse;
  },

  async login(username: string, password: string): Promise<AuthResponse> {
    const res = await request("/api/auth/login", { method: "POST", body: { username, password } });
    return (await res.json()) as AuthResponse;
  },

  async me(token: string): Promise<PublicUser> {
    const res = await request("/api/auth/me", { token });
    const body = (await res.json()) as { user: PublicUser };
    return body.user;
  },

  /** `null` when the account has no save yet (204) — the client seeds a new game. */
  async getSave(token: string): Promise<SaveResponse | null> {
    const res = await request("/api/save", { token });
    if (res.status === 204) return null;
    return (await res.json()) as SaveResponse;
  },

  async putSave(
    token: string,
    state: GameState,
    baseVersion: number,
    keepalive = false,
  ): Promise<number> {
    const res = await request("/api/save", {
      method: "PUT",
      token,
      body: { state, baseVersion },
      keepalive,
    });
    const body = (await res.json()) as { saveVersion: number };
    return body.saveVersion;
  },
};
