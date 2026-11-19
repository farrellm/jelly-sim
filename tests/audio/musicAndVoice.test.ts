import { describe, expect, it } from 'vitest';
import {
  MUSIC_PATTERNS,
  MusicSequencer,
  midiToFrequency,
  type MusicMood,
} from '../../src/audio/MusicSequencer';
import {
  VOICE_BARK_PHRASES,
  VoiceSynth,
  mapSpeechCueToBark,
  type VoiceBarkType,
} from '../../src/audio/VoiceSynth';
import { MockAudioContext } from './mockAudioContext';

describe('MusicSequencer (cozy pentatonic marimba/kalimba loop)', () => {
  it('converts MIDI notes accurately (A4 = 440 Hz, C4 ≈ 261.63 Hz)', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 5);
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
    expect(midiToFrequency(72)).toBeCloseTo(523.2511, 3);
  });

  it('defines balanced 32-step patterns for every game mood', () => {
    const moods: MusicMood[] = ['cozy', 'sleepy', 'cozy_rain', 'candy_castle', 'viking'];
    for (const mood of moods) {
      const pattern = MUSIC_PATTERNS[mood];
      expect(pattern.melody.length).toBe(32);
      expect(pattern.bass.length).toBe(32);
      expect(pattern.bpm).toBeGreaterThan(50);
    }
  });

  it('schedules marimba notes via lookahead and stops cleanly', () => {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const callbacks: Array<() => void> = [];
    let cleared = false;

    const seq = new MusicSequencer(mockCtx as unknown as AudioContext, dest, {
      mood: 'cozy',
      setIntervalFn: (cb) => {
        callbacks.push(cb);
        return 7;
      },
      clearIntervalFn: () => {
        cleared = true;
      },
    });

    seq.start();
    expect(seq.isPlaying()).toBe(true);
    expect(mockCtx.oscillators.length).toBeGreaterThan(0);

    const beforeCount = mockCtx.oscillators.length;
    // Advance in realistic 100ms lookahead increments across several eighth-note beats
    for (let tick = 0; tick < 8; tick += 1) {
      mockCtx.currentTime += 0.1;
      for (const cb of callbacks) {
        cb();
      }
    }
    expect(mockCtx.oscillators.length).toBeGreaterThan(beforeCount);

    seq.setMood('sleepy');
    expect(seq.getMood()).toBe('sleepy');

    seq.stop();
    expect(seq.isPlaying()).toBe(false);
    expect(cleared).toBe(true);
    expect(seq.schedulePendingSteps()).toBe(0);
  });
});

describe('VoiceSynth (Jelly Bean formant pitch-chirp barks)', () => {
  it('maps canonical need speech cues and sleep state to vocal barks', () => {
    expect(mapSpeechCueToBark('hungry')).toBe('hungry');
    expect(mapSpeechCueToBark('cold')).toBe('cold');
    expect(mapSpeechCueToBark('sleepy')).toBe('sleepy');
    expect(mapSpeechCueToBark('hygiene')).toBe('hygiene');
    expect(mapSpeechCueToBark('angry')).toBe('angry');
    expect(mapSpeechCueToBark(null, true)).toBe('sleepy');
    expect(mapSpeechCueToBark(null, false)).toBeNull();
  });

  it('synthesizes every canonical Jelly Bean vocal bark with formant filters and shivering vibrato', () => {
    const mockCtx = new MockAudioContext();
    const dest = mockCtx.createGain();
    const synth = new VoiceSynth(mockCtx as unknown as AudioContext, dest);

    const barks = Object.keys(VOICE_BARK_PHRASES) as VoiceBarkType[];
    expect(barks).toEqual(
      expect.arrayContaining(['jelly_bean', 'hungry', 'cold', 'sleepy', 'happy', 'level_up']),
    );

    for (const bark of barks) {
      const oscBefore = mockCtx.oscillators.length;
      const filterBefore = mockCtx.filters.length;
      const duration = synth.playBark(bark, { startTime: 0.1 });

      const def = VOICE_BARK_PHRASES[bark];
      expect(duration).toBeGreaterThan(0);
      // Every syllable attaches two formant filters (bandpass + peaking)
      expect(mockCtx.filters.length - filterBefore).toBe(def.syllables.length * 2);

      // Cold and angry include an extra vibrato LFO oscillator per syllable
      const expectedOscs = def.syllables.reduce(
        (sum, s) => sum + 1 + (s.vibratoHz && s.vibratoDepthHz ? 1 : 0),
        0,
      );
      expect(mockCtx.oscillators.length - oscBefore).toBe(expectedOscs);
    }
  });
});
