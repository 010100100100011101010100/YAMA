"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  LocalAudioTrack,
  createAudioAnalyser,
  setLogLevel,
} from "livekit-client";
import { voiceApi, type VoiceApi } from "./voice-api";
import type { VoiceView } from "./voice";
import type { SavedReport } from "./report-api";
import type { Dialogue } from "./dialogue";
import { VoicePlayer } from "./voice-player";

export function useVoice(
  report: SavedReport | null,
  dialogue: Dialogue | null,
  language: VoiceView["language"],
  onReport: (report: SavedReport) => void,
  onSpeaking: (agent: Dialogue["activeAgent"] | null) => void,
  api: VoiceApi = voiceApi,
) {
  const [enabled, setEnabled] = useState(false),
    [configured, setConfigured] = useState(false),
    [session, setSession] = useState<VoiceView | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [muted, setMuted] = useState(false),
    [paused, setPaused] = useState(false),
    [connected, setConnected] = useState(false);
  const mounted = useRef(true),
    room = useRef<Room | null>(null),
    current = useRef<VoiceView | null>(null),
    reportRef = useRef(report),
    callback = useRef(onReport),
    key = useRef<string | null>(null),
    analysis = useRef<ReturnType<typeof createAudioAnalyser> | null>(null),
    audioTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [player] = useState(
    () => new VoicePlayer(api, onSpeaking, () => setError("speech_failed")),
  );
  const connectionEpoch = useRef(0);
  useEffect(() => {
    reportRef.current = report;
    callback.current = onReport;
  }, [report, onReport]);
  const receive = useCallback((voice: VoiceView | null) => {
    current.current = voice;
    if (mounted.current) setSession(voice);
  }, []);
  const disconnect = useCallback(async () => {
    player.cancel();
    if (mounted.current) setConnected(false);
    if (audioTimer.current) clearInterval(audioTimer.current);
    audioTimer.current = null;
    await analysis.current?.cleanup();
    analysis.current = null;
    const previous = room.current;
    room.current = null;
    await previous?.disconnect();
  }, [player]);
  const stop = useCallback(
    async (operation: "stop" | "text" = "stop") => {
      connectionEpoch.current++;
      await disconnect();
      const voice = current.current;
      if (voice) {
        try {
          receive(await api.control(voice.reportId, voice.id, operation));
        } catch {
          if (mounted.current) setError("voice_unavailable");
        }
      }
    },
    [api, disconnect, receive],
  );
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    api
      .config(controller.signal)
      .then((config) => {
        if (!controller.signal.aborted) {
          setEnabled(config.enabled);
          setConfigured(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError("voice_unavailable");
          setConfigured(true);
        }
      });
    return () => {
      mounted.current = false;
      controller.abort();
      void stop("text");
      void player.close();
    };
  }, [api, player, stop]);
  const reportId = report?._id;
  useEffect(() => {
    if (!reportId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const voice = await api.get(reportId!, controller.signal);
        if (controller.signal.aborted) return;
        receive(voice);
        if (
          voice &&
          !["queued", "listening"].includes(voice.status) &&
          room.current
        ) {
          await disconnect();
          if (mounted.current) setError("voice_stopped");
        }
        timer = setTimeout(poll, 2000);
      } catch {
        if (!controller.signal.aborted) {
          setError("voice_unavailable");
          await disconnect();
        }
      }
    }
    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [api, reportId, receive, disconnect]);
  const turnId = dialogue?.turn?.id,
    turnStatus = dialogue?.turn?.status,
    turnRevision = dialogue?.turn?.revision;
  useEffect(() => {
    const voice = current.current;
    if (
      voice &&
      connected &&
      voice.status === "listening" &&
      dialogue?.voiceSessionId === voice.id &&
      turnStatus === "ready" &&
      turnRevision !== undefined &&
      turnRevision === report?.revision &&
      turnId
    ) {
      void player.play(voice.reportId, voice.id, turnId, turnRevision);
    } else player.cancel();
    return () => player.cancel();
  }, [
    dialogue?.voiceSessionId,
    turnId,
    turnStatus,
    turnRevision,
    dialogue?.version,
    report?.revision,
    session?.status,
    connected,
    player,
  ]);
  useEffect(() => {
    if (
      current.current &&
      room.current &&
      current.current.language !== language
    )
      void stop("text");
  }, [language, stop]);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") {
        void room.current?.localParticipant.setMicrophoneEnabled(false);
        void player.pause();
        setMuted(true);
        setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [player]);
  async function connect() {
    if (!enabled || busy) return;
    setBusy(true);
    setError("");
    const epoch = ++connectionEpoch.current;
    try {
      await player.unlock();
      key.current ??= crypto.randomUUID();
      const started = await api.start(reportRef.current, language, key.current);
      key.current = null;
      receive(started.session);
      callback.current(started.report);
      if (!mounted.current || epoch !== connectionEpoch.current) {
        await api.control(started.report._id, started.session.id, "text");
        return;
      }
      setLogLevel("silent");
      const connection = new Room({
        singlePeerConnection: true,
        reconnectPolicy: { nextRetryDelayInMs: () => null },
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      room.current = connection;
      connection.on(RoomEvent.Disconnected, () => {
        if (room.current === connection) {
          room.current = null;
          player.cancel();
          if (mounted.current) {
            setConnected(false);
            setError("voice_stopped");
          }
          void api
            .control(started.report._id, started.session.id, "text")
            .catch(() => undefined);
        }
      });
      await connection.connect(started.url, started.token, {
        autoSubscribe: false,
      });
      // The transport worker must join before sending the first microphone frames.
      for (let attempt = 0; attempt < 15; attempt++) {
        if (
          !mounted.current ||
          room.current !== connection ||
          epoch !== connectionEpoch.current
        )
          throw new Error("voice_stopped");
        const state = await api.get(
          started.report._id,
          new AbortController().signal,
        );
        if (state) receive(state);
        if (state?.status === "listening") break;
        if (!state || state.status !== "queued" || attempt === 14)
          throw new Error("voice_stopped");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (epoch !== connectionEpoch.current) throw new Error("voice_stopped");
      await connection.localParticipant.setMicrophoneEnabled(true);
      if (epoch !== connectionEpoch.current) {
        await connection.disconnect();
        return;
      }
      setMuted(false);
      setConnected(true);
      setPaused(false);
      const microphone = connection.localParticipant.getTrackPublication(
        Track.Source.Microphone,
      )?.track;
      if (microphone instanceof LocalAudioTrack) {
        analysis.current = createAudioAnalyser(microphone, { fftSize: 256 });
        let loud = 0;
        audioTimer.current = setInterval(() => {
          const volume = analysis.current?.calculateVolume() ?? 0;
          loud = volume > 0.07 ? loud + 1 : 0;
          if (loud >= 2 && player.playing) {
            player.cancel();
            const voice = current.current;
            if (voice)
              void api
                .control(voice.reportId, voice.id, "interrupt")
                .catch(() => undefined);
          }
        }, 100);
      }
    } catch {
      if (epoch === connectionEpoch.current) {
        await stop("text");
        if (mounted.current) setError("voice_unavailable");
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function accept(utteranceId: string, text: string) {
    const voice = current.current;
    if (!voice || !reportRef.current || busy) return false;
    setBusy(true);
    setError("");
    try {
      const response = await api.accept(
        voice.reportId,
        voice.id,
        utteranceId,
        reportRef.current.revision,
        text,
      );
      receive(response.session);
      callback.current(response.report);
      return true;
    } catch {
      setError("transcript_not_saved");
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function discard(utteranceId: string) {
    const voice = current.current;
    if (voice)
      try {
        receive(
          await api.control(voice.reportId, voice.id, "discard", utteranceId),
        );
      } catch {
        setError("transcript_not_saved");
      }
  }
  async function interrupt() {
    player.cancel();
    const voice = current.current;
    if (voice)
      try {
        receive(await api.control(voice.reportId, voice.id, "interrupt"));
      } catch {
        if (mounted.current) setError("voice_unavailable");
      }
  }
  async function toggleMicrophone() {
    const connection = room.current;
    if (!connection) return;
    try {
      const next = !muted;
      if (!next) await interrupt();
      await connection.localParticipant.setMicrophoneEnabled(!next);
      setMuted(next);
    } catch {
      setError("voice_unavailable");
    }
  }
  async function togglePause() {
    try {
      if (paused) await player.resume();
      else await player.pause();
      setPaused(!paused);
    } catch {
      setError("speech_failed");
    }
  }
  function replay() {
    const voice = current.current,
      turn = dialogue?.turn;
    if (voice && turn?.status === "ready") {
      setError("");
      void player.play(voice.reportId, voice.id, turn.id, turn.revision);
    }
  }
  return {
    enabled,
    configured,
    session,
    error,
    busy,
    muted,
    paused,
    connected,
    connect,
    stop,
    accept,
    discard,
    interrupt,
    toggleMicrophone,
    togglePause,
    replay,
  };
}
