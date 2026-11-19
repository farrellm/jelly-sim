import { FIXED_TICK_DT } from './constants';
import { applyOfflineCatchUp, dispatch as reduceState, tick as tickState } from './engine';
import type {
  DispatchResult,
  GameState,
  OfflineCatchUpSummary,
  SaveSlotId,
  SimAction,
  SimEvent,
} from './types';
import {
  attachAutosaveLifecycle,
  loadState,
  loadStateWithBackup,
  saveState,
  type AutosaveLifecycleOptions,
  type PersistenceOptions,
} from '../storage/persistence';

export type StoreListener = () => void;
export type EventListenerFn = (events: readonly SimEvent[], state: GameState) => void;

export interface GameStoreOptions {
  slotId?: SaveSlotId;
  persistence?: PersistenceOptions;
  now?: () => number;
  initialState?: GameState;
}

const MAX_FIXED_STEPS_PER_FRAME = 10;
const OFFLINE_GAP_THRESHOLD_SEC = 5;
const WELCOME_BACK_MIN_SEC = 30;

/**
 * Lightweight pub/sub bridge wrapping the pure-TS simulation engine with
 * fixed-timestep 10 Hz ticking, offline catch-up, and iOS-safe persistence.
 */
export class GameStore {
  private readonly slotId: SaveSlotId;
  private readonly persistence?: PersistenceOptions;
  private readonly now: () => number;

  private state: GameState;
  private lastOfflineSummary: OfflineCatchUpSummary | null = null;
  private accumulatorSec = 0;

  private readonly listeners = new Set<StoreListener>();
  private readonly eventListeners = new Set<EventListenerFn>();

  constructor(options: GameStoreOptions = {}) {
    this.slotId = options.slotId ?? 'regular';
    this.persistence = options.persistence;
    this.now = options.now ?? (() => Date.now());

    const currentNow = this.now();
    if (options.initialState) {
      this.state = options.initialState;
    } else {
      const loaded = loadState(this.slotId, {
        ...this.persistence,
        nowMs: currentNow,
      });

      if (loaded.source !== 'initial' && loaded.state.onboarded) {
        const caughtUp = applyOfflineCatchUp(loaded.state, currentNow);
        this.state = caughtUp.state;
        if (caughtUp.summary.cappedSeconds >= WELCOME_BACK_MIN_SEC) {
          this.lastOfflineSummary = caughtUp.summary;
        }
        saveState(this.state, this.persistence);
      } else {
        this.state = loaded.state;
      }
    }
  }

  getState = (): GameState => {
    return this.state;
  };

  getLastOfflineSummary = (): OfflineCatchUpSummary | null => {
    return this.lastOfflineSummary;
  };

  subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  subscribeEvents = (listener: EventListenerFn): (() => void) => {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  };

  /**
   * Attempts async recovery from IndexedDB backup when localStorage started fresh.
   */
  async hydrateFromBackup(): Promise<boolean> {
    if (this.state.onboarded) {
      return false;
    }

    const currentNow = this.now();
    const loaded = await loadStateWithBackup(this.slotId, {
      ...this.persistence,
      nowMs: currentNow,
    });

    if (loaded.source !== 'indexedDB') {
      return false;
    }

    if (loaded.state.onboarded) {
      const caughtUp = applyOfflineCatchUp(loaded.state, currentNow);
      this.state = caughtUp.state;
      if (caughtUp.summary.cappedSeconds >= WELCOME_BACK_MIN_SEC) {
        this.lastOfflineSummary = caughtUp.summary;
      }
      saveState(this.state, this.persistence);
    } else {
      this.state = loaded.state;
    }

    this.notifyListeners();
    return true;
  }

  dispatch = (action: SimAction): DispatchResult => {
    const result = reduceState(this.state, action, this.now());
    const stateChanged = result.state !== this.state;
    this.state = result.state;

    if (stateChanged) {
      saveState(this.state, this.persistence);
      this.notifyListeners();
    }

    if (result.events.length > 0) {
      for (const listener of this.eventListeners) {
        listener(result.events, this.state);
      }
    }

    return result;
  };

  /**
   * Advances active play simulation using a fixed 10 Hz (`FIXED_TICK_DT`) step.
   * Needs stay paused until onboarding completes.
   */
  step = (dtSeconds: number): void => {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
      return;
    }

    if (!this.state.onboarded) {
      return;
    }

    if (dtSeconds >= OFFLINE_GAP_THRESHOLD_SEC) {
      this.resumeFromBackground(this.now());
      return;
    }

    this.accumulatorSec += dtSeconds;
    let steps = 0;
    let nextState = this.state;
    const currentNow = this.now();

    while (this.accumulatorSec >= FIXED_TICK_DT && steps < MAX_FIXED_STEPS_PER_FRAME) {
      this.accumulatorSec -= FIXED_TICK_DT;
      nextState = tickState(nextState, FIXED_TICK_DT, currentNow);
      steps += 1;
    }

    if (steps > 0 && nextState !== this.state) {
      this.state = nextState;
      this.notifyListeners();
    }
  };

  resumeFromBackground = (nowMs: number = this.now()): OfflineCatchUpSummary | null => {
    if (!this.state.onboarded) {
      return null;
    }

    const result = applyOfflineCatchUp(this.state, nowMs);
    this.accumulatorSec = 0;
    this.state = result.state;

    if (result.summary.cappedSeconds >= WELCOME_BACK_MIN_SEC) {
      this.lastOfflineSummary = result.summary;
    }

    saveState(this.state, this.persistence);
    this.notifyListeners();
    return result.summary;
  };

  dismissOfflineSummary = (): void => {
    if (this.lastOfflineSummary === null) return;
    this.lastOfflineSummary = null;
    this.notifyListeners();
  };

  /**
   * Hooks iOS-safe autosave (`pagehide`, `visibilitychange` -> hidden, periodic interval)
   * and offline catch-up when returning to a foreground tab.
   */
  attachLifecycle(options?: Omit<AutosaveLifecycleOptions, 'storage' | 'idb'>): () => void {
    const detachAutosave = attachAutosaveLifecycle(() => this.state, {
      ...this.persistence,
      intervalMs: options?.intervalMs ?? 15000,
      windowTarget: options?.windowTarget,
      documentTarget: options?.documentTarget,
      onSave: options?.onSave,
    });

    const doc =
      options && 'documentTarget' in options
        ? (options.documentTarget ?? null)
        : typeof document !== 'undefined'
          ? document
          : null;

    const handleVisibilityResume: EventListener = () => {
      if (!doc) return;
      if (doc.visibilityState === 'visible' || doc.hidden === false) {
        this.resumeFromBackground(this.now());
      }
    };

    doc?.addEventListener('visibilitychange', handleVisibilityResume);

    return () => {
      detachAutosave();
      doc?.removeEventListener('visibilitychange', handleVisibilityResume);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
