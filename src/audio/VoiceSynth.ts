import type { BeanMoodCueType } from '../sim/types';

export type VoiceBarkType =
  | 'jelly_bean'
  | 'hungry'
  | 'cold'
  | 'sleepy'
  | 'hygiene'
  | 'angry'
  | 'happy'
  | 'level_up';

export type VowelType = 'a' | 'e' | 'i' | 'o' | 'u';

export interface VoiceSyllable {
  readonly offsetSec: number;
  readonly durationSec: number;
  readonly startHz: number;
  readonly endHz: number;
  readonly vowel: VowelType;
  readonly waveform: OscillatorType;
  readonly gain: number;
  readonly vibratoHz?: number;
  readonly vibratoDepthHz?: number;
}

export interface VoiceBarkDefinition {
  readonly label: string;
  readonly syllables: readonly VoiceSyllable[];
}

export interface PlayBarkOptions {
  /** Multiplier applied to syllable pitches (default 1.0, higher = tinier larva voice). */
  pitchScale?: number;
  /** Relative gain multiplier (0..1.5, default 1.0). */
  volume?: number;
  /** Optional deterministic start time in AudioContext seconds. */
  startTime?: number;
}

interface FormantPair {
  readonly f1: number;
  readonly f2: number;
}

/**
 * Bright, childlike vowel formant frequencies tuned for a tiny glossy Jelly Bean.
 */
const VOWEL_FORMANTS: Record<VowelType, FormantPair> = {
  a: { f1: 920, f2: 1700 },
  e: { f1: 680, f2: 2450 },
  i: { f1: 430, f2: 2950 },
  o: { f1: 620, f2: 1200 },
  u: { f1: 450, f2: 1080 },
};

/**
 * Canonical Jelly Bean vocal phrases synced with the game's speech bubbles:
 * "Jelly Bean!", "Hungry!", "Cold!", "Sleep, sleep!", plus happy/level-up reactions.
 */
export const VOICE_BARK_PHRASES: Record<VoiceBarkType, VoiceBarkDefinition> = {
  jelly_bean: {
    label: 'Jelly Bean!',
    syllables: [
      { offsetSec: 0.0, durationSec: 0.09, startHz: 560, endHz: 680, vowel: 'e', waveform: 'triangle', gain: 0.72 },
      { offsetSec: 0.1, durationSec: 0.08, startHz: 660, endHz: 610, vowel: 'i', waveform: 'triangle', gain: 0.65 },
      { offsetSec: 0.2, durationSec: 0.16, startHz: 640, endHz: 840, vowel: 'i', waveform: 'triangle', gain: 0.85 },
    ],
  },
  hungry: {
    label: 'Jelly Bean hungry!',
    syllables: [
      { offsetSec: 0.0, durationSec: 0.11, startHz: 600, endHz: 760, vowel: 'a', waveform: 'triangle', gain: 0.82 },
      { offsetSec: 0.13, durationSec: 0.16, startHz: 700, endHz: 940, vowel: 'i', waveform: 'triangle', gain: 0.9 },
    ],
  },
  cold: {
    label: 'Jelly Bean cold!',
    syllables: [
      {
        offsetSec: 0.0,
        durationSec: 0.17,
        startHz: 660,
        endHz: 540,
        vowel: 'u',
        waveform: 'triangle',
        gain: 0.76,
        vibratoHz: 24,
        vibratoDepthHz: 32,
      },
      {
        offsetSec: 0.2,
        durationSec: 0.19,
        startHz: 580,
        endHz: 490,
        vowel: 'o',
        waveform: 'triangle',
        gain: 0.82,
        vibratoHz: 26,
        vibratoDepthHz: 36,
      },
    ],
  },
  sleepy: {
    label: 'Sleep, sleep...',
    syllables: [
      { offsetSec: 0.0, durationSec: 0.22, startHz: 540, endHz: 430, vowel: 'i', waveform: 'sine', gain: 0.62 },
      { offsetSec: 0.27, durationSec: 0.26, startHz: 470, endHz: 360, vowel: 'u', waveform: 'sine', gain: 0.56 },
    ],
  },
  hygiene: {
    label: 'Uh-oh!',
    syllables: [
      { offsetSec: 0.0, durationSec: 0.1, startHz: 640, endHz: 520, vowel: 'a', waveform: 'triangle', gain: 0.74 },
      { offsetSec: 0.12, durationSec: 0.14, startHz: 500, endHz: 410, vowel: 'o', waveform: 'triangle', gain: 0.78 },
    ],
  },
  angry: {
    label: 'Hmph!',
    syllables: [
      {
        offsetSec: 0.0,
        durationSec: 0.12,
        startHz: 420,
        endHz: 590,
        vowel: 'a',
        waveform: 'sawtooth',
        gain: 0.58,
        vibratoHz: 22,
        vibratoDepthHz: 24,
      },
      {
        offsetSec: 0.14,
        durationSec: 0.14,
        startHz: 510,
        endHz: 380,
        vowel: 'o',
        waveform: 'sawtooth',
        gain: 0.62,
        vibratoHz: 20,
        vibratoDepthHz: 22,
      },
    ],
  },
  happy: {
    label: 'Hehe!',
    syllables: [
      { offsetSec: 0.0, durationSec: 0.08, startHz: 680, endHz: 840, vowel: 'e', waveform: 'triangle', gain: 0.74 },
      { offsetSec: 0.095, durationSec: 0.11, startHz: 780, endHz: 980, vowel: 'i', waveform: 'triangle', gain: 0.8 },
    ],
  },
  level_up: {
    label: 'Yay!!',
    syllables: [
      { offsetSec: 0.0, durationSec: 0.08, startHz: 587, endHz: 659, vowel: 'e', waveform: 'triangle', gain: 0.72 },
      { offsetSec: 0.09, durationSec: 0.08, startHz: 659, endHz: 784, vowel: 'a', waveform: 'triangle', gain: 0.78 },
      { offsetSec: 0.18, durationSec: 0.09, startHz: 784, endHz: 988, vowel: 'i', waveform: 'triangle', gain: 0.84 },
      { offsetSec: 0.29, durationSec: 0.18, startHz: 988, endHz: 1174, vowel: 'a', waveform: 'triangle', gain: 0.9 },
    ],
  },
};

/**
 * Maps a simulation speech cue (or active sleeping state) to its matching vocal bark.
 */
export function mapSpeechCueToBark(
  cue: BeanMoodCueType | null,
  isSleeping = false,
): VoiceBarkType | null {
  switch (cue) {
    case 'hungry':
      return 'hungry';
    case 'cold':
      return 'cold';
    case 'sleepy':
      return 'sleepy';
    case 'hygiene':
      return 'hygiene';
    case 'angry':
      return 'angry';
    default:
      return isSleeping ? 'sleepy' : null;
  }
}

function clampFreq(hz: number): number {
  return Math.min(4800, Math.max(60, hz));
}

function clampGain(value: number): number {
  return Math.min(1.2, Math.max(0.0001, value));
}

/**
 * Formant-filtered pitch-chirp synthesizer for cute Jelly Bean vocal barks.
 */
export class VoiceSynth {
  private readonly context: AudioContext;
  private readonly destination: AudioNode;

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context;
    this.destination = destination;
  }

  /**
   * Synthesizes a vocal bark phrase and returns its total duration in seconds.
   */
  playBark(bark: VoiceBarkType, options: PlayBarkOptions = {}): number {
    const phrase = VOICE_BARK_PHRASES[bark];
    const baseTime = options.startTime ?? this.context.currentTime + 0.005;
    const pitchScale = options.pitchScale ?? 1.0;
    const volume = Math.min(1.5, Math.max(0, options.volume ?? 1.0));

    if (volume <= 0) {
      return 0;
    }

    let totalDuration = 0;

    for (const syllable of phrase.syllables) {
      const start = baseTime + syllable.offsetSec;
      const end = start + syllable.durationSec;
      totalDuration = Math.max(totalDuration, syllable.offsetSec + syllable.durationSec);

      this.scheduleSyllable(syllable, start, end, pitchScale, volume);
    }

    return totalDuration;
  }

  private scheduleSyllable(
    syllable: VoiceSyllable,
    start: number,
    end: number,
    pitchScale: number,
    volume: number,
  ): void {
    const ctx = this.context;
    const osc = ctx.createOscillator();
    osc.type = syllable.waveform;

    const startHz = clampFreq(syllable.startHz * pitchScale);
    const endHz = clampFreq(syllable.endHz * pitchScale);
    osc.frequency.setValueAtTime(startHz, start);
    osc.frequency.exponentialRampToValueAtTime(endHz, end);

    let lfo: OscillatorNode | null = null;
    let lfoGain: GainNode | null = null;
    if (syllable.vibratoHz && syllable.vibratoDepthHz) {
      lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(syllable.vibratoHz, start);
      lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(syllable.vibratoDepthHz, start);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(start);
      lfo.stop(end + 0.02);
    }

    // Two gentle peaking/bandpass formants shape the cute vowel character.
    const formants = VOWEL_FORMANTS[syllable.vowel];
    const formant1 = ctx.createBiquadFilter();
    formant1.type = 'bandpass';
    formant1.frequency.setValueAtTime(formants.f1, start);
    formant1.Q.setValueAtTime(2.6, start);

    const formant2 = ctx.createBiquadFilter();
    formant2.type = 'peaking';
    formant2.frequency.setValueAtTime(formants.f2, start);
    formant2.Q.setValueAtTime(3.0, start);
    formant2.gain.setValueAtTime(6.0, start);

    const env = ctx.createGain();
    const peakGain = clampGain(syllable.gain * volume * 0.42);
    const attackEnd = start + Math.min(0.018, syllable.durationSec * 0.25);
    const releaseStart = Math.max(attackEnd, end - Math.min(0.04, syllable.durationSec * 0.35));

    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(peakGain, attackEnd);
    env.gain.setValueAtTime(peakGain, releaseStart);
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(formant1);
    formant1.connect(formant2);
    formant2.connect(env);
    env.connect(this.destination);

    osc.start(start);
    osc.stop(end + 0.02);

    osc.onended = () => {
      osc.disconnect();
      formant1.disconnect();
      formant2.disconnect();
      env.disconnect();
      lfo?.disconnect();
      lfoGain?.disconnect();
    };
  }
}
