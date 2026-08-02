import type { BarkId, NeedId, Stage } from './content.js';

/**
 * What the simulation has to say about a span of time.
 *
 * Events are the channel between `advance`/`apply` and everything outside the sim: the
 * bark bubble and its audio (§10.6), and later the push worker (§12). They are derived and
 * never persisted — a save records the world, not the commentary.
 *
 * Phase 1 emits `bark` and `woke`. The rest are declared here because their emit sites are
 * a phase or two out and the union is easier to reason about whole.
 */
export type SimEvent =
  | { t: 'bark'; id: BarkId; need: NeedId; text: string; atMs: number }
  | { t: 'woke'; atMs: number }
  | { t: 'stage_up'; stage: Stage; atMs: number }
  | { t: 'level_up'; level: number; atMs: number }
  | { t: 'crop_ready'; plot: number; atMs: number };
