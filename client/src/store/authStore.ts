/**
 * Auth session state.
 *
 * The JWT is kept in memory and mirrored to localStorage so an installed PWA stays signed in
 * across launches. DESIGN.md §13 accepts the XSS trade-off for a hobby game and has no refresh
 * tokens — an expired token simply sends the player back to the login screen.
 */

import type { PublicUser } from "@jelly/shared";
import { create } from "zustand";

import { ApiError, NetworkError, api } from "../net/api.js";
import { clearCachedSave } from "../net/offlineCache.js";

const TOKEN_KEY = "jelly-sim:token";
const USER_KEY = "jelly-sim:user";

function readStoredUser(): PublicUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}

interface AuthState {
  token: string | null;
  user: PublicUser | null;
  /** `restoring` while we check a stored token on boot. */
  status: "restoring" | "signedOut" | "signedIn";
  error: string | null;
  busy: boolean;
  restore: () => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: readStoredUser(),
  status: localStorage.getItem(TOKEN_KEY) ? "restoring" : "signedOut",
  error: null,
  busy: false,

  async restore() {
    const token = get().token;
    if (!token) {
      set({ status: "signedOut" });
      return;
    }
    try {
      const user = await api.me(token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      set({ user, status: "signedIn" });
    } catch (error) {
      if (error instanceof NetworkError) {
        // Offline launch: trust the stored session and let the game load from IndexedDB.
        set({ status: get().user ? "signedIn" : "signedOut" });
        return;
      }
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      set({ token: null, user: null, status: "signedOut" });
    }
  },

  async register(username, password) {
    await authenticate(set, () => api.register(username, password));
  },

  async login(username, password) {
    await authenticate(set, () => api.login(username, password));
  },

  async logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    await clearCachedSave();
    set({ token: null, user: null, status: "signedOut", error: null });
  },

  clearError() {
    set({ error: null });
  },
}));

type SetState = (partial: Partial<AuthState>) => void;

async function authenticate(
  set: SetState,
  call: () => Promise<{ token: string; user: PublicUser }>,
): Promise<void> {
  set({ busy: true, error: null });
  try {
    const { token, user } = await call();
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user, status: "signedIn", busy: false });
  } catch (error) {
    set({
      busy: false,
      error:
        error instanceof ApiError
          ? error.message
          : error instanceof NetworkError
            ? "Can't reach the island. Check your connection."
            : "Something went wrong",
    });
  }
}
