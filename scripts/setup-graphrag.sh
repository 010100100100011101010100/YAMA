#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
python3 -m venv .venv-graphrag
.venv-graphrag/bin/python -m pip install -r requirements-graphrag.lock
.venv-graphrag/bin/python -m pip check
.venv-graphrag/bin/python - <<'PY'
from pathlib import Path
import json
import re

environment = Path('.env.local')
contents = environment.read_text() if environment.exists() else ''
key = 'YAMA_GRAPHRAG_PYTHON'
# Keep the venv entry point: resolving its symlink would bypass the virtual environment.
interpreter = str(Path.cwd() / '.venv-graphrag/bin/python')
if not re.search(r'^YAMA_GRAPHRAG_PYTHON=.+$', contents, re.M):
    contents = re.sub(r'^YAMA_GRAPHRAG_PYTHON=.*\n?', '', contents, flags=re.M)
    environment.write_text(contents.rstrip() + '\n' + key + '=' + json.dumps(interpreter) + '\n')
    environment.chmod(0o600)
print('GraphRAG SDK interpreter configured; existing settings preserved.')
PY
