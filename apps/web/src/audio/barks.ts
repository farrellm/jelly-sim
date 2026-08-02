import type { BarkId } from '@jelly/sim';

/**
 * The barks, as sound (§10.6).
 *
 * Canon makes these the game's sonic signature `[C§14]` — close enough to ambient sleep
 * audio to be left playing at bedtime — so audio is a first-class system rather than a
 * nicety. What is here is a **synthesised voice**: two short notes per bark, shaped by an
 * envelope, built from oscillators. No files, which means no binary assets in the repo and
 * nothing to download before the first bark can play.
 *
 * Real recordings replace `VOICES` and `note()` and nothing else. Per-flavor bark variants
 * (§5.6) hang off the same seam.
 */

export type Channel = 'barks' | 'ambience' | 'sfx';

const VOLUME_KEY = 'jelly.volume';
const DEFAULT_VOLUME: Record<Channel, number> = { barks: 0.7, ambience: 0.5, sfx: 0.6 };

/**
 * One bark per need per five minutes (§10.6).
 *
 * The sim emits a bark event on every threshold crossing, which is already rare, but a
 * fourteen-hour catch-up can hand over four at once and a player returning to four
 * simultaneous shouts is being yelled at, not informed.
 */
const THROTTLE_MS = 5 * 60_000;
const lastPlayedAt = new Map<BarkId, number>();

/** Two notes each, in a pentatonic scale so no pair of them can sound wrong together. */
const VOICES: Record<BarkId, { notes: [number, number]; wave: OscillatorType }> = {
  // Rising and insistent — the one that has to carry across a room.
  hungry: { notes: [523.25, 659.25], wave: 'triangle' },
  // Falling, small, a bit pitiful.
  cold: { notes: [440.0, 349.23], wave: 'sine' },
  // Low and slow, two of the same note, almost a yawn.
  sleepy: { notes: [261.63, 246.94], wave: 'sine' },
  // Flat and blunt. It is not asking.
  angry: { notes: [392.0, 392.0], wave: 'square' },
};

let context: AudioContext | null = null;
let master: GainNode | null = null;
let volumes = loadVolumes();

function loadVolumes(): Record<Channel, number> {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    return raw
      ? { ...DEFAULT_VOLUME, ...(JSON.parse(raw) as Partial<Record<Channel, number>>) }
      : DEFAULT_VOLUME;
  } catch {
    // Private browsing, or storage evicted. Preferences are not worth an error screen.
    return DEFAULT_VOLUME;
  }
}

export function getVolume(channel: Channel): number {
  return volumes[channel];
}

export function setVolume(channel: Channel, value: number): void {
  volumes = { ...volumes, [channel]: Math.max(0, Math.min(1, value)) };
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(volumes));
  } catch {
    // As above: losing a slider position costs nothing.
  }
}

/**
 * Wake the audio system on a user gesture.
 *
 * iOS will not let a page make noise until the player has touched it, so an AudioContext
 * created at load time is born suspended and stays that way. This is called from the first
 * pointerdown anywhere in the app, and is a no-op every time after.
 */
export function unlockAudio(): void {
  if (!context) {
    const Ctor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 1;
    master.connect(context.destination);
  }
  if (context.state === 'suspended') void context.resume();
}

/**
 * Say one. Silently does nothing if audio has never been unlocked, which is the correct
 * behaviour rather than an error — the player has simply not touched the screen yet.
 */
export function playBark(id: BarkId, options: { atMs?: number; preview?: boolean } = {}): boolean {
  const atMs = options.atMs ?? Date.now();
  if (!context || !master || context.state !== 'running') return false;
  if (volumes.barks <= 0) return false;

  // A volume slider has to make a sound every time it moves or it is a guess. The throttle
  // is there to stop a returning player being shouted at, which is a different situation.
  if (!options.preview) {
    const last = lastPlayedAt.get(id);
    if (last !== undefined && atMs - last < THROTTLE_MS) return false;
    lastPlayedAt.set(id, atMs);
  }

  const voice = VOICES[id];
  const start = context.currentTime;
  voice.notes.forEach((frequency, index) => {
    note(frequency, start + index * 0.16, voice.wave);
  });
  return true;
}

function note(frequency: number, at: number, wave: OscillatorType): void {
  if (!context || !master) return;

  const osc = context.createOscillator();
  const gain = context.createGain();

  osc.type = wave;
  osc.frequency.value = frequency;

  // A short attack and an exponential tail. A square wave with a hard edge on it sounds
  // like a bug report; this sounds like a small creature.
  const peak = 0.18 * volumes.barks;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);

  osc.connect(gain);
  gain.connect(master);
  osc.start(at);
  osc.stop(at + 0.32);
}

/** Test seam: forget the throttle. */
export function resetBarkThrottle(): void {
  lastPlayedAt.clear();
}
