import type { VoiceApi } from "./voice-api";
import type { VoiceClip } from "./voice";
// Own one actual Web Audio source. stop() also fires onended, so generation and
// interruption guards must run before stopping and before sending any receipt.
export class VoicePlayer {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private pending: AbortController | null = null;
  private epoch = 0;
  private clip: VoiceClip | null = null;
  private started = false;
  constructor(
    private readonly api: VoiceApi,
    private readonly speaking: (agent: VoiceClip["agent"] | null) => void,
    private readonly failed: () => void,
    private readonly makeContext: () => AudioContext = () => new AudioContext(),
  ) {}
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
        this.speaking(null);
        this.source = null;
        void this.api.playback(clip, "ended").catch(() => {
          if (epoch === this.epoch) this.failed();
        });
      };
      source.start();
      this.started = true;
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
    this.speaking(null);
  }
  async resume() {
    await this.context?.resume();
    if (this.started && this.clip) this.speaking(this.clip.agent);
  }
  cancel() {
    this.epoch++;
    this.pending?.abort();
    this.pending = null;
    this.started = false;
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
