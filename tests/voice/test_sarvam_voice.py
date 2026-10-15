"""Exercise the installed Sarvam SDK with in-memory responses; no network calls."""
import base64
import io
import unittest
import wave
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace
from yama_voice.providers import (
    BoundedResponse, LANGUAGES, NO_RETRY, SPEAKERS, VoiceHttpSession,
    require_live, synthesize, transcription_provider,
)


def sample_wave():
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(bytes(3200))
    return output.getvalue()


class Response:
    def __init__(self, status=200):
        self.status = status

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def json(self):
        return {"request_id": "fixture", "audios": [base64.b64encode(sample_wave()).decode()]}

    async def text(self):
        return "fixture provider error"


class Http:
    def __init__(self, status=200):
        self.calls = []
        self.status = status

    def post(self, **request):
        self.calls.append(request)
        return Response(self.status)


class VoiceSDKTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_tts_sdk_payload_and_pcm_for_each_agent(self):
        for agent, speaker in SPEAKERS.items():
            http = Http()
            content = await synthesize("काल्पनिक बात।", agent, "hinglish", "fixture-key", http)
            with wave.open(io.BytesIO(content), "rb") as audio:
                self.assertEqual((audio.getnchannels(), audio.getframerate(), audio.getsampwidth()), (1, 16000, 2))
                self.assertGreater(audio.getnframes(), 0)
            self.assertEqual(len(http.calls), 1)
            payload = http.calls[0]["json"]
            self.assertEqual(payload["model"], "bulbul:v3")
            self.assertEqual(payload["speaker"], speaker)
            self.assertEqual(payload["target_language_code"], "hi-IN")
            self.assertEqual(payload["output_audio_codec"], "wav")

    async def test_english_voice_and_no_provider_retries(self):
        http = Http()
        await synthesize("Fictional reply.", "saathi", "en", "fixture-key", http)
        self.assertEqual(http.calls[0]["json"]["target_language_code"], "en-IN")
        failed = Http(503)
        with self.assertRaises(Exception):
            await synthesize("Fictional reply.", "saathi", "en", "fixture-key", failed)
        self.assertEqual(len(failed.calls), 1)
        self.assertEqual(NO_RETRY.max_retry, 0)

    async def test_utf16_text_limit_precedes_provider_construction(self):
        http = Http()
        for text in ("", "x" * 2501, "🦅" * 1251):
            with self.assertRaisesRegex(ValueError, "voice_text_limit"):
                await synthesize(text, "saathi", "en", "fixture-key", http)
        self.assertEqual(http.calls, [])

    async def test_stt_sdk_configuration_for_three_languages(self):
        for language, (code, mode) in LANGUAGES.items():
            provider = transcription_provider("fixture-key", language, Http())
            self.assertEqual(provider._opts.model, "saaras:v4")
            self.assertEqual(provider._opts.language, code)
            self.assertEqual(provider._opts.mode, mode)
            self.assertEqual(provider._opts.sample_rate, 16000)
            await provider.aclose()

    async def test_training_retention_acknowledgement_is_required(self):
        environment = {key: "true" for key in ("YAMA_DEMO_ONLY", "YAMA_VOICE_LIVE_ENABLED", "YAMA_SARVAM_DATA_POLICY_ACKNOWLEDGED")}
        environment["SARVAM_API_KEY"] = "fixture-key"
        require_live(environment)
        for key in environment:
            with self.assertRaisesRegex(ValueError, "voice_not_configured"):
                require_live({**environment, key: ""})

    async def test_http_destination_and_redirect_policy(self):
        async with VoiceHttpSession(trust_env=False) as http:
            for destination in ("https://other.example/", "http://api.sarvam.ai/", "https://user@api.sarvam.ai/"):
                with self.assertRaisesRegex(ValueError, "invalid_voice_destination"):
                    await http._request("POST", destination)
            with patch("aiohttp.ClientSession._request", new_callable=AsyncMock) as request:
                await http._request("POST", "https://api.sarvam.ai/text-to-speech", allow_redirects=True)
                self.assertFalse(request.call_args.kwargs["allow_redirects"])

    async def test_encoded_audio_response_has_a_memory_limit(self):
        class Content:
            async def iter_chunked(self, _):
                yield bytes(4_500_001)
        response = SimpleNamespace(_body=None, content=Content(), close=lambda: None)
        with self.assertRaisesRegex(ValueError, "voice_audio_limit"):
            await BoundedResponse.read(response)


if __name__ == "__main__":
    unittest.main()
