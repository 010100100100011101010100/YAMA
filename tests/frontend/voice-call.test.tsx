import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VoiceCall from "@/components/yama/VoiceCall";
import type { VoiceApi } from "@/lib/voice-api";
import type { VoiceView } from "@/lib/voice";
import { savedReport, reportId } from "./report-fixtures";

const transport = vi.hoisted(() => ({
  connect: vi.fn(async () => {}),
  microphone: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
}));
vi.mock("livekit-client", () => ({
  Room: class {
    connect = transport.connect;
    disconnect = transport.disconnect;
    on() {
      return this;
    }
    localParticipant = {
      setMicrophoneEnabled: transport.microphone,
      getTrackPublication: () => null,
    };
  },
  RoomEvent: { Disconnected: "disconnected" },
  Track: { Source: { Microphone: "microphone" } },
  LocalAudioTrack: class {},
  createAudioAnalyser: vi.fn(),
  setLogLevel: vi.fn(),
}));
const voice: VoiceView = {
  id: crypto.randomUUID(),
  reportId,
  revision: 1,
  language: "en",
  status: "stopped",
  expiresAt: new Date(Date.now() + 120000).toISOString(),
  partial: "",
  errorCode: null,
  transcripts: [
    {
      id: crypto.randomUUID(),
      text: "Fictional: paid ₹8000.",
      status: "proposed",
    },
  ],
};
function gateway(enabled = false): VoiceApi {
  return {
    config: vi.fn(async () => ({
      enabled,
      seconds: 120,
      speakers: { saathi: "priya", drishti: "shubh", disha: "suhani" } as const,
    })),
    get: vi.fn(async () => voice),
    control: vi.fn(async () => voice),
    start: vi.fn(async () => ({
      report: savedReport(),
      session: { ...voice, status: "queued" as const },
      url: "ws://127.0.0.1:7880",
      token: "fixture-not-real",
    })),
    accept: vi.fn(async () => ({
      report: savedReport(2),
      session: { ...voice, revision: 2, transcripts: [] },
    })),
    speech: vi.fn(),
    audio: vi.fn(),
    playback: vi.fn(),
  };
}
function show(api: VoiceApi) {
  const onReport = vi.fn(),
    onText = vi.fn();
  return {
    ...render(
      <VoiceCall
        report={savedReport()}
        dialogue={null}
        language="en"
        disabled={false}
        api={api}
        onReport={onReport}
        onSpeaking={vi.fn()}
        onText={onText}
        onBusy={vi.fn()}
        onControl={vi.fn()}
      />,
    ),
    onReport,
    onText,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "AudioContext",
    class {
      resume = async () => {};
      close = async () => {};
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
describe("voice controls and explicit review", () => {
  it("keeps the microphone off when setup is disabled and offers chat", async () => {
    const api = gateway(),
      view = show(api),
      user = userEvent.setup();
    expect(
      await screen.findByText(/Voice is not available in this demo yet/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect voice" }),
    ).toBeDisabled();
    expect(transport.connect).not.toHaveBeenCalled();
    expect(transport.microphone).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Use chat instead" }));
    expect(view.onText).toHaveBeenCalledOnce();
  });
  it("does not save STT automatically and submits the user's edited words explicitly", async () => {
    const api = gateway(),
      view = show(api),
      user = userEvent.setup();
    const input = await screen.findByRole("textbox", {
      name: "Check the transcribed words",
    });
    expect(api.accept).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, "Fictional: paid ₹7000.");
    await user.click(
      screen.getByRole("button", { name: "Save reviewed words" }),
    );
    expect(api.accept).toHaveBeenCalledWith(
      reportId,
      voice.id,
      voice.transcripts[0].id,
      1,
      "Fictional: paid ₹7000.",
    );
    expect(view.onReport).toHaveBeenCalledWith(savedReport(2));
    expect(api.playback).not.toHaveBeenCalled();
  });
  it("cancels a delayed connection when the user chooses chat", async () => {
    const api = gateway(true),
      user = userEvent.setup();
    let finish!: (response: Awaited<ReturnType<VoiceApi["start"]>>) => void;
    vi.mocked(api.start).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = show(api);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Connect voice" }),
      ).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Connect voice" }));
    await user.click(screen.getByRole("button", { name: "Use chat instead" }));
    await act(async () =>
      finish({
        report: savedReport(),
        session: { ...voice, status: "queued" },
        url: "ws://127.0.0.1:7880",
        token: "fixture-not-real",
      }),
    );
    expect(transport.connect).not.toHaveBeenCalled();
    expect(transport.microphone).not.toHaveBeenCalled();
    expect(api.control).toHaveBeenLastCalledWith(reportId, voice.id, "text");
    expect(view.onText).toHaveBeenCalledOnce();
  });
});
