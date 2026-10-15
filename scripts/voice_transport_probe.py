"""Local RTC verification with synthetic silence; no microphone/provider access."""
import asyncio
import json
import logging
import sys
from urllib.parse import urlsplit
from livekit import rtc
def phase(name):print("PHASE:"+name,file=sys.stderr,flush=True)

async def run(bindings):
    phase("request-read")
    if set(bindings) != {"url", "clientToken", "workerToken", "identity"}: raise ValueError
    parsed=urlsplit(bindings["url"])
    if parsed.scheme!="ws" or parsed.hostname!="127.0.0.1":raise ValueError
    client,worker=rtc.Room(),rtc.Room(); received=asyncio.Event();tasks=[];phase("rooms-created")
    async def consume(track):
        stream=rtc.AudioStream.from_track(track=track,sample_rate=16000,num_channels=1,capacity=20)
        try:
            async for packet in stream:
                if packet.frame.samples_per_channel>0: phase("received");received.set();return
        finally:await stream.aclose()
    @worker.on("track_subscribed")
    def subscribed(track,publication,participant):
        if participant.identity==bindings["identity"] and publication.source==rtc.TrackSource.SOURCE_MICROPHONE:tasks.append(asyncio.create_task(consume(track)))
    source=rtc.AudioSource(16000,1);phase("source-created")
    try:
        await asyncio.wait_for(asyncio.gather(
            worker.connect(bindings["url"],bindings["workerToken"],options=rtc.RoomOptions(connect_timeout=8,single_peer_connection=True)),
            client.connect(bindings["url"],bindings["clientToken"],options=rtc.RoomOptions(connect_timeout=8,single_peer_connection=True)),
        ),10);phase("worker-joined");phase("client-joined")
        track=rtc.LocalAudioTrack.create_audio_track("synthetic-silence",source)
        await client.local_participant.publish_track(track,rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        phase("published")
        async with asyncio.timeout(10):
            for _ in range(250):
                await source.capture_frame(rtc.AudioFrame(data=bytes(640),sample_rate=16000,num_channels=1,samples_per_channel=320))
                if received.is_set():break
            await received.wait()
        return {"connected":True,"syntheticAudioReceived":True}
    finally:
        phase("cleanup-begin")
        for task in tasks:task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
        await asyncio.wait_for(source.aclose(),2)
        phase("cleanup-client");await asyncio.wait_for(client.disconnect(),2)
        phase("cleanup-worker");await asyncio.wait_for(worker.disconnect(),2);phase("closed")

if __name__=="__main__":
    logging.disable(logging.CRITICAL)
    try:print(json.dumps(asyncio.run(run(json.loads(sys.stdin.buffer.read(16385))))))
    except Exception:print(json.dumps({"error":"local_transport_failed"}));sys.exit(1)
