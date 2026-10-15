#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
voice_source_dir="$PWD/.local/runtime/src/livekit-v1.13.9"
voice_binary="$PWD/.local/runtime/bin/livekit-server"
voice_commit=6fbe7f7e648aab4b2f734d6044a416bc2cbc482c
mkdir -p .local/runtime/src .local/runtime/bin
if [ ! -d "$voice_source_dir" ]; then
  git clone --depth 1 --branch v1.13.9 https://github.com/livekit/livekit.git "$voice_source_dir"
fi
if [ "$(git -C "$voice_source_dir" rev-parse HEAD)" != "$voice_commit" ]; then
  echo "Unexpected LiveKit source revision. Existing checkout preserved." >&2
  exit 1
fi
# Use a verified, scoped Go toolchain; do not replace the system Go installation.
cd "$voice_source_dir"
GOMAXPROCS=2 GOTOOLCHAIN=go1.26.0 GOSUMDB=sum.golang.org GOPROXY=https://proxy.golang.org go build -p 2 -trimpath -o "$voice_binary" ./cmd/server
echo "Pinned local LiveKit server built. Start with npm run voice:server."
