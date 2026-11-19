import {
  CURRENT_SCHEMA_VERSION,
  INITIAL_STARTER_CONFIG,
  NEED_MAX,
  NEED_MIN,
  stageForLevel,
} from '../sim/constants';
import { createInitialState, sanitizeLabel } from '../sim/engine';
import { clamp, getNeedFloor } from '../sim/needs';
import { normalizeSeed } from '../sim/rng';
import type {
  GameMode,
  GameState,
  JellyBeanEntity,
  SaveSlotId,
  SwordItem,
  TileState,
  WeatherType,
} from '../sim/types';

export const STORAGE_KEY_PREFIX = 'jelly-sim:save:v1:';
export const IDB_DATABASE_NAME = 'jelly-sim-db';
export const IDB_STORE_NAME = 'saves';
export const IDB_VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface IndexedDbBackupAdapter {
  get(slotId: SaveSlotId): Promise<string | null>;
  put(slotId: SaveSlotId, serialized: string): Promise<void>;
  delete(slotId: SaveSlotId): Promise<void>;
}

export interface PersistenceOptions {
  storage?: StorageLike | null;
  idb?: IndexedDbBackupAdapter | null;
  nowMs?: number;
}

export interface SaveResult {
  localStorageSaved: boolean;
  backupPromise: Promise<boolean>;
  error?: string;
}

export interface LoadResult {
  state: GameState;
  source: 'localStorage' | 'indexedDB' | 'initial';
  migrated: boolean;
  recoveredFromCorruption: boolean;
}

export interface LifecycleWindowLike {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

export interface LifecycleDocumentLike {
  hidden?: boolean;
  visibilityState?: string;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

export interface AutosaveLifecycleOptions extends PersistenceOptions {
  windowTarget?: LifecycleWindowLike | null;
  documentTarget?: LifecycleDocumentLike | null;
  intervalMs?: number;
  onSave?: (result: SaveResult) => void;
}

export function getStorageKey(slotId: SaveSlotId): string {
  return `${STORAGE_KEY_PREFIX}${slotId}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNonNegativeNumber(value: unknown, fallback: number): number {
  const num = asFiniteNumber(value);
  return num !== null && num >= 0 ? num : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item): item is string => typeof item === 'string');
}

function isWeatherType(value: unknown): value is WeatherType {
  return value === 'sunny' || value === 'cozy_rain' || value === 'chilly_wind';
}

function validateAndNormalizeBean(raw: unknown, floor: number): JellyBeanEntity | null {
  if (!isPlainRecord(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id.trim().length === 0) return null;
  if (typeof raw.name !== 'string') return null;

  const level = asFiniteNumber(raw.level);
  const xp = asFiniteNumber(raw.xp);
  if (level === null || level < 1 || xp === null || xp < 0) return null;

  if (!isPlainRecord(raw.needs)) return null;
  const hunger = asFiniteNumber(raw.needs.hunger);
  const warmth = asFiniteNumber(raw.needs.warmth);
  const sleep = asFiniteNumber(raw.needs.sleep);
  const hygiene = asFiniteNumber(raw.needs.hygiene);
  const mood = asFiniteNumber(raw.needs.mood);

  if (
    hunger === null ||
    warmth === null ||
    sleep === null ||
    hygiene === null ||
    mood === null
  ) {
    return null;
  }

  const safeLevel = Math.floor(level);
  return {
    id: raw.id,
    name: sanitizeLabel(
      raw.name,
      INITIAL_STARTER_CONFIG.defaultBeanName,
      INITIAL_STARTER_CONFIG.maxNameLength,
    ),
    stage: stageForLevel(safeLevel),
    level: safeLevel,
    xp: Math.floor(xp),
    flavorId:
      typeof raw.flavorId === 'string' && raw.flavorId.length > 0
        ? raw.flavorId
        : INITIAL_STARTER_CONFIG.defaultFlavorId,
    needs: {
      hunger: clamp(hunger, floor, NEED_MAX),
      warmth: clamp(warmth, floor, NEED_MAX),
      sleep: clamp(sleep, floor, NEED_MAX),
      hygiene: clamp(hygiene, floor, NEED_MAX),
      mood: clamp(mood, floor, NEED_MAX),
    },
    anger: clamp(asFiniteNumber(raw.anger) ?? 0, NEED_MIN, NEED_MAX),
    isSleeping: Boolean(raw.isSleeping),
    blanketRemainingSec: asNonNegativeNumber(raw.blanketRemainingSec, 0),
    trade: typeof raw.trade === 'string' ? raw.trade : null,
    hobby: typeof raw.hobby === 'string' ? raw.hobby : null,
    hatId: typeof raw.hatId === 'string' ? raw.hatId : null,
    tileId: typeof raw.tileId === 'string' && raw.tileId.length > 0 ? raw.tileId : 'plot_pad_0',
  };
}

function normalizeTiles(
  rawTiles: unknown,
  fallbackTiles: Record<string, TileState>,
): Record<string, TileState> {
  if (!isPlainRecord(rawTiles)) {
    return { ...fallbackTiles };
  }

  const normalized: Record<string, TileState> = {};
  for (const [key, value] of Object.entries(rawTiles)) {
    if (!isPlainRecord(value)) continue;
    const ring = value.ring === 0 || value.ring === 1 || value.ring === 2 || value.ring === 3
      ? value.ring
      : 0;
    const building = typeof value.building === 'string' ? (value.building as TileState['building']) : null;
    const buildingTier = Math.floor(asNonNegativeNumber(value.buildingTier, building ? 1 : 0));

    let crop: TileState['crop'] = null;
    if (isPlainRecord(value.crop) && typeof value.crop.cropId === 'string') {
      crop = {
        cropId: value.crop.cropId,
        plantedAtMs: asNonNegativeNumber(value.crop.plantedAtMs, 0),
        growthSeconds: asNonNegativeNumber(value.crop.growthSeconds, 0),
        watered: Boolean(value.crop.watered),
      };
    }

    normalized[key] = {
      id: typeof value.id === 'string' ? value.id : key,
      ring,
      building,
      buildingTier,
      crop,
    };
  }

  return Object.keys(normalized).length > 0 ? normalized : { ...fallbackTiles };
}

function normalizeSwords(rawSwords: unknown): SwordItem[] {
  if (!Array.isArray(rawSwords)) return [];
  const swords: SwordItem[] = [];
  for (const item of rawSwords) {
    if (!isPlainRecord(item)) continue;
    if (typeof item.id !== 'string' || typeof item.tier !== 'string') continue;
    const attackBonus = asFiniteNumber(item.attackBonus);
    if (attackBonus === null) continue;
    swords.push({
      id: item.id,
      tier: item.tier,
      attackBonus,
      craftedAtMs: asNonNegativeNumber(item.craftedAtMs, 0),
    });
  }
  return swords;
}

export interface MigrationResult {
  state: GameState;
  migrated: boolean;
}

/**
 * Validates and migrates a parsed JSON object to `CURRENT_SCHEMA_VERSION`.
 * Returns `null` if the payload is corrupted or from an unsupported future schema.
 */
export function migrateState(
  raw: unknown,
  slotId: SaveSlotId = 'regular',
  nowMs: number = Date.now(),
): MigrationResult | null {
  if (!isPlainRecord(raw)) return null;

  const rawVersion = asFiniteNumber(raw.schemaVersion);
  if (
    rawVersion === null ||
    !Number.isInteger(rawVersion) ||
    rawVersion < 0 ||
    rawVersion > CURRENT_SCHEMA_VERSION
  ) {
    return null;
  }

  const migrated = rawVersion < CURRENT_SCHEMA_VERSION;
  const resolvedSlot: SaveSlotId =
    raw.slotId === 'baby' || raw.slotId === 'regular' ? raw.slotId : slotId;
  const resolvedMode: GameMode =
    raw.mode === 'baby' || raw.mode === 'regular' ? raw.mode : resolvedSlot;

  const defaults = createInitialState({
    slotId: resolvedSlot,
    mode: resolvedMode,
    nowMs,
  });

  if (!Array.isArray(raw.beans) || raw.beans.length === 0) {
    return null;
  }

  const floor = getNeedFloor(resolvedMode);
  const beans: JellyBeanEntity[] = [];
  for (const rawBean of raw.beans) {
    const valid = validateAndNormalizeBean(rawBean, floor);
    if (!valid) {
      return null;
    }
    beans.push(valid);
  }

  // Require valid currencies object on v1 saves (v0 migration may backfill defaults).
  if (!migrated && !isPlainRecord(raw.currencies)) {
    return null;
  }
  const rawCurrencies = isPlainRecord(raw.currencies) ? raw.currencies : {};
  const jellyCoins = asFiniteNumber(rawCurrencies.jellyCoins);
  const beanBucks = asFiniteNumber(rawCurrencies.beanBucks);
  const bonusBeans = asFiniteNumber(rawCurrencies.bonusBeans);
  if (!migrated && (jellyCoins === null || beanBucks === null || bonusBeans === null)) {
    return null;
  }

  const rawInventory = isPlainRecord(raw.inventory) ? raw.inventory : {};
  const rawIsland = isPlainRecord(raw.island) ? raw.island : {};
  const rawUnlocks = isPlainRecord(raw.unlocks) ? raw.unlocks : {};
  const rawWeather = isPlainRecord(raw.weather) ? raw.weather : {};
  const rawQuests = isPlainRecord(raw.quests) ? raw.quests : {};
  const rawSocial = isPlainRecord(raw.social) ? raw.social : {};
  const rawSettings = isPlainRecord(raw.settings) ? raw.settings : {};

  const unlockedRing =
    rawIsland.unlockedRing === 0 ||
    rawIsland.unlockedRing === 1 ||
    rawIsland.unlockedRing === 2 ||
    rawIsland.unlockedRing === 3
      ? rawIsland.unlockedRing
      : 0;

  const activeBeanId =
    typeof raw.activeBeanId === 'string' && beans.some((b) => b.id === raw.activeBeanId)
      ? raw.activeBeanId
      : beans[0]!.id;

  const flavors = asStringArray(rawUnlocks.flavors, defaults.unlocks.flavors);
  if (flavors.length === 0) {
    flavors.push(INITIAL_STARTER_CONFIG.defaultFlavorId);
  }

  const state: GameState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    slotId: resolvedSlot,
    mode: resolvedMode,
    onboarded: typeof raw.onboarded === 'boolean' ? raw.onboarded : defaults.onboarded,
    parentTitle:
      typeof raw.parentTitle === 'string'
        ? sanitizeLabel(
            raw.parentTitle,
            INITIAL_STARTER_CONFIG.defaultParentTitle,
            INITIAL_STARTER_CONFIG.maxParentTitleLength,
          )
        : defaults.parentTitle,
    createdAtMs: asNonNegativeNumber(raw.createdAtMs, defaults.createdAtMs),
    lastTickMs: asNonNegativeNumber(raw.lastTickMs, defaults.lastTickMs),
    sessionPlaySeconds: asNonNegativeNumber(raw.sessionPlaySeconds, 0),
    rngState: normalizeSeed(asFiniteNumber(raw.rngState) ?? defaults.rngState),
    currencies: {
      jellyCoins: Math.floor(asNonNegativeNumber(jellyCoins, defaults.currencies.jellyCoins)),
      beanBucks: Math.floor(asNonNegativeNumber(beanBucks, defaults.currencies.beanBucks)),
      bonusBeans: Math.floor(asNonNegativeNumber(bonusBeans, defaults.currencies.bonusBeans)),
    },
    island: {
      unlockedRing,
      vikingPierUnlocked: Boolean(rawIsland.vikingPierUnlocked),
      tiles: normalizeTiles(rawIsland.tiles, defaults.island.tiles),
      dugHoles: asStringArray(rawIsland.dugHoles, []),
    },
    beans,
    activeBeanId,
    inventory: {
      apples: Math.floor(asNonNegativeNumber(rawInventory.apples, defaults.inventory.apples)),
      parsley: Math.floor(asNonNegativeNumber(rawInventory.parsley, 0)),
      tomatoes: Math.floor(asNonNegativeNumber(rawInventory.tomatoes, 0)),
      candyCanes: Math.floor(asNonNegativeNumber(rawInventory.candyCanes, 0)),
      feathers: Math.floor(asNonNegativeNumber(rawInventory.feathers, 0)),
      blankets: Math.floor(asNonNegativeNumber(rawInventory.blankets, 0)),
      swords: normalizeSwords(rawInventory.swords),
    },
    unlocks: {
      kitchenSkills: Boolean(rawUnlocks.kitchenSkills),
      timeZoneDial: Boolean(rawUnlocks.timeZoneDial),
      vikingPack: Boolean(rawUnlocks.vikingPack),
      flavors,
      trophies: asStringArray(rawUnlocks.trophies, []),
    },
    weather: {
      current: isWeatherType(rawWeather.current) ? rawWeather.current : defaults.weather.current,
      nextChangeMs: asNonNegativeNumber(rawWeather.nextChangeMs, defaults.weather.nextChangeMs),
    },
    quests: {
      completedIds: asStringArray(rawQuests.completedIds, []),
      activeQuestId:
        typeof rawQuests.activeQuestId === 'string' || rawQuests.activeQuestId === null
          ? rawQuests.activeQuestId
          : defaults.quests.activeQuestId,
      drBubblegumAtDoor:
        typeof rawQuests.drBubblegumAtDoor === 'boolean'
          ? rawQuests.drBubblegumAtDoor
          : defaults.quests.drBubblegumAtDoor,
    },
    social: {
      friendsGiftedCount: Math.floor(asNonNegativeNumber(rawSocial.friendsGiftedCount, 0)),
      redeemedGiftNonces: asStringArray(rawSocial.redeemedGiftNonces, []),
    },
    settings: {
      soundEnabled:
        typeof rawSettings.soundEnabled === 'boolean'
          ? rawSettings.soundEnabled
          : defaults.settings.soundEnabled,
      soothingSoundsMode:
        typeof rawSettings.soothingSoundsMode === 'boolean'
          ? rawSettings.soothingSoundsMode
          : defaults.settings.soothingSoundsMode,
      screenTimeReminder:
        typeof rawSettings.screenTimeReminder === 'boolean'
          ? rawSettings.screenTimeReminder
          : defaults.settings.screenTimeReminder,
      lowPowerMode:
        typeof rawSettings.lowPowerMode === 'boolean'
          ? rawSettings.lowPowerMode
          : defaults.settings.lowPowerMode,
    },
  };

  return { state, migrated };
}

export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeState(
  rawJson: string,
  slotId: SaveSlotId = 'regular',
  nowMs: number = Date.now(),
): MigrationResult | null {
  try {
    const parsed: unknown = JSON.parse(rawJson);
    return migrateState(parsed, slotId, nowMs);
  } catch {
    return null;
  }
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // Accessing localStorage can throw in restricted browser sandboxes / private mode.
  }
  return null;
}

export function createBrowserIndexedDbAdapter(): IndexedDbBackupAdapter | null {
  if (typeof globalThis === 'undefined' || !('indexedDB' in globalThis) || !globalThis.indexedDB) {
    return null;
  }

  const idbFactory = globalThis.indexedDB;

  const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      try {
        const request = idbFactory.open(IDB_DATABASE_NAME, IDB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
            db.createObjectStore(IDB_STORE_NAME);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
      } catch (err) {
        reject(err);
      }
    });

  return {
    async get(slotId: SaveSlotId): Promise<string | null> {
      const db = await openDb();
      try {
        return await new Promise<string | null>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE_NAME, 'readonly');
          const store = tx.objectStore(IDB_STORE_NAME);
          const req = store.get(slotId);
          req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
          req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
        });
      } finally {
        db.close();
      }
    },

    async put(slotId: SaveSlotId, serialized: string): Promise<void> {
      const db = await openDb();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
          const store = tx.objectStore(IDB_STORE_NAME);
          store.put(serialized, slotId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
          tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
        });
      } finally {
        db.close();
      }
    },

    async delete(slotId: SaveSlotId): Promise<void> {
      const db = await openDb();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
          const store = tx.objectStore(IDB_STORE_NAME);
          store.delete(slotId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
          tx.onabort = () => reject(tx.error ?? new Error('IndexedDB delete aborted'));
        });
      } finally {
        db.close();
      }
    },
  };
}

function resolveStorage(options?: PersistenceOptions): StorageLike | null {
  if (options && 'storage' in options) {
    return options.storage ?? null;
  }
  return getDefaultStorage();
}

function resolveIdb(options?: PersistenceOptions): IndexedDbBackupAdapter | null {
  if (options && 'idb' in options) {
    return options.idb ?? null;
  }
  return createBrowserIndexedDbAdapter();
}

/**
 * Persists GameState synchronously to `localStorage` (safe on iOS Safari `pagehide`)
 * and mirrors a best-effort async backup to `IndexedDB`.
 */
export function saveState(state: GameState, options?: PersistenceOptions): SaveResult {
  const storage = resolveStorage(options);
  const idb = resolveIdb(options);
  const serialized = serializeState(state);

  let localStorageSaved = false;
  let error: string | undefined;

  if (storage) {
    try {
      storage.setItem(getStorageKey(state.slotId), serialized);
      localStorageSaved = true;
    } catch (err) {
      error = err instanceof Error ? err.message : 'localStorage write failed';
    }
  }

  const backupPromise = idb
    ? idb
        .put(state.slotId, serialized)
        .then(() => true)
        .catch(() => false)
    : Promise.resolve(false);

  return { localStorageSaved, backupPromise, error };
}

/**
 * Synchronously loads GameState from `localStorage`, migrating older schemas
 * and gracefully falling back to a fresh initial state if data is missing or corrupted.
 */
export function loadState(
  slotId: SaveSlotId = 'regular',
  options?: PersistenceOptions,
): LoadResult {
  const nowMs = options?.nowMs ?? Date.now();
  const storage = resolveStorage(options);

  if (storage) {
    let rawJson: string | null = null;
    try {
      rawJson = storage.getItem(getStorageKey(slotId));
    } catch {
      rawJson = null;
    }

    if (rawJson !== null) {
      const deserialized = deserializeState(rawJson, slotId, nowMs);
      if (deserialized) {
        if (deserialized.migrated) {
          try {
            storage.setItem(getStorageKey(slotId), serializeState(deserialized.state));
          } catch {
            // Ignore write-back error during read migration.
          }
        }
        return {
          state: deserialized.state,
          source: 'localStorage',
          migrated: deserialized.migrated,
          recoveredFromCorruption: false,
        };
      }

      return {
        state: createInitialState({ slotId, nowMs }),
        source: 'initial',
        migrated: false,
        recoveredFromCorruption: true,
      };
    }
  }

  return {
    state: createInitialState({ slotId, nowMs }),
    source: 'initial',
    migrated: false,
    recoveredFromCorruption: false,
  };
}

/**
 * Loads GameState from `localStorage`, falling back to the `IndexedDB` backup
 * if `localStorage` is empty or corrupted, and finally to a clean starter island.
 */
export async function loadStateWithBackup(
  slotId: SaveSlotId = 'regular',
  options?: PersistenceOptions,
): Promise<LoadResult> {
  const primary = loadState(slotId, options);
  if (primary.source === 'localStorage') {
    return primary;
  }

  const idb = resolveIdb(options);
  const storage = resolveStorage(options);
  const nowMs = options?.nowMs ?? Date.now();

  if (idb) {
    try {
      const backupJson = await idb.get(slotId);
      if (backupJson !== null) {
        const deserialized = deserializeState(backupJson, slotId, nowMs);
        if (deserialized) {
          // Heal localStorage from the healthy IndexedDB backup.
          if (storage) {
            try {
              storage.setItem(getStorageKey(slotId), serializeState(deserialized.state));
            } catch {
              // Ignore storage errors during backup recovery.
            }
          }
          return {
            state: deserialized.state,
            source: 'indexedDB',
            migrated: deserialized.migrated,
            recoveredFromCorruption: primary.recoveredFromCorruption,
          };
        }
      }
    } catch {
      // Fall through to clean initial state.
    }
  }

  return primary;
}

/**
 * Clears saved state for a slot from both `localStorage` and `IndexedDB`.
 */
export async function clearState(
  slotId: SaveSlotId = 'regular',
  options?: PersistenceOptions,
): Promise<void> {
  const storage = resolveStorage(options);
  const idb = resolveIdb(options);

  if (storage) {
    try {
      storage.removeItem(getStorageKey(slotId));
    } catch {
      // Ignore storage errors on clear.
    }
  }

  if (idb) {
    try {
      await idb.delete(slotId);
    } catch {
      // Ignore IDB errors on clear.
    }
  }
}

/**
 * Hooks iOS Safari-safe autosave listeners (`pagehide` and `visibilitychange` -> hidden)
 * plus optional periodic autosave, returning a cleanup function.
 */
export function attachAutosaveLifecycle(
  getState: () => GameState,
  options?: AutosaveLifecycleOptions,
): () => void {
  const win: LifecycleWindowLike | null =
    options && 'windowTarget' in options
      ? (options.windowTarget ?? null)
      : typeof window !== 'undefined'
        ? window
        : null;

  const doc: LifecycleDocumentLike | null =
    options && 'documentTarget' in options
      ? (options.documentTarget ?? null)
      : typeof document !== 'undefined'
        ? document
        : null;

  const performSave = () => {
    const result = saveState(getState(), options);
    options?.onSave?.(result);
  };

  const handlePageHide: EventListener = () => {
    performSave();
  };

  const handleVisibilityChange: EventListener = () => {
    if (!doc) return;
    if (doc.visibilityState === 'hidden' || doc.hidden === true) {
      performSave();
    }
  };

  win?.addEventListener('pagehide', handlePageHide);
  doc?.addEventListener('visibilitychange', handleVisibilityChange);

  let intervalId: ReturnType<typeof setInterval> | null = null;
  const intervalMs = options?.intervalMs ?? 0;
  if (intervalMs > 0) {
    intervalId = setInterval(performSave, intervalMs);
  }

  return () => {
    win?.removeEventListener('pagehide', handlePageHide);
    doc?.removeEventListener('visibilitychange', handleVisibilityChange);
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}
