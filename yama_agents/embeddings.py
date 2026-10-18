"""Local-only multilingual E5 encoder. Model code and weights are never fetched at runtime."""
import hashlib
import json
import math
import os
import fcntl
import time
from pathlib import Path

MODEL = 'intfloat/multilingual-e5-small'
REVISION = '614241f622f53c4eeff9890bdc4f31cfecc418b3'
DIMENSIONS = 384


def text_hash(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def validate_vector(vector):
    if not isinstance(vector, list) or len(vector) != DIMENSIONS or any(type(value) not in (int, float) or not math.isfinite(value) for value in vector):
        raise ValueError('invalid_embedding')


def query_embedding(text):
    """Cache derived vectors only, with one encoder process per host and a bounded wait."""
    directory = Path('.local/embedding-cache')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    key = text_hash(REVISION+'\n'+text)
    path = directory / (key+'.json')
    with (directory / 'encoder.lock').open('a') as lock:
        deadline = time.monotonic()+5
        while True:
            try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB); break
            except BlockingIOError:
                if time.monotonic() > deadline: raise ValueError('semantic_busy')
                time.sleep(0.1)
        if path.exists() and time.time()-path.stat().st_mtime < 86400:
            try:
                vector = json.loads(path.read_text())
                validate_vector(vector)
                return vector
            except (ValueError, OSError): pass
        vector = LocalEmbeddings().encode(text, query=True)
        path.write_text(json.dumps(vector)); path.chmod(0o600)
        # Only this implementation's opaque vector-cache files are eligible for eviction.
        for index, old in enumerate(sorted(directory.glob('*.json'), key=lambda file: file.stat().st_mtime, reverse=True)):
            if index >= 128 or time.time()-old.stat().st_mtime >= 86400: old.unlink()
        return vector


class LocalEmbeddings:
    def __init__(self):
        import torch
        from transformers import AutoModel, AutoTokenizer
        directory = Path(os.environ['YAMA_SEMANTIC_MODEL_PATH'])
        manifest = json.loads((directory / 'yama-model.json').read_text())
        if manifest.get('model') != MODEL or manifest.get('revision') != REVISION:
            raise ValueError('model_mismatch')
        torch.set_num_threads(2)
        self.torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(directory, local_files_only=True, trust_remote_code=False)
        self.model = AutoModel.from_pretrained(directory, local_files_only=True, trust_remote_code=False, use_safetensors=True).eval()

    def encode(self, text, *, query):
        if not isinstance(text, str) or not 1 <= len(text) <= 6000:
            raise ValueError('embedding_input_limit')
        torch = self.torch
        prefix = 'query: ' if query else 'passage: '
        # Token chunks preserve all accepted text instead of silently truncating long/Hindi accounts.
        tokens = self.tokenizer.encode(text, add_special_tokens=False)
        chunks = [self.tokenizer.decode(tokens[start:start+440]) for start in range(0, len(tokens), 400)]
        if len(chunks) > 24:
            raise ValueError('embedding_input_limit')
        vectors = []
        with torch.inference_mode():
            for start in range(0, len(chunks), 2):
                inputs = self.tokenizer([prefix+chunk for chunk in chunks[start:start+2]], padding=True, return_tensors='pt')
                hidden = self.model(**inputs).last_hidden_state
                mask = inputs['attention_mask'].unsqueeze(-1).bool()
                pooled = hidden.masked_fill(~mask, 0).sum(dim=1) / mask.sum(dim=1)
                vectors.extend(pooled)
            vector = torch.nn.functional.normalize(torch.stack(vectors).mean(dim=0), dim=0).tolist()
        validate_vector(vector)
        return vector
