import { describe, expect, it, vi } from "vitest";
import { VoicePlayer } from "@/lib/voice-player";
import type { VoiceApi } from "@/lib/voice-api";
import type { VoiceClip } from "@/lib/voice";
const clip: VoiceClip = {
  id: "clip",
  nonce: crypto.randomUUID(),
  turnId: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
  reportId: crypto.randomUUID(),
  revision: 1,
  agent: "saathi",
  speaker: "priya",
  durationMs: 100,
  sha256: "a".repeat(64),
};
function setup(onProgress?: ConstructorParameters<typeof VoicePlayer>[4]) {
  const source = {
    onended: null as (() => void) | null,
    buffer: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(() => source.onended?.()),
  };
  const context = {
    state: "running",
    currentTime: 0,
    resume: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    destination: {},
    decodeAudioData: vi.fn(async () => ({ duration: 0.1, getChannelData: () => Float32Array.from({ length: 400 }, (_, index) => Math.sin(index / 9)) })),
    createBufferSource: vi.fn(() => source),
  };
  const api = {
    speech: vi.fn(async () => clip),
    audio: vi.fn(async () => new ArrayBuffer(4)),
    playback: vi.fn(async () => {}),
  } as unknown as VoiceApi;
  const speaking = vi.fn(),
    failed = vi.fn();
  return {
    source,
    context,
    api,
    speaking,
    failed,
    player: new VoicePlayer(
      api,
      speaking,
      failed,
      () => context as unknown as AudioContext,
      onProgress,
    ),
  };
}
describe("actual voice playback boundary", () => {
  it("drives the voice-note waveform and position from decoded audio and the real audio clock", async () => {
    vi.useFakeTimers();
    try {
      const progress = vi.fn(), test = setup(progress);
      await test.player.play(clip.reportId, clip.sessionId, clip.turnId, 1);
      expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ duration: .1, elapsed: 0, playing: true, waveform: expect.any(Array) }));
      expect(progress.mock.lastCall![0].waveform).toHaveLength(40);
      test.context.currentTime = .04;
      vi.advanceTimersByTime(200);
      expect(progress.mock.lastCall![0].elapsed).toBe(.04);
      await test.player.pause();
      expect(progress.mock.lastCall![0].playing).toBe(false);
      test.player.cancel();
      expect(progress).toHaveBeenLastCalledWith(null);
    } finally { vi.useRealTimers(); }
  });
  it("acknowledges a handoff only on completed audio, never when preparation begins", async () => {
    const test = setup();
    await test.player.play(clip.reportId, clip.sessionId, clip.turnId, 1);
    expect(test.api.playback).toHaveBeenCalledExactlyOnceWith(clip, "started");
    expect(test.source.start).toHaveBeenCalledOnce();
    test.source.onended?.();
    await Promise.resolve();
    expect(test.api.playback).toHaveBeenLastCalledWith(clip, "ended");
  });
  it("never acknowledges completion when a user interrupts or changes agent", async () => {
    const test = setup();
    await test.player.play(clip.reportId, clip.sessionId, clip.turnId, 1);
    test.player.cancel();
    expect(test.api.playback).toHaveBeenCalledExactlyOnceWith(clip, "started");
    expect(test.speaking).toHaveBeenLastCalledWith(null);
  });
  it("ignores a stale speech result after cancellation", async () => {
    const test = setup();
    let resolve!: (value: VoiceClip) => void;
    test.api.speech = vi.fn(
      () =>
        new Promise<VoiceClip>((done) => {
          resolve = done;
        }),
    );
    const playing = test.player.play(
      clip.reportId,
      clip.sessionId,
      clip.turnId,
      1,
    );
    await Promise.resolve();
    await Promise.resolve();
    test.player.cancel();
    resolve(clip);
    await playing;
    expect(test.source.start).not.toHaveBeenCalled();
    expect(test.api.playback).not.toHaveBeenCalled();
  });
  it("preserves text fallback after decoding fails", async () => {
    const test = setup();
    test.context.decodeAudioData.mockRejectedValueOnce(
      new Error("invalid audio"),
    );
    await test.player.play(clip.reportId, clip.sessionId, clip.turnId, 1);
    expect(test.failed).toHaveBeenCalledOnce();
    expect(test.api.playback).not.toHaveBeenCalled();
  });
});
