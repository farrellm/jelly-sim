import type {
  BuildingId,
  CropId,
  DungeonId,
  FlavorId,
  GameId,
  HobbyId,
  ItemId,
  NodeKind,
  QuestId,
  SkillId,
  Stage,
  TradeId,
  Weather,
} from './content.js';

/** The four-word xoshiro128** state, carried in the save and advanced by use (§4.2). */
export type RngState = [number, number, number, number];

export interface BeanState {
  name: string;
  flavor: FlavorId;
  stage: Stage;
  stageEnteredMs: number;
  /** Days meeting the care bar; gates stage advancement alongside level (§5.6). */
  careDays: number;
  /** All four are 0–100 and 100 is good. Mood is derived, not decayed (§5.1). */
  needs: { hunger: number; warmth: number; rest: number; mood: number };
  /**
   * The hidden mood ceiling driver (§5.1). Digging is free, instant, and unlimited; each
   * hole permanently costs 1.5 of the mood ceiling. Nothing in the UI ever links the two,
   * and that is deliberate — see CLAUDE.md before "fixing" it.
   */
  holes: number;
  trade: TradeId | null;
  hobby: HobbyId | null;
  hp: number;
}

export interface PlayerState {
  simVersion: number;
  rng: RngState;
  mode: 'regular' | 'baby';
  /** Last simulated instant, on the server clock. */
  worldMs: number;

  bean: BeanState;

  progress: {
    level: number;
    xp: number;
    skills: SkillId[];
    flavorsUnlocked: FlavorId[];
    enrolledUntilMs: number | null;
  };

  wallet: { jellyCoins: number; beanBucks: number; bonusBeans: number };

  island: {
    tiles: { x: number; y: number; building: BuildingId; builtMs: number }[];
    plots: { crop: CropId | null; plantedMs: number; ready: boolean }[];
    nodes: { id: string; kind: NodeKind; readyAtMs: number }[];
    weather: Weather;
    unlockedParcels: number;
  };

  inventory: Partial<Record<ItemId, number>>;
  /** Food units the kitchen skill draws from; drains 1 per 4 h once stocked (§5.5). */
  pantry: number;

  quests: { id: QuestId; state: 'offered' | 'active' | 'done'; progress: number }[];
  adventure: { dungeon: DungeonId; room: number; seed: number; hp: number } | null;
  energy: { value: number; lastRegenMs: number };

  daily: { dayKey: string; minigamePlays: Partial<Record<GameId, number>>; giftsSent: number };
  counters: { holesDugTotal: number; spacesGiven: number; harvests: number };
}
