"""Decode only a partial JSON text field. Tool decisions remain unavailable until validation."""
import time
import jiter
from yama_agents.backend import BackendError
from yama_agents.fixture_model import utf16_length


class TextProgress:
    def __init__(self, callback):
        self.callback = callback
        self.raw = ''
        self.previous = ''
        self.last_emit = 0

    def feed(self, delta):
        if not isinstance(delta, str): raise BackendError('invalid_model_output')
        self.raw += delta
        if len(self.raw.encode('utf-8')) > 256*1024: raise BackendError('invalid_model_output')
        try:
            parsed = jiter.from_json(self.raw.encode('utf-8'), partial_mode='trailing-strings')
        except ValueError:
            return
        text = parsed.get('text') if isinstance(parsed, dict) else None
        if not isinstance(text, str): return
        if utf16_length(text) > 4000 or not text.startswith(self.previous): raise BackendError('invalid_model_output')
        # Do not expose a split surrogate or an incomplete escaped JSON sequence.
        if any(0xD800 <= ord(char) <= 0xDFFF for char in text): return
        now = time.monotonic()
        if text != self.previous and now-self.last_emit >= 0.08:
            self.callback(text)
            self.previous, self.last_emit = text, now
