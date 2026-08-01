/**
 * Login / Register (DESIGN.md §10). Validation mirrors the server's shared zod rules so the
 * player sees the problem before a round trip.
 */

import { registerSchema } from "@jelly/shared";
import { useState, type FormEvent } from "react";

import { useAuthStore } from "../store/authStore.js";

export function LoginScreen() {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const { login, register, busy, error, clearError } = useAuthStore();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    clearError();

    if (mode === "register") {
      const parsed = registerSchema.safeParse({ username, password });
      if (!parsed.success) {
        setLocalError(parsed.error.issues[0]?.message ?? "Check your details");
        return;
      }
    }

    void (mode === "register" ? register(username, password) : login(username, password));
  }

  const shown = localError ?? error;

  return (
    <main className="pt-safe pb-safe px-safe mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-8">
      <header className="text-center">
        <img src="/favicon.svg" alt="" className="mx-auto mb-4 h-24 w-24" />
        <h1 className="text-3xl font-bold">Jelly Bean Simulator</h1>
        <p className="mt-2 text-sm text-white/60">
          The only game that truly, realistically simulates what it's like to be a Jelly Bean.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm text-white/70">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            className="tap mt-1 w-full rounded-xl bg-grape-800 px-4 py-3 text-base ring-1 ring-white/10 outline-none focus:ring-bubblegum-500"
          />
        </label>

        <label className="block">
          <span className="text-sm text-white/70">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            className="tap mt-1 w-full rounded-xl bg-grape-800 px-4 py-3 text-base ring-1 ring-white/10 outline-none focus:ring-bubblegum-500"
          />
        </label>

        {shown ? (
          <p role="alert" className="rounded-xl bg-cherry-candy/15 px-3 py-2 text-sm text-cherry-candy">
            {shown}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="tap w-full rounded-xl bg-bubblegum-500 px-4 py-3 text-base font-semibold text-grape-950 transition active:scale-[.98] disabled:opacity-50"
        >
          {busy ? "One moment…" : mode === "register" ? "Adopt a Jelly Bean" : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "register" ? "login" : "register");
          setLocalError(null);
          clearError();
        }}
        className="tap text-sm text-white/60 underline underline-offset-4"
      >
        {mode === "register" ? "I already have a Jelly Bean" : "I'm new here"}
      </button>
    </main>
  );
}
