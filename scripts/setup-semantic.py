"""Download pinned MIT model assets, optionally without writing local configuration."""
import argparse
import json
import re
from pathlib import Path
from huggingface_hub import snapshot_download

MODEL = 'intfloat/multilingual-e5-small'
REVISION = '614241f622f53c4eeff9890bdc4f31cfecc418b3'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', default='.local/models/multilingual-e5-small')
parser.add_argument('--no-env', action='store_true', help='Download model files without reading or writing .env.local.')
arguments = parser.parse_args()
directory = Path(arguments.directory).absolute()
snapshot_download(MODEL, revision=REVISION, local_dir=str(directory),
    allow_patterns=['config.json', 'model.safetensors', 'tokenizer.json', 'tokenizer_config.json',
                    'special_tokens_map.json', 'sentencepiece.bpe.model', 'README.md'])
(directory / 'yama-model.json').write_text(json.dumps({'model': MODEL, 'revision': REVISION, 'license': 'MIT', 'dimensions': 384}))
if not arguments.no_env:
    environment = Path('.env.local')
    contents = environment.read_text()
    if not re.search(r'^YAMA_SEMANTIC_MODEL_PATH=.+$', contents, re.M):
        contents = re.sub(r'^YAMA_SEMANTIC_MODEL_PATH=.*\n?', '', contents, flags=re.M)
        environment.write_text(contents.rstrip() + '\nYAMA_SEMANTIC_MODEL_PATH=' + json.dumps(str(directory)) + '\n')
        environment.chmod(0o600)
print('Pinned local embedding model installed; semantic retrieval remains separately configurable.')
