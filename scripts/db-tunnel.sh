#!/usr/bin/env sh
# Mở tunnel để Beekeeper/script trên máy bạn dùng CÙNG URL với shell trên VPS:
#   postgresql://USER:PASS@127.0.0.1:5432/DBNAME
# Mặc định forward local :5432 -> 127.0.0.1:5432 trên remote.
#
# Usage:
#   scripts/db-tunnel.sh root@161.248.146.6
#   LOCAL_PORT=15432 scripts/db-tunnel.sh root@vps.example.com

set -e
REMOTE="${1:?Usage: db-tunnel.sh user@hostname}"
LOCAL="${LOCAL_PORT:-5432}"
REMOTE_PG_PORT="${REMOTE_PG_PORT:-5432}"

exec ssh -N -o ExitOnForwardFailure=yes -L "${LOCAL}:127.0.0.1:${REMOTE_PG_PORT}" "$REMOTE"
