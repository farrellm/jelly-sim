/**
 * Home (DESIGN.md §10): the bean, its moods, and the M1 care actions.
 *
 * `giveSpace` and `digHoles` arrive in M2 — and digging holes will make the Jelly Bean *angrier*,
 * not calmer (CONCEPT §9).
 */

import { MOODS, MOOD_INFO, moodCallouts } from "@jelly/shared";
import { useEffect } from "react";

import { AngerMeter } from "../components/AngerMeter.js";
import { BeanView } from "../components/BeanView.js";
import { CurrencyBadges } from "../components/CurrencyBadge.js";
import { MoodBar } from "../components/MoodBar.js";
import { ActionButton } from "../components/ActionButton.js";
import { StatusBanner } from "../components/StatusBanner.js";
import { useAutosave } from "../game/useAutosave.js";
import { useTickLoop } from "../game/useTickLoop.js";
import { useAuthStore } from "../store/authStore.js";
import { useGameStore } from "../store/gameStore.js";

export function HomeScreen() {
  const { token, user, logout } = useAuthStore();
  const { state, status, error, offline, notice, saving, lastSavedAt, load, act, dismissNotice, reset } =
    useGameStore();

  useEffect(() => {
    if (!token || !user) return;
    if (useGameStore.getState().status === "idle") {
      void load(token, `${user.username}'s bean`);
    }
  }, [token, user, load]);

  useTickLoop(status === "ready");
  useAutosave(status === "ready" ? token : null);

  if (status === "loading" || status === "idle") {
    return <CenteredMessage>Waking up your Jelly Bean…</CenteredMessage>;
  }

  if (status === "error" || !state) {
    return (
      <CenteredMessage>
        <p className="text-cherry-candy">{error ?? "Couldn't load your save."}</p>
        <button
          type="button"
          onClick={() => token && user && void load(token, `${user.username}'s bean`)}
          className="tap mt-4 rounded-xl bg-bubblegum-500 px-4 py-2 font-semibold text-grape-950"
        >
          Try again
        </button>
      </CenteredMessage>
    );
  }

  const callouts = moodCallouts(state);

  return (
    <main className="pt-safe pb-safe px-safe mx-auto flex min-h-full w-full max-w-md flex-col gap-4">
      <header className="flex items-center justify-between">
        <CurrencyBadges wallet={state.wallet} />
        <button
          type="button"
          onClick={() => {
            void logout();
            reset();
          }}
          className="tap px-2 text-sm text-white/50 underline underline-offset-4"
        >
          Sign out
        </button>
      </header>

      <StatusBanner offline={offline} notice={notice} onDismiss={dismissNotice} />

      <section className="flex flex-col items-center gap-3 rounded-3xl bg-grape-900 p-4 ring-1 ring-white/10">
        <BeanView state={state} />
        {callouts.length > 0 ? (
          <p
            role="status"
            className="rounded-full bg-cherry-candy/15 px-3 py-1 text-center text-sm text-cherry-candy"
          >
            {callouts[0]?.message}
          </p>
        ) : (
          <p className="text-sm text-white/50">Your Jelly Bean is content.</p>
        )}
      </section>

      <section className="space-y-3 rounded-3xl bg-grape-900 p-4 ring-1 ring-white/10">
        {MOODS.map((mood) => (
          <MoodBar key={mood} mood={mood} value={state.bean.moods[mood]} />
        ))}
        <AngerMeter anger={state.bean.anger} />
      </section>

      <section className="flex gap-2">
        <ActionButton
          emoji={MOOD_INFO.hunger.emoji}
          label="Feed"
          hint={MOOD_INFO.hunger.actionLabel}
          onClick={() => act({ type: "feed" })}
        />
        <ActionButton
          emoji={MOOD_INFO.warmth.emoji}
          label="Knit"
          hint={MOOD_INFO.warmth.actionLabel}
          onClick={() => act({ type: "knitBlanket" })}
        />
        <ActionButton
          emoji={MOOD_INFO.energy.emoji}
          label="Sleep"
          hint={MOOD_INFO.energy.actionLabel}
          onClick={() => act({ type: "sleep" })}
        />
      </section>

      {/* The sim dirties state every tick, so "saved" means "the last autosave landed". */}
      <footer className="mt-auto pt-2 text-center text-xs text-white/35">
        {saving ? "Saving…" : lastSavedAt ? `Saved ${timeAgo(lastSavedAt)}` : "Not saved yet"}
      </footer>
    </main>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="pt-safe pb-safe px-safe flex min-h-full flex-col items-center justify-center text-center text-white/70">
      {children}
    </main>
  );
}

function timeAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  return `${Math.floor(seconds / 60)} min ago`;
}
