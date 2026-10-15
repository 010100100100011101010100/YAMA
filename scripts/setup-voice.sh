#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
python3 -m venv .venv-voice
.venv-voice/bin/python -m pip install -r requirements-voice.lock
.venv-voice/bin/python -m pip check
