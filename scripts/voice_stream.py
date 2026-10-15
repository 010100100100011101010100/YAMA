import asyncio
import json
import logging
import os
import sys
from urllib.parse import urlsplit
from livekit import rtc
from livekit.agents import stt
from yama_voice.providers import require_live, transcription_provider, VoiceHttpSession, BoundedResponse, NO_RETRY, LANGUAGES

def emit(kind, text=None):
    if text is not None and (not isinstance(text, str) or not 1 <= len(text.encode("utf-16-le")) // 2 <= 6000): raise ValueError("transcript_limit")
    print(json.dumps({"type": kind, **({"text": text} if text is not None else {})}, ensure_ascii=False), flush=True)

async def run(bindings):
    require_live(os.environ)
    if set(bindings) != {"url", "token", "identity", "language", "seconds"}: raise ValueError("invalid_request")
    url = urlsplit(bindings["url"])
    if url.scheme != "ws" or url.hostname not in {"127.0.0.1", "localhost"} or bindings["language"] not in LANGUAGES or type(bindings["seconds"]) is not int or not 1 <= bindings["seconds"] <= 180: raise ValueError("invalid_request")
    room, stopped = rtc.Room(), asyncio.Event()
    tasks = set(); failure = []; streamed = False
    async with VoiceHttpSession(trust_env=False, response_class=BoundedResponse) as http:
        provider = transcription_provider(os.environ["SARVAM_API_KEY"], bindings["language"], http)
        async def consume(track):
            stream = provider.stream(conn_options=NO_RETRY)
            audio = rtc.AudioStream.from_track(track=track, sample_rate=16000, num_channels=1, capacity=50)
            async def feed():
                frames = 0
                async for packet in audio:
                    frames += packet.frame.samples_per_channel
                    if frames > 16000 * bindings["seconds"]: raise ValueError("voice_duration_limit")
                    stream.push_frame(packet.frame)
                stream.end_input()
            feeding = asyncio.create_task(feed())
            def feed_finished(task):
                if not task.cancelled() and task.exception() is not None: failure.append(True); stopped.set()
            feeding.add_done_callback(feed_finished)
            try:
                async for event in stream:
                    if event.type == stt.SpeechEventType.START_OF_SPEECH: emit("speech_start")
                    if event.type in {stt.SpeechEventType.INTERIM_TRANSCRIPT, stt.SpeechEventType.FINAL_TRANSCRIPT} and event.alternatives:
                        text = event.alternatives[0].text
                        if text.strip(): emit("partial" if event.type == stt.SpeechEventType.INTERIM_TRANSCRIPT else "final", text)
            except Exception:
                failure.append(True); stopped.set()
            finally:
                feeding.cancel(); await asyncio.gather(feeding, return_exceptions=True); await audio.aclose(); await stream.aclose()
        @room.on("track_subscribed")
        def subscribed(track, publication, participant):
            nonlocal streamed
            if participant.identity != bindings["identity"] or track.kind != rtc.TrackKind.KIND_AUDIO or publication.source != rtc.TrackSource.SOURCE_MICROPHONE: return
            # One provider connection per budget reservation. Muting keeps the
            # track; replacing it requires an explicit new application session.
            if streamed: failure.append(True); stopped.set(); return
            streamed = True
            task = asyncio.create_task(consume(track)); tasks.add(task)
        @room.on("disconnected")
        def disconnected(*_): stopped.set()
        @room.on("participant_disconnected")
        def participant_disconnected(participant):
            if participant.identity == bindings["identity"]: stopped.set()
        try:
            await room.connect(bindings["url"], bindings["token"], options=rtc.RoomOptions(auto_subscribe=True, connect_timeout=10, single_peer_connection=True))
            emit("ready")
            async with asyncio.timeout(bindings["seconds"]): await stopped.wait()
            if failure: raise ValueError("voice_stream_failed")
        except TimeoutError: pass
        finally:
            for task in tasks: task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True); await room.disconnect(); await provider.aclose()

if __name__ == "__main__":
    logging.disable(logging.CRITICAL)
    try:
        raw = sys.stdin.buffer.readline(16385)
        if len(raw) > 16384: raise ValueError("invalid_request")
        asyncio.run(run(json.loads(raw)))
    except Exception: emit("failed"); sys.exit(1)
