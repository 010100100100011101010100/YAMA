import asyncio
import io
import logging
import wave
from urllib.parse import urlsplit
import aiohttp
from livekit.agents import APIConnectOptions
from livekit.plugins import sarvam

SPEAKERS = {"saathi": "priya", "drishti": "shubh", "disha": "suhani"}
LANGUAGES = {"en": ("en-IN", "transcribe"), "hi": ("hi-IN", "verbatim"), "hinglish": ("unknown", "codemix")}
NO_RETRY = APIConnectOptions(max_retry=0, timeout=15)

def require_live(environment):
    if any(environment.get(key) != "true" for key in ("YAMA_DEMO_ONLY", "YAMA_VOICE_LIVE_ENABLED", "YAMA_SARVAM_DATA_POLICY_ACKNOWLEDGED")) or len(environment.get("SARVAM_API_KEY", "")) < 8:
        raise ValueError("voice_not_configured")

class BoundedResponse(aiohttp.ClientResponse):
    async def read(self):
        if self._body is None:
            chunks, size = [], 0
            async for chunk in self.content.iter_chunked(65536):
                size += len(chunk)
                if size > 4_500_000:
                    self.close()
                    raise ValueError("voice_audio_limit")
                chunks.append(chunk)
            self._body = b"".join(chunks)
        return self._body

class VoiceHttpSession(aiohttp.ClientSession):
    async def _request(self, method, url, **kwargs):
        parsed = urlsplit(str(url))
        if parsed.hostname != "api.sarvam.ai" or parsed.scheme not in {"https", "wss"} or parsed.username or parsed.password:
            raise ValueError("invalid_voice_destination")
        kwargs["allow_redirects"] = False
        return await super()._request(method, url, **kwargs)

def transcription_provider(key, language, http):
    code, mode = LANGUAGES[language]
    return sarvam.STT(api_key=key, model="saaras:v4", language=code, mode=mode, sample_rate=16000, high_vad_sensitivity=True, flush_signal=True, http_session=http)

async def synthesize(text, agent, language, key, http):
    if agent not in SPEAKERS or language not in LANGUAGES or not isinstance(text, str) or not 1 <= len(text.encode("utf-16-le")) // 2 <= 2500:
        raise ValueError("voice_text_limit")
    # Disable SDK diagnostics: some provider errors contain request/transcript text.
    logging.disable(logging.CRITICAL)
    tts = sarvam.TTS(api_key=key, model="bulbul:v3", speaker=SPEAKERS[agent], target_language_code="en-IN" if language == "en" else "hi-IN",
                     speech_sample_rate=16000, output_audio_codec="wav", pace=1.0, enable_cached_responses=False, http_session=http)
    stream = tts.synthesize(text, conn_options=NO_RETRY)
    pcm, size = [], 0
    try:
        async with asyncio.timeout(25):
            async for packet in stream:
                frame = packet.frame
                if frame.sample_rate != 16000 or frame.num_channels != 1:
                    raise ValueError("invalid_voice_audio")
                content = bytes(frame.data)
                size += len(content)
                if size > 2_880_000:
                    raise ValueError("voice_audio_limit")
                pcm.append(content)
        if not size:
            raise ValueError("invalid_voice_audio")
        target = io.BytesIO()
        with wave.open(target, "wb") as output:
            output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000); output.writeframes(b"".join(pcm))
        return target.getvalue()
    finally:
        await stream.aclose(); await tts.aclose()
