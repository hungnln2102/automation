#!/usr/bin/env sh
# Mở tunnel để Beekeeper/script trên máy bạn dùng CÙNG URL với shell trên VPS:
#   postgresql://USER:PASS@127.0.0.1:6432/DBNAME
# Mặc định forward local :6432 -> 127.0.0.1:6432 trên remote.
#
# Usage:
#   scripts/db-tunnel.sh root@161.248.146.6
#   LOCAL_PORT=16432 scripts/db-tunnel.sh root@vps.example.com

set -e
REMOTE="${1:?Usage: db-tunnel.sh user@hostname}"
LOCAL="${LOCAL_PORT:-6432}"
REMOTE_PG_PORT="${REMOTE_PG_PORT:-6432}"

exec ssh -N -o ExitOnForwardFailure=yes -L "${LOCAL}:127.0.0.1:${REMOTE_PG_PORT}" "$REMOTE"
