"use client";
import { useEffect, useState } from "react";
import { Mic, MicOff, PhoneOff, Square, Pause, Play } from "lucide-react";
import { Button } from "@/components/atoms/Button";
import type { SavedReport } from "@/lib/report-api";
import type { Dialogue } from "@/lib/dialogue";
import type { Language } from "@/lib/demo-state";
import type { VoiceView } from "@/lib/voice";
import { useVoice } from "@/lib/use-voice";
import { voiceCopy } from "@/lib/voice-copy";
import type { VoiceApi } from "@/lib/voice-api";
import { VoiceNote } from "@/components/ui/voice-note";
import { AGENT_NAMES } from "./AgentRail";

function TranscriptReview({
  transcript,
  language,
  busy,
  onSave,
  onDiscard,
}: {
  transcript: VoiceView["transcripts"][number];
  language: Language;
  busy: boolean;
  onSave: (text: string) => void;
  onDiscard: () => void;
}) {
  const [words, setWords] = useState(transcript.text),
    copy = voiceCopy[language];
  return (
    <section className="voice-transcript detail-edit">
      <label htmlFor={`voice-${transcript.id}`}>{copy.review}</label>
      <textarea
        id={`voice-${transcript.id}`}
        rows={3}
        value={words}
        maxLength={6000}
        disabled={busy}
        onChange={(event) => setWords(event.target.value)}
        dir="auto"
      />
      <details>
        <summary>{copy.original}</summary>
        <p
          dir="auto"
          style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
        >
          {transcript.text}
        </p>
      </details>
      <p>{copy.note}</p>
      <div className="voice-controls">
        <Button
          variant="primary"
          disabled={busy || !words.trim()}
          onClick={() => onSave(words)}
        >
          {copy.save}
        </Button>
        <Button disabled={busy} onClick={onDiscard}>
          {copy.discard}
        </Button>
      </div>
    </section>
  );
}
export default function VoiceCall({
  report,
  dialogue,
  language,
  disabled,
  onReport,
  onSpeaking,
  onText,
  onBusy,
  onControl,
  api,
}: {
  report: SavedReport | null;
  dialogue: Dialogue | null;
  language: Language;
  disabled: boolean;
  onReport: (report: SavedReport) => void;
  onSpeaking: (agent: Dialogue["activeAgent"] | null) => void;
  onText: () => void;
  onBusy: (busy: boolean) => void;
  onControl: (stop: (() => Promise<void>) | null) => void;
  api?: VoiceApi;
}) {
  const voice = useVoice(report, dialogue, language, onReport, onSpeaking, api),
    copy = voiceCopy[language];
  const stopVoice = voice.stop;
  useEffect(() => {
    onBusy(voice.busy);
    return () => onBusy(false);
  }, [onBusy, voice.busy]);
  useEffect(() => {
    onControl(() => stopVoice("text"));
    return () => onControl(null);
  }, [onControl, stopVoice]);
  const proposed = voice.session?.transcripts.find(
    (transcript) => transcript.status === "proposed",
  );
  return (
    <section
      className="live-voice"
      aria-label={language === "hi" ? "वॉइस कॉल" : "Voice call"}
    >
      <p className="voice-note">{copy.privacy}</p>
      {!voice.configured ? (
        <p role="status">{copy.loading}</p>
      ) : !voice.enabled ? (
        <p role="status">{copy.setup}</p>
      ) : null}
      <div className="voice-controls">
        <Button
          variant="primary"
          disabled={!voice.enabled || voice.busy || disabled || voice.connected}
          onClick={() => void voice.connect()}
        >
          <Mic size={18} />
          {copy.connect}
        </Button>
        {voice.connected && (
          <>
            <Button onClick={() => void voice.toggleMicrophone()}>
              {voice.muted ? <MicOff size={18} /> : <Mic size={18} />}{" "}
              {voice.muted ? copy.unmute : copy.mute}
            </Button>
            <Button onClick={() => void voice.interrupt()}>
              <Square size={16} />
              {copy.interrupt}
            </Button>
            <Button onClick={() => void voice.togglePause()}>
              {voice.paused ? <Play size={16} /> : <Pause size={16} />}{" "}
              {voice.paused ? copy.resume : copy.pause}
            </Button>
            <Button onClick={() => void voice.stop()}>
              <PhoneOff size={16} />
              {copy.end}
            </Button>
          </>
        )}
        <Button onClick={() => void voice.stop("text").finally(onText)}>
          {copy.text}
        </Button>
      </div>
      <p className="voice-state" role="status">
        {voice.session?.status === "listening"
          ? copy.listening
          : voice.session?.status === "queued"
            ? copy.queued
            : voice.session
              ? copy.stopped
              : ""}
      </p>
      {voice.error && (
        <div role="alert">
          <p>{copy.error}</p>
          {voice.connected && dialogue?.turn?.status === "ready" && (
            <Button onClick={voice.replay}>{copy.play}</Button>
          )}
        </div>
      )}
      {voice.playback && <div className="voice-playback dark">
        <p>{AGENT_NAMES[voice.playback.agent]}</p>
        <VoiceNote className="w-full max-w-sm" duration={voice.playback.duration} playbackPosition={voice.playback.elapsed}
          waveform={voice.playback.waveform} playing={voice.playback.playing} seekable={false} speeds={[1]} accent="var(--signal)"
          onPlayingChange={() => void voice.togglePause()} />
      </div>}
      {voice.session?.partial && (
        <p role="status" dir="auto">
          {copy.partial} {voice.session.partial}
        </p>
      )}
      {proposed && (
        <TranscriptReview
          key={proposed.id}
          transcript={proposed}
          language={language}
          busy={voice.busy || disabled}
          onSave={(text) => void voice.accept(proposed.id, text)}
          onDiscard={() => void voice.discard(proposed.id)}
        />
      )}
    </section>
  );
}
