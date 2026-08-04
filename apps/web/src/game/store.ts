import type { ActionsResponse, StateResponse } from '@jelly/shared';
import {
  advance,
  apply,
  project,
  type Action,
  type PlayerState,
  type PHASE_1_ACTIONS,
  type ProjectedView,
  type RejectCode,
  type SimEvent,
} from '@jelly/sim';
import { create } from 'zustand';
import { ApiRequestError, api } from '../api/client.js';

/**
 * What this client can ask for. The sim models the whole §4.4 union; the care loop is the
 * part that exists, and narrowing here means a screen cannot dispatch a Phase 4 intent that
 * the wire schema would then reject as malformed.
 */
export type CareAction = Extract<Action, { t: (typeof PHASE_1_ACTIONS)[number] }>;

/** Costly enough that the player should learn immediately whether it worked. */
const IMMEDIATE: readonly CareAction['t'][] = ['giveSpace', 'fillHole'];

/** §10.3. Long enough to coalesce a flurry of taps, short enough to feel instant. */
const FLUSH_DEBOUNCE_MS = 400;

export interface Rejection {
  code: RejectCode;
  message: string;
  atMs: number;
}

interface GameStore {
  state: PlayerState | null;
  view: ProjectedView | null;
  stateVersion: number;
  /** Server clock minus client clock, so the local ticker runs on the server's time. */
  clockSkewMs: number;

  /** Intents applied locally and not yet acknowledged. Replayed after a 409. */
  outbox: CareAction[];
  syncing: boolean;
  offline: boolean;
  /** The last refusal, for the UI to say something specific about. */
  rejection: Rejection | null;
  /** Bark events not yet played. The audio layer drains this. */
  pendingEvents: SimEvent[];

  adopt: (response: StateResponse | ActionsResponse) => void;
  dispatch: (action: CareAction) => void;
  tick: () => void;
  refetch: () => Promise<void>;
  dismissRejection: () => void;
  drainEvents: () => SimEvent[];
  reset: () => void;
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * The client's copy of the game (§10.3).
 *
 * Two rules govern everything here and they are worth stating plainly:
 *
 * **The client never merges.** A server response replaces the local state wholesale,
 * always, unconditionally. There is no reconciliation path and no "client wins" path,
 * because both sides run the same `@jelly/sim` and the server is the one that counts.
 *
 * **The client predicts anyway.** A tap runs `apply()` locally so the meter moves under
 * the thumb, and the intent goes in an outbox to be confirmed. When the prediction was
 * right — which is nearly always, since it is the same code — the replacement is invisible.
 * When it was wrong, the correction arrives within 400 ms and looks like a meter snapping a
 * percent or two.
 */
export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  view: null,
  stateVersion: 0,
  clockSkewMs: 0,
  outbox: [],
  syncing: false,
  offline: false,
  rejection: null,
  pendingEvents: [],

  /** Take the server's word for it. Every field, every time. */
  adopt: (response) => {
    const state = response.state as PlayerState;
    const events = response.events as unknown as SimEvent[];

    set({
      state,
      stateVersion: response.stateVersion,
      clockSkewMs: response.serverTime - Date.now(),
      view: project(state, response.serverTime),
      offline: false,
      pendingEvents: [...get().pendingEvents, ...events],
    });
  },

  dispatch: (action) => {
    const { state, outbox, clockSkewMs } = get();
    if (!state) return;

    const nowMs = Date.now() + clockSkewMs;
    const result = apply(state, action, nowMs);

    if (!result.ok) {
      // The local rules already know this will be refused, so say so now rather than
      // spending a round trip to be told the same thing. The server still decides; this
      // just means the player is not left waiting to find out they cannot afford it.
      set({ rejection: { code: result.code, message: result.message, atMs: nowMs } });
      return;
    }

    set({
      state: result.state,
      view: project(result.state, nowMs),
      outbox: [...outbox, action],
      rejection: null,
      pendingEvents: [...get().pendingEvents, ...result.events],
    });

    scheduleFlush(IMMEDIATE.includes(action.t));
  },

  /**
   * One second of local simulation, so the meters drift instead of stepping on refetch.
   * The ticker that calls this stops entirely when the tab is hidden (ticker.ts).
   */
  tick: () => {
    const { state, clockSkewMs, pendingEvents } = get();
    if (!state) return;

    const nowMs = Date.now() + clockSkewMs;
    const { state: next, events } = advance(state, nowMs);

    set({
      state: next,
      view: project(next, nowMs),
      ...(events.length > 0 ? { pendingEvents: [...pendingEvents, ...events] } : {}),
    });
  },

  refetch: async () => {
    try {
      get().adopt(await api.state());
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'UNAUTHENTICATED') throw err;
      set({ offline: true });
    }
  },

  dismissRejection: () => set({ rejection: null }),

  drainEvents: () => {
    const events = get().pendingEvents;
    if (events.length > 0) set({ pendingEvents: [] });
    return events;
  },

  reset: () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    set({
      state: null,
      view: null,
      stateVersion: 0,
      outbox: [],
      syncing: false,
      offline: false,
      rejection: null,
      pendingEvents: [],
    });
  },
}));

function scheduleFlush(immediate: boolean): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), immediate ? 0 : FLUSH_DEBOUNCE_MS);
}

/**
 * Send the outbox.
 *
 * The batch is captured before the request and cleared only on a definite answer, so taps
 * made while it is in flight survive into the next flush rather than racing this one.
 */
async function flush(): Promise<void> {
  const store = useGameStore.getState();
  if (store.syncing || store.outbox.length === 0 || !store.state) return;

  const batch = store.outbox;
  useGameStore.setState({ syncing: true, outbox: [] });

  try {
    const response = await api.actions({
      stateVersion: store.stateVersion,
      slot: 0,
      actions: batch,
    });
    useGameStore.getState().adopt(response);

    // Per-action refusals ride back in `results`. Surface the first one; the rest of the
    // batch still happened, which is the whole point of applying best-effort.
    const refused = response.results.find((r) => !r.ok);
    if (refused && !refused.ok) {
      useGameStore.setState({
        rejection: { code: refused.code, message: refused.message, atMs: Date.now() },
      });
    }
  } catch (err) {
    if (err instanceof ApiRequestError && err.code === 'STATE_CONFLICT') {
      // Another device got there first. Take the server's state and replay the intents it
      // has not seen — the player's taps are not theirs to throw away.
      await useGameStore.getState().refetch();
      useGameStore.setState((s) => ({ outbox: [...batch, ...s.outbox] }));
      scheduleFlush(true);
      return;
    }

    // Offline, or the server is unwell. Keep the intents; they flush on reconnect (§10.5).
    useGameStore.setState((s) => ({ outbox: [...batch, ...s.outbox], offline: true }));
  } finally {
    useGameStore.setState({ syncing: false });
  }
}

/** Exported for the reconnect path and for tests that need a deterministic flush. */
export const flushOutbox = flush;
