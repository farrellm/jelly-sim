import { describe, expect, it, vi } from 'vitest';
import { AudioEngine, type AudioDocumentLike, type AudioEventTargetLike, type SfxName } from '../../src/audio/AudioEngine';
import { MockAudioContext } from './mockAudioContext';

class FakeEventTarget implements AudioEventTargetLike {
  private readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const fn: EventListener =
      typeof listener === 'function' ? listener : (e) => listener.handleEvent(e);
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const set = this.listeners.get(type);
    if (!set) return;
    if (typeof listener === 'function') {
      set.delete(listener);
    }
  }

  emit(type: string): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      fn({ type } as Event);
    }
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class FakeDocument extends FakeEventTarget implements AudioDocumentLike {
  hidden = false;
  visibilityState = 'visible';
}

describe('AudioEngine (iOS Safari unlock, visibility lifecycle, mute, SFX & barks)', () => {
  it('defers AudioContext creation until first pointerdown and unlocks cleanly without warnings', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const fakeWin = new FakeEventTarget();
    const fakeDoc = new FakeDocument();
    let createdCount = 0;
    const mockCtx = new MockAudioContext();

    const engine = new AudioEngine({
      windowTarget: fakeWin,
      documentTarget: fakeDoc,
      createContext: () => {
        createdCount += 1;
        return mockCtx as unknown as AudioContext;
      },
      setIntervalFn: () => 1,
      clearIntervalFn: () => {},
    });

    engine.attachLifecycle();

    // Before first gesture: zero AudioContext creation and silent no-ops
    expect(createdCount).toBe(0);
    expect(engine.isUnlocked()).toBe(false);
    expect(engine.playSfx('feed')).toBe(false);
    expect(engine.playVoiceBark('hungry')).toBe(false);

    // Simulate iOS first pointerdown gesture
    fakeWin.emit('pointerdown');
    await Promise.resolve();

    expect(createdCount).toBe(1);
    expect(mockCtx.resumeCalls).toBe(1);
    expect(mockCtx.bufferSources.length).toBeGreaterThanOrEqual(1); // 1-sample silent iOS unlock pulse
    expect(engine.isUnlocked()).toBe(true);
    expect(engine.isMusicPlaying()).toBe(true);
    // One-shot unlock listeners detach once context is running
    expect(fakeWin.listenerCount('pointerdown')).toBe(0);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();

    engine.dispose();
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('suspends cleanly on visibilitychange hidden and resumes on visible', async () => {
    const fakeWin = new FakeEventTarget();
    const fakeDoc = new FakeDocument();
    const mockCtx = new MockAudioContext();

    const engine = new AudioEngine({
      windowTarget: fakeWin,
      documentTarget: fakeDoc,
      createContext: () => mockCtx as unknown as AudioContext,
      setIntervalFn: () => 42,
      clearIntervalFn: () => {},
    });

    engine.attachLifecycle();
    await engine.unlock();

    expect(engine.isMusicPlaying()).toBe(true);
    expect(mockCtx.state).toBe('running');

    // Tab goes to background
    fakeDoc.hidden = true;
    fakeDoc.visibilityState = 'hidden';
    fakeDoc.emit('visibilitychange');
    await Promise.resolve();

    expect(mockCtx.suspendCalls).toBe(1);
    expect(mockCtx.state).toBe('suspended');
    expect(engine.isMusicPlaying()).toBe(false);
    expect(engine.playSfx('tap')).toBe(false);

    // Tab returns to foreground
    fakeDoc.hidden = false;
    fakeDoc.visibilityState = 'visible';
    fakeDoc.emit('visibilitychange');
    await Promise.resolve();

    expect(mockCtx.resumeCalls).toBe(2);
    expect(mockCtx.state).toBe('running');
    expect(engine.isMusicPlaying()).toBe(true);
    expect(engine.playSfx('tap')).toBe(true);

    engine.dispose();
    expect(mockCtx.closeCalls).toBe(1);
  });

  it('respects mute/unmute toggle on master gain, music sequencer, and tab resume', async () => {
    const fakeWin = new FakeEventTarget();
    const fakeDoc = new FakeDocument();
    const mockCtx = new MockAudioContext();

    const engine = new AudioEngine({
      windowTarget: fakeWin,
      documentTarget: fakeDoc,
      createContext: () => mockCtx as unknown as AudioContext,
      setIntervalFn: () => 1,
      clearIntervalFn: () => {},
    });

    engine.attachLifecycle();
    await engine.unlock();

    const masterGain = mockCtx.gains[0];
    expect(masterGain).toBeDefined();
    expect(masterGain!.gain.value).toBeGreaterThan(0);

    engine.setEnabled(false);
    expect(engine.isEnabled()).toBe(false);
    expect(masterGain!.gain.value).toBe(0);
    expect(engine.isMusicPlaying()).toBe(false);
    expect(engine.playSfx('coin')).toBe(false);
    expect(engine.playVoiceBark('happy')).toBe(false);

    // Background -> foreground while muted should keep music off and not force resume
    fakeDoc.hidden = true;
    fakeDoc.visibilityState = 'hidden';
    fakeDoc.emit('visibilitychange');
    await Promise.resolve();
    const resumeBeforeShow = mockCtx.resumeCalls;

    fakeDoc.hidden = false;
    fakeDoc.visibilityState = 'visible';
    fakeDoc.emit('visibilitychange');
    await Promise.resolve();

    expect(mockCtx.resumeCalls).toBe(resumeBeforeShow);
    expect(engine.isMusicPlaying()).toBe(false);

    // Unmute restores sound and restarts music
    expect(engine.toggleEnabled()).toBe(true);
    expect(masterGain!.gain.value).toBeGreaterThan(0);
    expect(engine.isMusicPlaying()).toBe(true);

    engine.dispose();
  });

  it('plays every canonical tactile SFX without Web Audio parameter errors', async () => {
    const mockCtx = new MockAudioContext();
    const engine = new AudioEngine({
      windowTarget: null,
      documentTarget: null,
      createContext: () => mockCtx as unknown as AudioContext,
      setIntervalFn: () => 1,
      clearIntervalFn: () => {},
    });

    await engine.unlock();

    const allSfx: SfxName[] = [
      'tap',
      'feed',
      'coin',
      'sleep',
      'wake',
      'warm',
      'wash',
      'pet',
      'level_up',
      'error',
      'dig',
      'flush',
      'knock',
    ];

    for (const sfx of allSfx) {
      expect(engine.playSfx(sfx)).toBe(true);
    }

    expect(mockCtx.oscillators.length).toBeGreaterThan(allSfx.length);
    engine.dispose();
  });

  it('throttles passive speech-bubble voice barks while allowing active reaction barks immediately', async () => {
    let clockMs = 10_000;
    const mockCtx = new MockAudioContext();
    const engine = new AudioEngine({
      windowTarget: null,
      documentTarget: null,
      now: () => clockMs,
      passiveBarkCooldownMs: 12_000,
      createContext: () => mockCtx as unknown as AudioContext,
      setIntervalFn: () => 1,
      clearIntervalFn: () => {},
    });

    await engine.unlock();

    // First passive hungry bark plays
    expect(engine.playVoiceBark('hungry', { passive: true, cueKey: 'hungry' })).toBe(true);
    // Repeated same passive cue within 12s is suppressed
    clockMs += 3_000;
    expect(engine.playVoiceBark('hungry', { passive: true, cueKey: 'hungry' })).toBe(false);
    // Switching to a different urgent cue after >2s is allowed
    expect(engine.playVoiceBark('cold', { passive: true, cueKey: 'cold' })).toBe(true);
    // Active reaction bark (passive = false) always plays immediately
    expect(engine.playVoiceBark('happy')).toBe(true);

    // Same passive cue plays again after cooldown passes
    clockMs += 13_000;
    expect(engine.playVoiceBark('cold', { passive: true, cueKey: 'cold' })).toBe(true);

    engine.dispose();
  });

  it('gracefully handles missing AudioContext or autoplay rejection', async () => {
    const engineNoCtx = new AudioEngine({
      windowTarget: null,
      documentTarget: null,
      createContext: () => null,
    });
    expect(await engineNoCtx.unlock()).toBe(false);
    expect(engineNoCtx.isUnlocked()).toBe(false);

    const mockCtx = new MockAudioContext();
    mockCtx.rejectNextResume = true;
    const engineBlocked = new AudioEngine({
      windowTarget: null,
      documentTarget: null,
      createContext: () => mockCtx as unknown as AudioContext,
    });
    expect(await engineBlocked.unlock()).toBe(false);
    expect(engineBlocked.isUnlocked()).toBe(false);
    // Subsequent user gesture succeeds
    expect(await engineBlocked.unlock()).toBe(true);
    expect(engineBlocked.isUnlocked()).toBe(true);
    engineBlocked.dispose();
  });
});
