import asyncio
import json
import logging
import os
import sys
from yama_voice.providers import require_live, synthesize, VoiceHttpSession, BoundedResponse

async def run():
    require_live(os.environ)
    raw = sys.stdin.buffer.read(16385)
    if len(raw) > 16384: raise ValueError("voice_text_limit")
    request = json.loads(raw)
    if set(request) != {"text", "agent", "language"}: raise ValueError("invalid_request")
    async with VoiceHttpSession(trust_env=False, response_class=BoundedResponse) as http:
        return await synthesize(request["text"], request["agent"], request["language"], os.environ["SARVAM_API_KEY"], http)

if __name__ == "__main__":
    logging.disable(logging.CRITICAL)
    try: sys.stdout.buffer.write(asyncio.run(run()))
    except Exception: sys.exit(1)
