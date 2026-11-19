export interface ScheduledRamp {
  kind: 'set' | 'linear' | 'exp' | 'target';
  value: number;
  time: number;
}

export class MockAudioParam {
  value = 0;
  readonly events: ScheduledRamp[] = [];

  setValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ kind: 'set', value, time });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ kind: 'linear', value, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    if (value <= 0) {
      throw new RangeError(`exponentialRampToValueAtTime requires positive value, got ${value}`);
    }
    this.value = value;
    this.events.push({ kind: 'exp', value, time });
    return this;
  }

  setTargetAtTime(value: number, time: number): this {
    this.value = value;
    this.events.push({ kind: 'target', value, time });
    return this;
  }
}

export class MockAudioNode {
  connectedTo: unknown[] = [];
  disconnected = false;

  connect(dest: unknown): unknown {
    this.connectedTo.push(dest);
    return dest;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

export class MockGainNode extends MockAudioNode {
  readonly gain = new MockAudioParam();
}

export class MockOscillatorNode extends MockAudioNode {
  type: OscillatorType = 'sine';
  readonly frequency = new MockAudioParam();
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;

  start(when = 0): void {
    this.startedAt = when;
  }

  stop(when = 0): void {
    this.stoppedAt = when;
  }
}

export class MockBiquadFilterNode extends MockAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new MockAudioParam();
  readonly Q = new MockAudioParam();
  readonly gain = new MockAudioParam();
}

export class MockBufferSourceNode extends MockAudioNode {
  buffer: AudioBuffer | null = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;

  start(when = 0): void {
    this.startedAt = when;
  }

  stop(when = 0): void {
    this.stoppedAt = when;
  }
}

export class MockAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  sampleRate = 44100;
  readonly destination = new MockAudioNode();

  readonly gains: MockGainNode[] = [];
  readonly oscillators: MockOscillatorNode[] = [];
  readonly filters: MockBiquadFilterNode[] = [];
  readonly bufferSources: MockBufferSourceNode[] = [];

  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;
  rejectNextResume = false;

  createGain(): GainNode {
    const node = new MockGainNode();
    this.gains.push(node);
    return node as unknown as GainNode;
  }

  createOscillator(): OscillatorNode {
    const node = new MockOscillatorNode();
    this.oscillators.push(node);
    return node as unknown as OscillatorNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    const node = new MockBiquadFilterNode();
    this.filters.push(node);
    return node as unknown as BiquadFilterNode;
  }

  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    const data = new Float32Array(length);
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => data,
    } as unknown as AudioBuffer;
  }

  createBufferSource(): AudioBufferSourceNode {
    const node = new MockBufferSourceNode();
    this.bufferSources.push(node);
    return node as unknown as AudioBufferSourceNode;
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    if (this.rejectNextResume) {
      this.rejectNextResume = false;
      throw new Error('Autoplay blocked');
    }
    this.state = 'running';
  }

  async suspend(): Promise<void> {
    this.suspendCalls += 1;
    if (this.state === 'running') {
      this.state = 'suspended';
    }
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
  }
}
