#!/usr/bin/env bash
set -euo pipefail
cp /run/yama/mongo-key /tmp/yama-mongo-key
chmod 400 /tmp/yama-mongo-key
chown mongodb:mongodb /tmp/yama-mongo-key
exec /usr/local/bin/docker-entrypoint.sh mongod --port 27018 --bind_ip_all \
  --replSet yama-rs --keyFile /tmp/yama-mongo-key --auth --wiredTigerCacheSizeGB 0.25
