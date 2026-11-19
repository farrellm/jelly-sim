import { MusicSequencer, type MusicMood } from './MusicSequencer';
import { VoiceSynth, type PlayBarkOptions, type VoiceBarkType } from './VoiceSynth';

export type SfxName =
  | 'tap'
  | 'feed'
  | 'coin'
  | 'sleep'
  | 'wake'
  | 'warm'
  | 'wash'
  | 'pet'
  | 'level_up'
  | 'error'
  | 'dig'
  | 'flush'
  | 'knock';

export interface AudioEventTargetLike {
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

export interface AudioDocumentLike extends AudioEventTargetLike {
  hidden?: boolean;
  visibilityState?: string;
}

export interface AudioEngineOptions {
  enabled?: boolean;
  masterVolume?: number;
  musicVolume?: number;
  sfxVolume?: number;
  voiceVolume?: number;
  passiveBarkCooldownMs?: number;
  initialMood?: MusicMood;
  createContext?: () => AudioContext | null;
  windowTarget?: AudioEventTargetLike | null;
  documentTarget?: AudioDocumentLike | null;
  now?: () => number;
  setIntervalFn?: (cb: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

export interface PlayVoiceBarkOptions extends PlayBarkOptions {
  /** True when triggered automatically from a need speech bubble (rate-limited). */
  passive?: boolean;
  /** Identifier for the active cue so distinct urgent cues can still speak cleanly. */
  cueKey?: string;
}

interface AudioWindow {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

function defaultCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const win = window as unknown as AudioWindow;
  const Ctor = win.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

function isDocumentHidden(doc: AudioDocumentLike | null): boolean {
  if (!doc) return false;
  return doc.visibilityState === 'hidden' || doc.hidden === true;
}

/**
 * Zero-dependency Web Audio API engine for Jelly Bean Simulator.
 *
 * - Defers AudioContext creation until the first user gesture (`pointerdown` / `touchend` / `keydown`)
 *   to satisfy iOS Safari autoplay policy with zero console warnings.
 * - Suspends cleanly on tab hide (`visibilitychange` / `pagehide`) and resumes on return.
 * - Hosts tactile SFX synthesis, the procedural pentatonic marimba sequencer, and VoiceSynth barks.
 */
export class AudioEngine {
  private readonly createContext: () => AudioContext | null;
  private readonly windowTarget: AudioEventTargetLike | null;
  private readonly documentTarget: AudioDocumentLike | null;
  private readonly now: () => number;
  private readonly setIntervalFn?: (cb: () => void, ms: number) => unknown;
  private readonly clearIntervalFn?: (handle: unknown) => void;

  private readonly masterVolume: number;
  private readonly musicVolume: number;
  private readonly sfxVolume: number;
  private readonly voiceVolume: number;
  private readonly passiveBarkCooldownMs: number;

  private enabled: boolean;
  private mood: MusicMood;
  private unlocked = false;
  private hidden = false;
  private disposed = false;

  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private musicSequencer: MusicSequencer | null = null;
  private voiceSynth: VoiceSynth | null = null;

  private lastPassiveBarkMs = -Infinity;
  private lastPassiveCueKey: string | null = null;
  private detachLifecycleFn: (() => void) | null = null;
  private detachUnlockFn: (() => void) | null = null;

  constructor(options: AudioEngineOptions = {}) {
    this.createContext = options.createContext ?? defaultCreateAudioContext;
    this.windowTarget =
      'windowTarget' in options
        ? (options.windowTarget ?? null)
        : typeof window !== 'undefined'
          ? window
          : null;
    this.documentTarget =
      'documentTarget' in options
        ? (options.documentTarget ?? null)
        : typeof document !== 'undefined'
          ? document
          : null;
    this.now = options.now ?? (() => Date.now());
    this.setIntervalFn = options.setIntervalFn;
    this.clearIntervalFn = options.clearIntervalFn;

    this.enabled = options.enabled ?? true;
    this.masterVolume = options.masterVolume ?? 0.72;
    this.musicVolume = options.musicVolume ?? 0.28;
    this.sfxVolume = options.sfxVolume ?? 0.68;
    this.voiceVolume = options.voiceVolume ?? 0.76;
    this.passiveBarkCooldownMs = options.passiveBarkCooldownMs ?? 12000;
    this.mood = options.initialMood ?? 'cozy';
    this.hidden = isDocumentHidden(this.documentTarget);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  isHidden(): boolean {
    return this.hidden;
  }

  isMusicPlaying(): boolean {
    return this.musicSequencer?.isPlaying() ?? false;
  }

  getMusicMood(): MusicMood {
    return this.mood;
  }

  getContext(): AudioContext | null {
    return this.context;
  }

  /**
   * Hooks one-shot iOS gesture unlock listeners (`pointerdown`, `touchend`, `keydown`)
   * and tab lifecycle listeners (`visibilitychange`, `pagehide`, `pageshow`).
   */
  attachLifecycle(): () => void {
    if (this.detachLifecycleFn) {
      return this.detachLifecycleFn;
    }

    const win = this.windowTarget;
    const doc = this.documentTarget;

    const handleGestureUnlock: EventListener = () => {
      void this.unlock();
    };

    const passiveCapture: AddEventListenerOptions = { passive: true, capture: true };
    win?.addEventListener('pointerdown', handleGestureUnlock, passiveCapture);
    win?.addEventListener('touchend', handleGestureUnlock, passiveCapture);
    win?.addEventListener('keydown', handleGestureUnlock, passiveCapture);

    this.detachUnlockFn = () => {
      win?.removeEventListener('pointerdown', handleGestureUnlock, passiveCapture);
      win?.removeEventListener('touchend', handleGestureUnlock, passiveCapture);
      win?.removeEventListener('keydown', handleGestureUnlock, passiveCapture);
      this.detachUnlockFn = null;
    };

    const handleVisibilityChange: EventListener = () => {
      if (isDocumentHidden(doc)) {
        void this.handleSuspend();
      } else {
        void this.handleResume();
      }
    };

    const handlePageHide: EventListener = () => {
      void this.handleSuspend();
    };

    const handlePageShow: EventListener = () => {
      if (!isDocumentHidden(doc)) {
        void this.handleResume();
      }
    };

    doc?.addEventListener('visibilitychange', handleVisibilityChange);
    win?.addEventListener('pagehide', handlePageHide);
    win?.addEventListener('pageshow', handlePageShow);

    this.detachLifecycleFn = () => {
      this.detachUnlockFn?.();
      doc?.removeEventListener('visibilitychange', handleVisibilityChange);
      win?.removeEventListener('pagehide', handlePageHide);
      win?.removeEventListener('pageshow', handlePageShow);
      this.detachLifecycleFn = null;
    };

    return this.detachLifecycleFn;
  }

  /**
   * Unlocks Web Audio cleanly inside a user gesture handler (iOS Safari safe).
   */
  async unlock(): Promise<boolean> {
    if (this.disposed) {
      return false;
    }

    if (!this.context) {
      const ctx = this.createContext();
      if (!ctx) {
        return false;
      }
      this.initializeGraph(ctx);
    }

    const ctx = this.context;
    if (!ctx) {
      return false;
    }

    // Play a 1-sample silent buffer synchronously inside the gesture call stack for iOS Safari.
    this.playSilentUnlockPulse(ctx);

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Ignore browser autoplay rejection without noisy console warnings.
        return false;
      }
    }

    this.unlocked = true;

    if (ctx.state === 'running') {
      this.detachUnlockFn?.();
    }

    this.syncMasterGain();
    this.syncMusicPlayback();
    return true;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    this.syncMasterGain();
    this.syncMusicPlayback();
  }

  toggleEnabled(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setMusicMood(mood: MusicMood): void {
    if (this.mood === mood) {
      return;
    }
    this.mood = mood;
    this.musicSequencer?.setMood(mood);
  }

  /**
   * Plays a procedural tactile sound effect if audio is unlocked, enabled, and visible.
   */
  playSfx(name: SfxName): boolean {
    const ctx = this.getActiveContext();
    const sfxGain = this.sfxGain;
    if (!ctx || !sfxGain) {
      return false;
    }

    const now = ctx.currentTime + 0.004;

    switch (name) {
      case 'tap':
        this.playTone(ctx, sfxGain, {
          start: now,
          duration: 0.065,
          startHz: 660,
          endHz: 840,
          waveform: 'triangle',
          gain: 0.24,
        });
        return true;

      case 'feed':
        // Playful pop + crisp apple crunch + joyful marimba chime
        this.playTone(ctx, sfxGain, {
          start: now,
          duration: 0.09,
          startHz: 320,
          endHz: 680,
          waveform: 'sine',
          gain: 0.34,
        });
        this.playNoiseBurst(ctx, sfxGain, {
          start: now + 0.055,
          duration: 0.08,
          filterType: 'bandpass',
          filterHz: 2400,
          q: 1.8,
          gain: 0.28,
        });
        this.playTone(ctx, sfxGain, {
          start: now + 0.14,
          duration: 0.16,
          startHz: 523.25,
          endHz: 783.99,
          waveform: 'triangle',
          gain: 0.32,
        });
        return true;

      case 'coin':
        this.playTone(ctx, sfxGain, {
          start: now,
          duration: 0.09,
          startHz: 987.77,
          endHz: 987.77,
          waveform: 'sine',
          gain: 0.3,
        });
        this.playTone(ctx, sfxGain, {
          start: now + 0.075,
          duration: 0.22,
          startHz: 1318.51,
          endHz: 1318.51,
          waveform: 'sine',
          gain: 0.32,
        });
        return true;

      case 'sleep':
        // Soft descending lullaby shimmer
        this.playArpeggio(ctx, sfxGain, now, [659.25, 587.33, 523.25, 392.0], 0.085, 0.28, 'sine', 0.22);
        return true;

      case 'wake':
        // Bright ascending sparkle
        this.playArpeggio(ctx, sfxGain, now, [523.25, 659.25, 783.99, 1046.5], 0.065, 0.22, 'triangle', 0.26);
        return true;

      case 'warm':
        // Cozy warm hearth chord + gentle crackle
        this.playNoiseBurst(ctx, sfxGain, {
          start: now,
          duration: 0.16,
          filterType: 'bandpass',
          filterHz: 1600,
          q: 1.2,
          gain: 0.18,
        });
        this.playArpeggio(ctx, sfxGain, now + 0.02, [349.23, 440.0, 523.25], 0.05, 0.3, 'sine', 0.24);
        return true;

      case 'wash':
        // Three bubbly pitch-rising water pops
        this.playTone(ctx, sfxGain, {
          start: now,
          duration: 0.075,
          startHz: 420,
          endHz: 860,
          waveform: 'sine',
          gain: 0.26,
        });
        this.playTone(ctx, sfxGain, {
          start: now + 0.08,
          duration: 0.075,
          startHz: 520,
          endHz: 1020,
          waveform: 'sine',
          gain: 0.26,
        });
        this.playTone(ctx, sfxGain, {
          start: now + 0.16,
          duration: 0.09,
          startHz: 620,
          endHz: 1220,
          waveform: 'sine',
          gain: 0.28,
        });
        return true;

      case 'pet':
        // Cute jelly boing chime
        this.playTone(ctx, sfxGain, {
          start: now,
          duration: 0.15,
          startHz: 460,
          endHz: 920,
          waveform: 'triangle',
          gain: 0.28,
        });
        this.playTone(ctx, sfxGain, {
          start: now + 0.09,
          duration: 0.16,
          startHz: 783.99,
          endHz: 1046.5,
          waveform: 'sine',
          gain: 0.24,
        });
        return true;

      case 'level_up':
        // Joyful ascending major-7th marimba fanfare
        this.playArpeggio(
          ctx,
          sfxGain,
          now,
          [523.25, 659.25, 783.99, 987.77, 1046.5],
          0.075,
          0.32,
          'triangle',
          0.34,
        );
        return true;

      case 'error':
        this.playTone(ctx, sfxGain, {
          start: now,
          duration: 0.12,
          startHz: 260,
          endHz: 185,
          waveform: 'triangle',
          gain: 0.26,
        });
        return true;

      case 'dig':
        // Tactile dirt dig-thwack (for M4 hole digging)
        this.playTone(ctx, sfxGain, {
          start: now,
          duration: 0.11,
          startHz: 210,
          endHz: 85,
          waveform: 'triangle',
          gain: 0.36,
        });
        this.playNoiseBurst(ctx, sfxGain, {
          start: now + 0.02,
          duration: 0.1,
          filterType: 'lowpass',
          filterHz: 900,
          q: 1.0,
          gain: 0.3,
        });
        return true;

      case 'flush':
        // Porcelain swirl flush (for M2 Toilet)
        this.playNoiseBurst(ctx, sfxGain, {
          start: now,
          duration: 0.45,
          filterType: 'bandpass',
          filterHz: 1100,
          q: 2.2,
          gain: 0.26,
        });
        this.playTone(ctx, sfxGain, {
          start: now + 0.05,
          duration: 0.35,
          startHz: 480,
          endHz: 210,
          waveform: 'sine',
          gain: 0.2,
        });
        return true;

      case 'knock':
        // Double wood knock-knock for Dr. Bubblegum (M2)
        this.playTone(ctx, sfxGain, {
          start: now,
          duration: 0.055,
          startHz: 340,
          endHz: 190,
          waveform: 'triangle',
          gain: 0.36,
        });
        this.playTone(ctx, sfxGain, {
          start: now + 0.16,
          duration: 0.055,
          startHz: 360,
          endHz: 200,
          waveform: 'triangle',
          gain: 0.38,
        });
        return true;
    }
  }

  /**
   * Plays a synthesized Jelly Bean voice bark.
   * When `options.passive` is true, rate-limits repeats using `passiveBarkCooldownMs`.
   */
  playVoiceBark(bark: VoiceBarkType, options: PlayVoiceBarkOptions = {}): boolean {
    const ctx = this.getActiveContext();
    if (!ctx || !this.voiceSynth) {
      return false;
    }

    if (options.passive) {
      const nowMs = this.now();
      const cueKey = options.cueKey ?? bark;
      const isSameCue = cueKey === this.lastPassiveCueKey;
      const elapsed = nowMs - this.lastPassiveBarkMs;
      if (isSameCue && elapsed < this.passiveBarkCooldownMs) {
        return false;
      }
      // Even when switching cues, enforce a brief 2s gap so barks never overlap harshly.
      if (!isSameCue && elapsed < 2000) {
        return false;
      }
      this.lastPassiveBarkMs = nowMs;
      this.lastPassiveCueKey = cueKey;
    }

    this.voiceSynth.playBark(bark, options);
    return true;
  }

  /**
   * Suspends audio cleanly (called on tab hide / `pagehide`).
   */
  async handleSuspend(): Promise<void> {
    this.hidden = true;
    this.musicSequencer?.stop();

    const ctx = this.context;
    if (ctx && ctx.state === 'running') {
      try {
        await ctx.suspend();
      } catch {
        // Ignore platform suspend errors.
      }
    }
  }

  /**
   * Resumes audio cleanly when returning to the foreground tab.
   */
  async handleResume(): Promise<void> {
    this.hidden = false;

    const ctx = this.context;
    if (!ctx || !this.unlocked || this.disposed) {
      return;
    }

    if (this.enabled && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }

    this.syncMasterGain();
    this.syncMusicPlayback();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.detachLifecycleFn?.();
    this.detachUnlockFn?.();
    this.musicSequencer?.stop();
    this.musicSequencer = null;
    this.voiceSynth = null;
    this.noiseBuffer = null;

    this.masterGain?.disconnect();
    this.musicGain?.disconnect();
    this.sfxGain?.disconnect();
    this.voiceGain?.disconnect();

    const ctx = this.context;
    this.context = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.voiceGain = null;
    this.unlocked = false;

    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => {});
    }
  }

  private initializeGraph(ctx: AudioContext): void {
    this.context = ctx;

    const masterGain = ctx.createGain();
    const musicGain = ctx.createGain();
    const sfxGain = ctx.createGain();
    const voiceGain = ctx.createGain();

    masterGain.gain.value = this.enabled ? this.masterVolume : 0;
    musicGain.gain.value = this.musicVolume;
    sfxGain.gain.value = this.sfxVolume;
    voiceGain.gain.value = this.voiceVolume;

    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    voiceGain.connect(masterGain);
    masterGain.connect(ctx.destination);

    this.masterGain = masterGain;
    this.musicGain = musicGain;
    this.sfxGain = sfxGain;
    this.voiceGain = voiceGain;

    this.musicSequencer = new MusicSequencer(ctx, musicGain, {
      mood: this.mood,
      setIntervalFn: this.setIntervalFn,
      clearIntervalFn: this.clearIntervalFn,
    });
    this.voiceSynth = new VoiceSynth(ctx, voiceGain);
  }

  private playSilentUnlockPulse(ctx: AudioContext): void {
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // Safe fallback if a browser/mock lacks createBufferSource.
    }
  }

  private syncMasterGain(): void {
    const ctx = this.context;
    const masterGain = this.masterGain;
    if (!ctx || !masterGain) return;

    const target = this.enabled ? this.masterVolume : 0;
    if (typeof masterGain.gain.setTargetAtTime === 'function') {
      masterGain.gain.setTargetAtTime(target, ctx.currentTime, 0.025);
    } else {
      masterGain.gain.value = target;
    }
  }

  private syncMusicPlayback(): void {
    if (!this.musicSequencer) return;
    if (this.unlocked && this.enabled && !this.hidden && !this.disposed) {
      this.musicSequencer.start();
    } else {
      this.musicSequencer.stop();
    }
  }

  private getActiveContext(): AudioContext | null {
    if (this.disposed || !this.enabled || !this.unlocked || this.hidden) {
      return null;
    }
    const ctx = this.context;
    if (!ctx || ctx.state === 'closed') {
      return null;
    }
    return ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) {
      return this.noiseBuffer;
    }
    const sampleRate = ctx.sampleRate || 44100;
    const length = Math.max(1, Math.floor(sampleRate * 0.5));
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    // Deterministic lightweight LCG noise so tests & browsers stay predictable.
    let seed = 0x517cc1b7;
    for (let i = 0; i < length; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private playTone(
    ctx: AudioContext,
    destination: AudioNode,
    params: {
      start: number;
      duration: number;
      startHz: number;
      endHz: number;
      waveform: OscillatorType;
      gain: number;
    },
  ): void {
    const osc = ctx.createOscillator();
    osc.type = params.waveform;
    const startHz = Math.max(40, params.startHz);
    const endHz = Math.max(40, params.endHz);
    osc.frequency.setValueAtTime(startHz, params.start);
    if (Math.abs(endHz - startHz) > 0.5) {
      osc.frequency.exponentialRampToValueAtTime(endHz, params.start + params.duration);
    }

    const env = ctx.createGain();
    const peak = Math.max(0.0002, params.gain);
    const attackEnd = params.start + Math.min(0.012, params.duration * 0.25);
    env.gain.setValueAtTime(0.0001, params.start);
    env.gain.linearRampToValueAtTime(peak, attackEnd);
    env.gain.exponentialRampToValueAtTime(0.0001, params.start + params.duration);

    osc.connect(env);
    env.connect(destination);

    osc.start(params.start);
    osc.stop(params.start + params.duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  private playArpeggio(
    ctx: AudioContext,
    destination: AudioNode,
    startTime: number,
    notesHz: readonly number[],
    stepSec: number,
    noteDurationSec: number,
    waveform: OscillatorType,
    gain: number,
  ): void {
    for (let i = 0; i < notesHz.length; i += 1) {
      const hz = notesHz[i];
      if (hz === undefined) continue;
      this.playTone(ctx, destination, {
        start: startTime + i * stepSec,
        duration: noteDurationSec,
        startHz: hz,
        endHz: hz,
        waveform,
        gain,
      });
    }
  }

  private playNoiseBurst(
    ctx: AudioContext,
    destination: AudioNode,
    params: {
      start: number;
      duration: number;
      filterType: BiquadFilterType;
      filterHz: number;
      q: number;
      gain: number;
    },
  ): void {
    const source = ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = params.filterType;
    filter.frequency.setValueAtTime(params.filterHz, params.start);
    filter.Q.setValueAtTime(params.q, params.start);

    const env = ctx.createGain();
    const peak = Math.max(0.0002, params.gain);
    env.gain.setValueAtTime(0.0001, params.start);
    env.gain.linearRampToValueAtTime(peak, params.start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, params.start + params.duration);

    source.connect(filter);
    filter.connect(env);
    env.connect(destination);

    source.start(params.start);
    source.stop(params.start + params.duration + 0.02);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }
}
