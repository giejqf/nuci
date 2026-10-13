#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Gracefully stop a lab VM through its monitor socket.
# Usage: stop.sh [--name N]
set -euo pipefail
. "$(dirname "$0")/common.sh"

NAME="nuci"
[ "${1:-}" = "--name" ] && NAME="$2"
PIDFILE="$RUN_DIR/$NAME.pid"
MON="$RUN_DIR/$NAME.mon"

# start.sh boots the VM again whenever QEMU exits, unless this file exists
# (also between two boots, when no QEMU process is running).
[ -d "$RUN_DIR" ] && touch "$RUN_DIR/$NAME.stop"

if [ ! -f "$PIDFILE" ] || ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
	log "$NAME not running"
	rm -f "$PIDFILE"
	exit 0
fi
pid="$(cat "$PIDFILE")"
if [ -S "$MON" ]; then
	printf 'system_powerdown\n' | socat - "UNIX-CONNECT:$MON" >/dev/null 2>&1 || true
	for _ in $(seq 1 20); do
		kill -0 "$pid" 2>/dev/null || break
		sleep 1
	done
	kill -0 "$pid" 2>/dev/null && { printf 'quit\n' | socat - "UNIX-CONNECT:$MON" >/dev/null 2>&1 || true; }
	sleep 1
fi
kill -0 "$pid" 2>/dev/null && kill "$pid"
rm -f "$PIDFILE"
log "stopped $NAME"
