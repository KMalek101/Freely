export interface VoiceActivityDetector {
  isSpeech(frame: Int16Array): boolean;
}

export interface VadConfig {
  speechStartThreshold: number;
  speechEndThreshold: number;
  frameSampleCount: number;
}

const DEFAULT_CONFIG: VadConfig = {
  speechStartThreshold: 0.008,
  speechEndThreshold: 0.004,
  frameSampleCount: 480,
};

export class RmsVad implements VoiceActivityDetector {
  private isSpeaking = false;
  private config: VadConfig;

  constructor(config?: Partial<VadConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  isSpeech(frame: Int16Array): boolean {
    let sumSquares = 0;
    for (let i = 0; i < frame.length; i++) {
      const sample = frame[i]!;
      const normalized = sample / 32768;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / frame.length);

    if (this.isSpeaking) {
      if (rms < this.config.speechEndThreshold) {
        this.isSpeaking = false;
      }
    } else {
      if (rms >= this.config.speechStartThreshold) {
        this.isSpeaking = true;
      }
    }

    return this.isSpeaking;
  }

  reset(): void {
    this.isSpeaking = false;
  }
}
