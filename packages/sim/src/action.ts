import type {
  BuildingId,
  CropId,
  DungeonId,
  GameId,
  HobbyId,
  ItemId,
  QuestId,
  RecipeId,
  SkillId,
  TradeId,
} from './content.js';
import type { SimEvent } from './events.js';
import type { PlayerState } from './state.js';

/**
 * What a player can ask for (§4.4).
 *
 * The client never sends state — it sends intents, and the server decides what they mean.
 * That is the whole of the anti-cheat posture (§9.4) and the reason optimistic prediction
 * is safe: a client that guesses wrong is corrected, not trusted.
 *
 * The union is declared whole so the shape is reviewable in one place. `PHASE_1_ACTIONS`
 * below is what `apply` actually accepts today; anything else is refused as NOT_UNLOCKED
 * rather than silently ignored.
 */
export type Action =
  | { t: 'feed'; item: ItemId }
  | { t: 'warm'; item: ItemId }
  | { t: 'sleep' }
  | { t: 'giveSpace' }
  | { t: 'digHole' }
  | { t: 'fillHole' }
  | { t: 'plant'; plot: number; crop: CropId }
  | { t: 'harvest'; plot: number }
  | { t: 'gather'; node: string }
  | { t: 'craft'; recipe: RecipeId }
  | { t: 'build'; building: BuildingId; x: number; y: number }
  | { t: 'unlockSkill'; skill: SkillId }
  | { t: 'enroll' }
  | { t: 'graduate'; trade: TradeId; hobby: HobbyId }
  | { t: 'minigameResult'; game: GameId; score: number; durationMs: number }
  | { t: 'adventureStart'; dungeon: DungeonId }
  | { t: 'adventureTurn'; choice: 'attack' | 'item' | 'flee'; item?: ItemId }
  | { t: 'questAccept'; quest: QuestId }
  | { t: 'questClaim'; quest: QuestId }
  | { t: 'giftCoins'; toPlayer: string; amount: number }
  | { t: 'claimBonusBean' };

export type ActionType = Action['t'];

/** The care loop. Everything else lands with its own phase. */
export const PHASE_1_ACTIONS = [
  'feed',
  'warm',
  'sleep',
  'giveSpace',
  'digHole',
  'fillHole',
] as const satisfies readonly ActionType[];

/**
 * Why an intent was refused (§4.4).
 *
 * Typed so the UI can say something specific, and so the client can tell "you cannot
 * afford this" apart from "your prediction was wrong" — the two have very different
 * recoveries.
 */
export const REJECT_CODES = [
  'INSUFFICIENT_FUNDS',
  'NOT_UNLOCKED',
  'WRONG_STAGE',
  'TILE_OCCUPIED',
  'RATE_LIMITED',
  'NOT_READY',
] as const;

export type RejectCode = (typeof REJECT_CODES)[number];

export type ApplyResult =
  | { ok: true; state: PlayerState; events: SimEvent[] }
  | { ok: false; code: RejectCode; message: string };
