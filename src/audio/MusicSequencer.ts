export type MusicMood = 'cozy' | 'sleepy' | 'cozy_rain' | 'candy_castle' | 'viking';

export interface MusicSequencerOptions {
  mood?: MusicMood;
  lookaheadMs?: number;
  scheduleAheadSec?: number;
  setIntervalFn?: (cb: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

interface MoodPattern {
  readonly bpm: number;
  readonly filterHz: number;
  readonly overtoneGain: number;
  readonly noteDecaySec: number;
  readonly volumeScale: number;
  /** MIDI note numbers (or null for rest) for a 32-step 8th-note melody loop. */
  readonly melody: readonly (number | null)[];
  /** Warm root/bass marimba MIDI note numbers for the same 32-step loop. */
  readonly bass: readonly (number | null)[];
}

/**
 * Converts a MIDI note number (A4 = 69 -> 440 Hz) to frequency in Hz.
 */
export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Cozy procedural pentatonic marimba/kalimba patterns (DESIGN.md §5.1).
 * 32 eighth-note steps = 4 bars of 4/4 (C -> Am -> F -> G progression).
 */
export const MUSIC_PATTERNS: Record<MusicMood, MoodPattern> = {
  cozy: {
    bpm: 94,
    filterHz: 2800,
    overtoneGain: 0.14,
    noteDecaySec: 0.42,
    volumeScale: 1.0,
    melody: [
      72, null, 76, 79, 84, null, 79, 76, // Bar 1 (Cmaj pentatonic)
      74, null, 72, 69, 76, null, 72, null, // Bar 2 (Am7)
      69, null, 72, 76, 81, null, 79, 76, // Bar 3 (Fmaj7)
      74, null, 79, 76, 74, null, 72, null, // Bar 4 (G6 -> resolve)
    ],
    bass: [
      48, null, null, null, 55, null, null, null, // C3, G3
      45, null, null, null, 52, null, null, null, // A2, E3
      53, null, null, null, 57, null, null, null, // F3, A3
      55, null, null, null, 50, null, null, null, // G3, D3
    ],
  },
  sleepy: {
    bpm: 66,
    filterHz: 1450,
    overtoneGain: 0.05,
    noteDecaySec: 0.72,
    volumeScale: 0.62,
    melody: [
      76, null, null, 72, 69, null, null, null,
      74, null, null, 72, 67, null, null, null,
      72, null, null, 69, 65, null, null, null,
      69, null, 67, null, 64, null, null, null,
    ],
    bass: [
      48, null, null, null, null, null, null, null,
      45, null, null, null, null, null, null, null,
      41, null, null, null, null, null, null, null,
      43, null, null, null, null, null, null, null,
    ],
  },
  cozy_rain: {
    bpm: 78,
    filterHz: 1750,
    overtoneGain: 0.08,
    noteDecaySec: 0.56,
    volumeScale: 0.8,
    melody: [
      69, null, 72, null, 76, null, 72, 69,
      67, null, 72, null, 74, null, 72, null,
      65, null, 69, null, 72, null, 76, 74,
      72, null, 69, null, 67, null, null, null,
    ],
    bass: [
      45, null, null, null, 52, null, null, null,
      43, null, null, null, 50, null, null, null,
      41, null, null, null, 48, null, null, null,
      43, null, null, null, 47, null, null, null,
    ],
  },
  candy_castle: {
    bpm: 118,
    filterHz: 3400,
    overtoneGain: 0.2,
    noteDecaySec: 0.3,
    volumeScale: 0.95,
    melody: [
      72, 76, 79, null, 84, 79, 76, 79,
      74, 77, 81, null, 79, 77, 74, null,
      76, 79, 84, null, 86, 84, 79, 76,
      79, 74, 76, 79, 84, null, null, null,
    ],
    bass: [
      48, null, 55, null, 48, null, 55, null,
      50, null, 57, null, 55, null, 50, null,
      48, null, 52, null, 55, null, 52, null,
      55, null, 50, null, 48, null, null, null,
    ],
  },
  viking: {
    bpm: 104,
    filterHz: 2200,
    overtoneGain: 0.18,
    noteDecaySec: 0.36,
    volumeScale: 0.92,
    melody: [
      62, null, 69, 69, 65, null, 69, null,
      67, null, 65, 64, 62, null, 57, null,
      62, null, 69, 72, 74, null, 72, 69,
      67, null, 69, 65, 62, null, null, null,
    ],
    bass: [
      38, null, 45, null, 38, null, 45, null,
      43, null, 45, null, 38, null, 45, null,
      38, null, 45, null, 41, null, 45, null,
      43, null, 45, null, 38, null, null, null,
    ],
  },
};

/**
 * Lightweight lookahead Web Audio sequencer playing warm pentatonic marimba/kalimba loops.
 */
export class MusicSequencer {
  private readonly context: AudioContext;
  private readonly destination: AudioNode;
  private readonly lookaheadMs: number;
  private readonly scheduleAheadSec: number;
  private readonly setIntervalFn: (cb: () => void, ms: number) => unknown;
  private readonly clearIntervalFn: (handle: unknown) => void;

  private mood: MusicMood;
  private playing = false;
  private timerHandle: unknown = null;
  private stepIndex = 0;
  private nextStepTime = 0;

  constructor(
    context: AudioContext,
    destination: AudioNode,
    options: MusicSequencerOptions = {},
  ) {
    this.context = context;
    this.destination = destination;
    this.mood = options.mood ?? 'cozy';
    this.lookaheadMs = options.lookaheadMs ?? 100;
    this.scheduleAheadSec = options.scheduleAheadSec ?? 0.25;
    this.setIntervalFn =
      options.setIntervalFn ?? ((cb, ms) => globalThis.setInterval(cb, ms));
    this.clearIntervalFn =
      options.clearIntervalFn ??
      ((handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>));
  }

  getMood(): MusicMood {
    return this.mood;
  }

  setMood(mood: MusicMood): void {
    this.mood = mood;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.nextStepTime = this.context.currentTime + 0.05;
    this.schedulePendingSteps();
    this.timerHandle = this.setIntervalFn(() => {
      this.schedulePendingSteps();
    }, this.lookaheadMs);
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.timerHandle !== null) {
      this.clearIntervalFn(this.timerHandle);
      this.timerHandle = null;
    }
  }

  /**
   * Advances lookahead scheduling up to `context.currentTime + scheduleAheadSec`.
   * Exposed publicly so deterministic tests can step without waiting on timers.
   */
  schedulePendingSteps(): number {
    if (!this.playing) return 0;

    const pattern = MUSIC_PATTERNS[this.mood];
    const stepDurationSec = 60 / pattern.bpm / 2; // eighth note
    const horizon = this.context.currentTime + this.scheduleAheadSec;

    // Prevent catch-up note bursts if the browser paused timers briefly.
    if (this.nextStepTime < this.context.currentTime - 0.1) {
      this.nextStepTime = this.context.currentTime + 0.04;
    }

    let scheduledCount = 0;
    let safetyLimit = 16;

    while (this.nextStepTime < horizon && safetyLimit > 0) {
      safetyLimit -= 1;
      const idx = this.stepIndex % pattern.melody.length;
      const melodyMidi = pattern.melody[idx] ?? null;
      const bassMidi = pattern.bass[idx] ?? null;

      if (melodyMidi !== null) {
        this.playMarimbaNote(
          midiToFrequency(melodyMidi),
          this.nextStepTime,
          pattern.noteDecaySec,
          0.22 * pattern.volumeScale,
          pattern.filterHz,
          pattern.overtoneGain,
        );
        scheduledCount += 1;
      }

      if (bassMidi !== null) {
        this.playMarimbaNote(
          midiToFrequency(bassMidi),
          this.nextStepTime,
          pattern.noteDecaySec * 1.25,
          0.18 * pattern.volumeScale,
          Math.min(pattern.filterHz, 1200),
          pattern.overtoneGain * 0.5,
        );
        scheduledCount += 1;
      }

      this.nextStepTime += stepDurationSec;
      this.stepIndex = (this.stepIndex + 1) % pattern.melody.length;
    }

    return scheduledCount;
  }

  private playMarimbaNote(
    frequencyHz: number,
    startTime: number,
    decaySec: number,
    peakGain: number,
    filterHz: number,
    overtoneGain: number,
  ): void {
    const ctx = this.context;
    const stopTime = startTime + decaySec + 0.03;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterHz, startTime);
    filter.Q.setValueAtTime(0.8, startTime);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(Math.max(0.0002, peakGain), startTime + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + decaySec);

    const fundamental = ctx.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.setValueAtTime(frequencyHz, startTime);

    fundamental.connect(filter);
    filter.connect(env);
    env.connect(this.destination);

    let overtone: OscillatorNode | null = null;
    let overtoneEnv: GainNode | null = null;
    if (overtoneGain > 0.001) {
      overtone = ctx.createOscillator();
      overtone.type = 'triangle';
      // 4th harmonic gives the classic warm wooden marimba/kalimba mallet strike.
      overtone.frequency.setValueAtTime(Math.min(6000, frequencyHz * 4), startTime);

      overtoneEnv = ctx.createGain();
      const overtonePeak = Math.max(0.0002, peakGain * overtoneGain);
      const overtoneDecay = Math.min(0.08, decaySec * 0.25);
      overtoneEnv.gain.setValueAtTime(0.0001, startTime);
      overtoneEnv.gain.linearRampToValueAtTime(overtonePeak, startTime + 0.004);
      overtoneEnv.gain.exponentialRampToValueAtTime(0.0001, startTime + overtoneDecay);

      overtone.connect(overtoneEnv);
      overtoneEnv.connect(filter);

      overtone.start(startTime);
      overtone.stop(startTime + overtoneDecay + 0.02);
    }

    fundamental.start(startTime);
    fundamental.stop(stopTime);

    fundamental.onended = () => {
      fundamental.disconnect();
      overtone?.disconnect();
      overtoneEnv?.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }
}
