import type { VoiceApi } from "./voice-api";
import type { VoiceClip } from "./voice";
export type VoicePlayback = { turnId: string; agent: VoiceClip["agent"]; duration: number; elapsed: number; playing: boolean; waveform: number[] };
function waveform(buffer: AudioBuffer) {
  const samples = buffer.getChannelData(0), bars = 40, step = Math.max(1, Math.floor(samples.length / 10_000));
  const values = Array.from({ length: bars }, (_, bar) => {
    const start = Math.floor(bar * samples.length / bars), end = Math.floor((bar + 1) * samples.length / bars);
    let sum = 0, count = 0;
    for (let index = start; index < end; index += step) { sum += samples[index] ** 2; count++; }
    return Math.sqrt(sum / Math.max(1, count));
  });
  const peak = Math.max(...values, .001);
  return values.map(value => Math.max(.14, value / peak));
}
// Own one actual Web Audio source. stop() also fires onended, so generation and
// interruption guards must run before stopping and before sending any receipt.
export class VoicePlayer {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private pending: AbortController | null = null;
  private epoch = 0;
  private clip: VoiceClip | null = null;
  private started = false;
  private position: VoicePlayback | null = null;
  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(
    private readonly api: VoiceApi,
    private readonly speaking: (agent: VoiceClip["agent"] | null) => void,
    private readonly failed: () => void,
    private readonly makeContext: () => AudioContext = () => new AudioContext(),
    private readonly onProgress?: (snapshot: VoicePlayback | null) => void,
  ) {}
  private publish(playing = this.playing) {
    if (!this.position || !this.context) return;
    this.position = { ...this.position, elapsed: Math.min(this.position.duration, Math.max(0, this.context.currentTime - this.startedAt)), playing };
    this.onProgress?.(this.position);
  }
  private stopTimer() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  get playing() {
    return this.started && this.context?.state === "running";
  }
  async unlock() {
    this.context ??= this.makeContext();
    await this.context.resume();
  }
  async play(
    reportId: string,
    sessionId: string,
    turnId: string,
    revision: number,
  ) {
    this.cancel();
    const epoch = this.epoch,
      controller = new AbortController();
    this.pending = controller;
    try {
      await this.unlock();
      const clip = await this.api.speech(
        reportId,
        sessionId,
        turnId,
        revision,
        controller.signal,
      );
      const bytes = await this.api.audio(clip, controller.signal);
      const buffer = await this.context!.decodeAudioData(bytes);
      if (epoch !== this.epoch || controller.signal.aborted) return;
      if (Math.abs(buffer.duration * 1000 - clip.durationMs) > 20)
        throw new Error("invalid_voice_audio");
      await this.api.playback(clip, "started");
      if (epoch !== this.epoch || controller.signal.aborted) return;
      const source = this.context!.createBufferSource();
      this.source = source;
      this.clip = clip;
      source.buffer = buffer;
      source.connect(this.context!.destination);
      source.onended = () => {
        if (epoch !== this.epoch || !this.started) return;
        this.started = false;
        this.stopTimer();
        if (this.position) { this.position = { ...this.position, elapsed: this.position.duration, playing: false }; this.onProgress?.(this.position); }
        this.speaking(null);
        this.source = null;
        void this.api.playback(clip, "ended").catch(() => {
          if (epoch === this.epoch) this.failed();
        });
      };
      source.start();
      this.started = true;
      this.startedAt = this.context!.currentTime;
      if (this.onProgress) {
        this.position = { turnId, agent: clip.agent, duration: buffer.duration, elapsed: 0, playing: true, waveform: waveform(buffer) };
        this.onProgress(this.position);
        this.timer = setInterval(() => this.publish(), 200);
      }
      this.speaking(clip.agent);
    } catch {
      if (epoch === this.epoch && !controller.signal.aborted) {
        this.speaking(null);
        this.failed();
      }
    }
  }
  async pause() {
    await this.context?.suspend();
    this.publish(false);
    this.speaking(null);
  }
  async resume() {
    await this.context?.resume();
    this.publish(true);
    if (this.started && this.clip) this.speaking(this.clip.agent);
  }
  cancel() {
    this.epoch++;
    this.pending?.abort();
    this.pending = null;
    this.started = false;
    this.stopTimer(); this.position = null; this.onProgress?.(null);
    this.source?.stop();
    this.source?.disconnect();
    this.source = null;
    this.clip = null;
    this.speaking(null);
  }
  async close() {
    this.cancel();
    await this.context?.close();
    this.context = null;
  }
}
